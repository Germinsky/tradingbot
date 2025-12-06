import { logger } from '@trading-bot/core';
import { KellyConfig } from './config.schema.js';

export interface TradeStats {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
}

/**
 * Kelly Criterion position sizer with fractional Kelly support
 * Optimizes position size based on historical win rate and risk/reward
 */
export class KellySizer {
  private config: KellyConfig;
  private tradeHistory: Array<{ profit: number; win: boolean }> = [];

  constructor(config: KellyConfig) {
    this.config = config;
  }

  /**
   * Calculate optimal position size using Kelly Criterion
   * Formula: f* = (bp - q) / b
   * Where: b = win/loss ratio, p = win probability, q = loss probability
   */
  calculatePositionSize(
    accountBalance: number,
    entryPrice: number,
    stopLoss: number,
    stats?: TradeStats
  ): number {
    if (!this.config.enabled) {
      return this.fallbackPositionSize(accountBalance, entryPrice);
    }

    // Calculate from provided stats or trade history
    const tradeStats = stats || this.calculateStatsFromHistory();

    if (!tradeStats || tradeStats.totalTrades < 20) {
      logger.warn('Insufficient trade history for Kelly criterion, using fallback');
      return this.fallbackPositionSize(accountBalance, entryPrice);
    }

    // Validate win rate
    if (tradeStats.winRate < this.config.minWinRate) {
      logger.warn(
        `Win rate ${tradeStats.winRate.toFixed(2)} below minimum ${this.config.minWinRate}, using conservative sizing`
      );
      return this.fallbackPositionSize(accountBalance, entryPrice);
    }

    // Calculate Kelly percentage
    const b = tradeStats.avgWin / Math.abs(tradeStats.avgLoss);
    const p = tradeStats.winRate;
    const q = 1 - p;

    let kelly = (b * p - q) / b;

    // Handle negative Kelly (unfavorable odds)
    if (kelly <= 0) {
      logger.warn('Kelly criterion is negative, trade has negative expectancy');
      return 0;
    }

    // Apply fractional Kelly for risk management
    kelly *= this.config.fractionalKelly;

    // Cap at max position percent
    kelly = Math.min(kelly, this.config.maxPositionPercent);

    const positionValue = accountBalance * kelly;
    const positionSize = positionValue / entryPrice;

    logger.info('Kelly position sizing', {
      kelly: kelly.toFixed(4),
      fractionalKelly: this.config.fractionalKelly,
      winRate: tradeStats.winRate.toFixed(2),
      avgWin: tradeStats.avgWin.toFixed(2),
      avgLoss: tradeStats.avgLoss.toFixed(2),
      positionSize: positionSize.toFixed(4),
    });

    return positionSize;
  }

  /**
   * Calculate full Kelly with risk metrics
   */
  calculateKellyWithMetrics(stats: TradeStats): {
    kelly: number;
    fractionalKelly: number;
    expectedValue: number;
    sharpe: number;
  } {
    const b = stats.avgWin / Math.abs(stats.avgLoss);
    const p = stats.winRate;
    const q = 1 - p;

    const kelly = Math.max(0, (b * p - q) / b);
    const fractionalKelly = kelly * this.config.fractionalKelly;
    const expectedValue = p * stats.avgWin + q * stats.avgLoss;

    // Simplified Sharpe estimate
    const avgReturn = expectedValue;
    const stdDev = Math.sqrt(p * Math.pow(stats.avgWin, 2) + q * Math.pow(stats.avgLoss, 2));
    const sharpe = stdDev > 0 ? avgReturn / stdDev : 0;

    return {
      kelly,
      fractionalKelly,
      expectedValue,
      sharpe,
    };
  }

  /**
   * Add trade result to history for ongoing Kelly optimization
   */
  addTradeResult(profit: number, entryPrice: number): void {
    const win = profit > 0;
    this.tradeHistory.push({ profit, win });

    // Keep last 1000 trades
    if (this.tradeHistory.length > 1000) {
      this.tradeHistory.shift();
    }
  }

  /**
   * Calculate trade statistics from history
   */
  private calculateStatsFromHistory(): TradeStats | null {
    if (this.tradeHistory.length < 20) {
      return null;
    }

    const wins = this.tradeHistory.filter((t) => t.win);
    const losses = this.tradeHistory.filter((t) => !t.win);

    if (wins.length === 0 || losses.length === 0) {
      return null;
    }

    const winRate = wins.length / this.tradeHistory.length;
    const avgWin = wins.reduce((sum, t) => sum + t.profit, 0) / wins.length;
    const avgLoss = losses.reduce((sum, t) => sum + t.profit, 0) / losses.length;

    return {
      winRate,
      avgWin,
      avgLoss,
      totalTrades: this.tradeHistory.length,
    };
  }

  /**
   * Fallback to simple fixed percentage when Kelly cannot be calculated
   */
  private fallbackPositionSize(accountBalance: number, entryPrice: number): number {
    const fallbackPercent = 0.02; // 2% of account
    const positionValue = accountBalance * fallbackPercent;
    return positionValue / entryPrice;
  }

  /**
   * Get current trade statistics
   */
  getTradeStats(): TradeStats | null {
    return this.calculateStatsFromHistory();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<KellyConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Kelly configuration updated', config);
  }
}
