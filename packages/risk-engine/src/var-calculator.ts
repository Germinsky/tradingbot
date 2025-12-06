import { logger } from '@trading-bot/core';
import { VaRConfig } from './config.schema.js';

export interface VaRResult {
  historicalVaR: number;
  monteCarloVaR: number;
  cvar: number; // Conditional VaR (Expected Shortfall)
  confidence: number;
  timestamp: number;
}

export interface PriceReturn {
  timestamp: number;
  return: number;
  price: number;
}

/**
 * Value at Risk (VaR) and Conditional Value at Risk (CVaR) calculator
 * Supports both Historical and Monte Carlo simulation methods
 */
export class VaRCalculator {
  private config: VaRConfig;
  private priceHistory: PriceReturn[] = [];
  private lastCalculation: VaRResult | null = null;
  private calculationInterval: NodeJS.Timeout | null = null;

  constructor(config: VaRConfig) {
    this.config = config;
  }

  /**
   * Start real-time VaR monitoring
   */
  startMonitoring(callback: (result: VaRResult) => void): void {
    if (!this.config.enabled) {
      logger.warn('VaR monitoring is disabled');
      return;
    }

    this.calculationInterval = setInterval(() => {
      if (this.priceHistory.length >= 50) {
        const result = this.calculateVaR();
        if (result) {
          this.lastCalculation = result;
          callback(result);
        }
      }
    }, this.config.updateFrequencyMs);

    logger.info('VaR monitoring started', {
      frequency: `${this.config.updateFrequencyMs}ms`,
      method: this.config.method,
    });
  }

  /**
   * Stop real-time monitoring
   */
  stopMonitoring(): void {
    if (this.calculationInterval) {
      clearInterval(this.calculationInterval);
      this.calculationInterval = null;
      logger.info('VaR monitoring stopped');
    }
  }

  /**
   * Add new price data point
   */
  addPriceData(price: number, timestamp: number = Date.now()): void {
    if (this.priceHistory.length > 0) {
      const lastPrice = this.priceHistory[this.priceHistory.length - 1].price;
      const returnValue = (price - lastPrice) / lastPrice;

      this.priceHistory.push({
        timestamp,
        return: returnValue,
        price,
      });
    } else {
      // First data point
      this.priceHistory.push({
        timestamp,
        return: 0,
        price,
      });
    }

    // Keep only lookback period
    if (this.priceHistory.length > this.config.lookbackPeriod) {
      this.priceHistory.shift();
    }
  }

  /**
   * Calculate VaR using configured method(s)
   */
  calculateVaR(): VaRResult | null {
    if (this.priceHistory.length < 50) {
      logger.warn('Insufficient price history for VaR calculation');
      return null;
    }

    const returns = this.priceHistory.map((p) => p.return).slice(1); // Remove first zero return

    let historicalVaR = 0;
    let monteCarloVaR = 0;
    let cvar = 0;

    if (this.config.method === 'historical' || this.config.method === 'both') {
      historicalVaR = this.calculateHistoricalVaR(returns);
      cvar = this.calculateCVaR(returns, historicalVaR);
    }

    if (this.config.method === 'monte-carlo' || this.config.method === 'both') {
      monteCarloVaR = this.calculateMonteCarloVaR(returns);
    }

    const result: VaRResult = {
      historicalVaR,
      monteCarloVaR,
      cvar,
      confidence: this.config.confidenceLevel,
      timestamp: Date.now(),
    };

    logger.debug('VaR calculated', {
      historicalVaR: (historicalVaR * 100).toFixed(2) + '%',
      monteCarloVaR: (monteCarloVaR * 100).toFixed(2) + '%',
      cvar: (cvar * 100).toFixed(2) + '%',
    });

    return result;
  }

  /**
   * Historical VaR - Uses actual historical returns
   */
  private calculateHistoricalVaR(returns: number[]): number {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - this.config.confidenceLevel) * sorted.length);
    return Math.abs(sorted[index] || 0);
  }

  /**
   * Conditional VaR (CVaR) - Expected value of losses beyond VaR
   * Also known as Expected Shortfall
   */
  private calculateCVaR(returns: number[], varThreshold: number): number {
    const losses = returns.filter((r) => r <= -varThreshold);

    if (losses.length === 0) {
      return varThreshold;
    }

    const cvar = Math.abs(losses.reduce((sum, r) => sum + r, 0) / losses.length);
    return cvar;
  }

  /**
   * Monte Carlo VaR - Simulates future returns using historical parameters
   */
  private calculateMonteCarloVaR(returns: number[]): number {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    // Run Monte Carlo simulations
    const simulations: number[] = [];

    for (let i = 0; i < this.config.monteCarloSimulations; i++) {
      // Generate random return using Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const simulatedReturn = mean + z * stdDev;
      simulations.push(simulatedReturn);
    }

    // Calculate VaR from simulated returns
    const sorted = simulations.sort((a, b) => a - b);
    const index = Math.floor((1 - this.config.confidenceLevel) * sorted.length);
    return Math.abs(sorted[index] || 0);
  }

  /**
   * Get portfolio VaR given position size and current price
   */
  calculatePortfolioVaR(positionValue: number): {
    varAmount: number;
    cvarAmount: number;
    percentOfPortfolio: number;
  } {
    const result = this.lastCalculation || this.calculateVaR();

    if (!result) {
      return {
        varAmount: 0,
        cvarAmount: 0,
        percentOfPortfolio: 0,
      };
    }

    const varToUse =
      this.config.method === 'monte-carlo' ? result.monteCarloVaR : result.historicalVaR;

    return {
      varAmount: positionValue * varToUse,
      cvarAmount: positionValue * result.cvar,
      percentOfPortfolio: varToUse,
    };
  }

  /**
   * Get latest VaR calculation
   */
  getLatestVaR(): VaRResult | null {
    return this.lastCalculation;
  }

  /**
   * Check if current VaR is acceptable for a position
   */
  isVaRAcceptable(positionValue: number, maxAcceptableVaR: number): boolean {
    const portfolioVaR = this.calculatePortfolioVaR(positionValue);
    return portfolioVaR.varAmount <= maxAcceptableVaR;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VaRConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('VaR configuration updated', config);
  }

  /**
   * Clear price history
   */
  clearHistory(): void {
    this.priceHistory = [];
    this.lastCalculation = null;
    logger.info('VaR price history cleared');
  }
}
