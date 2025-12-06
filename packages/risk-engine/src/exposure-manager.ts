import { logger } from '@trading-bot/core';
import { ExposureLimitsConfig, BlacklistConfig } from './config.schema.js';

export interface StrategyExposure {
  strategyName: string;
  totalValue: number;
  positions: Array<{
    symbol: string;
    value: number;
    leverage: number;
  }>;
}

export interface TokenExposure {
  token: string;
  totalValue: number;
  count: number;
}

/**
 * Exposure Limits Manager
 * Tracks and enforces position limits across strategies, tokens, and correlations
 */
export class ExposureManager {
  private config: ExposureLimitsConfig;
  private blacklist: BlacklistConfig;
  private strategyExposures: Map<string, StrategyExposure> = new Map();
  private tokenExposures: Map<string, TokenExposure> = new Map();
  private tokenCorrelations: Map<string, Map<string, number>> = new Map();
  private totalPortfolioValue: number = 0;

  constructor(config: ExposureLimitsConfig, blacklist: BlacklistConfig) {
    this.config = config;
    this.blacklist = blacklist;
  }

  /**
   * Check if a new position would violate exposure limits
   */
  canOpenPosition(
    strategyName: string,
    symbol: string,
    value: number,
    leverage: number = 1
  ): { allowed: boolean; reason?: string } {
    // Check blacklists
    const blacklistCheck = this.checkBlacklist(strategyName, symbol);
    if (!blacklistCheck.allowed) {
      return blacklistCheck;
    }

    const effectiveValue = value * leverage;

    // Check total exposure
    const newTotalExposure = this.calculateTotalExposure() + effectiveValue;
    const totalExposureRatio = newTotalExposure / this.totalPortfolioValue;

    if (totalExposureRatio > this.config.maxTotalExposure) {
      return {
        allowed: false,
        reason: `Total exposure ${totalExposureRatio.toFixed(2)}x exceeds limit ${this.config.maxTotalExposure}x`,
      };
    }

    // Check per-strategy exposure
    const strategyExposure = this.strategyExposures.get(strategyName);
    const newStrategyValue = (strategyExposure?.totalValue || 0) + effectiveValue;
    const strategyExposureRatio = newStrategyValue / this.totalPortfolioValue;

    if (strategyExposureRatio > this.config.maxPerStrategyExposure) {
      return {
        allowed: false,
        reason: `Strategy ${strategyName} exposure ${strategyExposureRatio.toFixed(2)} exceeds limit ${this.config.maxPerStrategyExposure}`,
      };
    }

    // Check per-token exposure
    const token = this.extractToken(symbol);
    const tokenExposure = this.tokenExposures.get(token);
    const newTokenValue = (tokenExposure?.totalValue || 0) + effectiveValue;
    const tokenExposureRatio = newTokenValue / this.totalPortfolioValue;

    if (tokenExposureRatio > this.config.maxPerTokenExposure) {
      return {
        allowed: false,
        reason: `Token ${token} exposure ${tokenExposureRatio.toFixed(2)} exceeds limit ${this.config.maxPerTokenExposure}`,
      };
    }

    // Check correlated exposure
    const correlatedExposure = this.calculateCorrelatedExposure(token, effectiveValue);
    const correlatedRatio = correlatedExposure / this.totalPortfolioValue;

    if (correlatedRatio > this.config.maxCorrelatedExposure) {
      return {
        allowed: false,
        reason: `Correlated exposure ${correlatedRatio.toFixed(2)} exceeds limit ${this.config.maxCorrelatedExposure}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Register a new position
   */
  addPosition(
    strategyName: string,
    symbol: string,
    value: number,
    leverage: number = 1
  ): void {
    const effectiveValue = value * leverage;
    const token = this.extractToken(symbol);

    // Update strategy exposure
    const strategyExposure = this.strategyExposures.get(strategyName) || {
      strategyName,
      totalValue: 0,
      positions: [],
    };

    strategyExposure.positions.push({ symbol, value: effectiveValue, leverage });
    strategyExposure.totalValue += effectiveValue;
    this.strategyExposures.set(strategyName, strategyExposure);

    // Update token exposure
    const tokenExposure = this.tokenExposures.get(token) || {
      token,
      totalValue: 0,
      count: 0,
    };

    tokenExposure.totalValue += effectiveValue;
    tokenExposure.count += 1;
    this.tokenExposures.set(token, tokenExposure);

    logger.info('Position added to exposure tracking', {
      strategy: strategyName,
      symbol,
      value: effectiveValue,
      leverage,
    });
  }

  /**
   * Remove a position
   */
  removePosition(strategyName: string, symbol: string, value: number, leverage: number = 1): void {
    const effectiveValue = value * leverage;
    const token = this.extractToken(symbol);

    // Update strategy exposure
    const strategyExposure = this.strategyExposures.get(strategyName);
    if (strategyExposure) {
      strategyExposure.positions = strategyExposure.positions.filter((p) => p.symbol !== symbol);
      strategyExposure.totalValue -= effectiveValue;

      if (strategyExposure.totalValue <= 0) {
        this.strategyExposures.delete(strategyName);
      }
    }

    // Update token exposure
    const tokenExposure = this.tokenExposures.get(token);
    if (tokenExposure) {
      tokenExposure.totalValue -= effectiveValue;
      tokenExposure.count -= 1;

      if (tokenExposure.count <= 0) {
        this.tokenExposures.delete(token);
      }
    }

    logger.info('Position removed from exposure tracking', {
      strategy: strategyName,
      symbol,
      value: effectiveValue,
    });
  }

  /**
   * Calculate total portfolio exposure
   */
  calculateTotalExposure(): number {
    let total = 0;
    for (const exposure of this.strategyExposures.values()) {
      total += exposure.totalValue;
    }
    return total;
  }

  /**
   * Calculate exposure to correlated assets
   */
  private calculateCorrelatedExposure(token: string, additionalValue: number): number {
    let correlatedValue = additionalValue;

    // Add current token exposure
    const currentExposure = this.tokenExposures.get(token);
    if (currentExposure) {
      correlatedValue += currentExposure.totalValue;
    }

    // Find correlated tokens
    const correlations = this.tokenCorrelations.get(token);
    if (!correlations) {
      return correlatedValue;
    }

    for (const [otherToken, correlation] of correlations.entries()) {
      if (Math.abs(correlation) >= this.config.correlationThreshold) {
        const otherExposure = this.tokenExposures.get(otherToken);
        if (otherExposure) {
          correlatedValue += otherExposure.totalValue * Math.abs(correlation);
        }
      }
    }

    return correlatedValue;
  }

  /**
   * Set correlation between two tokens
   */
  setTokenCorrelation(token1: string, token2: string, correlation: number): void {
    if (!this.tokenCorrelations.has(token1)) {
      this.tokenCorrelations.set(token1, new Map());
    }
    if (!this.tokenCorrelations.has(token2)) {
      this.tokenCorrelations.set(token2, new Map());
    }

    this.tokenCorrelations.get(token1)!.set(token2, correlation);
    this.tokenCorrelations.get(token2)!.set(token1, correlation);
  }

  /**
   * Check blacklist
   */
  private checkBlacklist(
    strategyName: string,
    symbol: string
  ): { allowed: boolean; reason?: string } {
    const token = this.extractToken(symbol);

    if (this.blacklist.tokens.includes(token)) {
      return {
        allowed: false,
        reason: `Token ${token} is blacklisted`,
      };
    }

    if (this.blacklist.strategies.includes(strategyName)) {
      return {
        allowed: false,
        reason: `Strategy ${strategyName} is blacklisted`,
      };
    }

    return { allowed: true };
  }

  /**
   * Add token to blacklist
   */
  blacklistToken(token: string, reason?: string): void {
    if (!this.blacklist.tokens.includes(token)) {
      this.blacklist.tokens.push(token);
      logger.warn(`Token ${token} added to blacklist`, { reason });
    }
  }

  /**
   * Add strategy to blacklist
   */
  blacklistStrategy(strategyName: string, reason?: string): void {
    if (!this.blacklist.strategies.includes(strategyName)) {
      this.blacklist.strategies.push(strategyName);
      logger.warn(`Strategy ${strategyName} added to blacklist`, { reason });
    }
  }

  /**
   * Extract token from symbol (e.g., "ETH/USD" -> "ETH")
   */
  private extractToken(symbol: string): string {
    return symbol.split('/')[0] || symbol;
  }

  /**
   * Update portfolio value
   */
  updatePortfolioValue(value: number): void {
    this.totalPortfolioValue = value;
  }

  /**
   * Get exposure summary
   */
  getExposureSummary(): {
    totalExposure: number;
    totalExposureRatio: number;
    strategies: StrategyExposure[];
    tokens: TokenExposure[];
  } {
    const totalExposure = this.calculateTotalExposure();

    return {
      totalExposure,
      totalExposureRatio: this.totalPortfolioValue > 0 ? totalExposure / this.totalPortfolioValue : 0,
      strategies: Array.from(this.strategyExposures.values()),
      tokens: Array.from(this.tokenExposures.values()),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExposureLimitsConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Exposure limits configuration updated', config);
  }
}
