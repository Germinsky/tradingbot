import { Order, Position, logger } from '@trading-bot/core';

export interface PositionSizerConfig {
  accountBalance: number;
  riskPerTrade: number; // Percentage (e.g., 0.02 for 2%)
  method: 'fixed' | 'kelly' | 'percent';
}

export class PositionSizer {
  private config: PositionSizerConfig;

  constructor(config: PositionSizerConfig) {
    this.config = config;
  }

  calculatePositionSize(
    entryPrice: number,
    stopLoss: number,
    winRate?: number,
    avgWin?: number,
    avgLoss?: number
  ): number {
    switch (this.config.method) {
      case 'fixed':
        return this.fixedPositionSize(entryPrice, stopLoss);
      case 'kelly':
        if (!winRate || !avgWin || !avgLoss) {
          logger.warn('Kelly criterion requires winRate, avgWin, avgLoss. Falling back to fixed.');
          return this.fixedPositionSize(entryPrice, stopLoss);
        }
        return this.kellyCriterion(entryPrice, stopLoss, winRate, avgWin, avgLoss);
      case 'percent':
        return this.percentOfEquity(entryPrice);
      default:
        return this.fixedPositionSize(entryPrice, stopLoss);
    }
  }

  private fixedPositionSize(entryPrice: number, stopLoss: number): number {
    const riskAmount = this.config.accountBalance * this.config.riskPerTrade;
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    return Math.floor(riskAmount / riskPerShare);
  }

  private kellyCriterion(
    entryPrice: number,
    stopLoss: number,
    winRate: number,
    avgWin: number,
    avgLoss: number
  ): number {
    // Kelly formula: f = (bp - q) / b
    // b = ratio of win to loss, p = win rate, q = loss rate
    const b = avgWin / avgLoss;
    const p = winRate;
    const q = 1 - winRate;
    const kelly = (b * p - q) / b;

    // Apply fractional Kelly (typically 0.25 to 0.5 of full Kelly)
    const fractionalKelly = Math.max(0, Math.min(kelly * 0.25, 0.1)); // Cap at 10%

    const positionValue = this.config.accountBalance * fractionalKelly;
    return Math.floor(positionValue / entryPrice);
  }

  private percentOfEquity(entryPrice: number): number {
    const positionValue = this.config.accountBalance * this.config.riskPerTrade;
    return Math.floor(positionValue / entryPrice);
  }

  updateAccountBalance(newBalance: number): void {
    this.config.accountBalance = newBalance;
    logger.info(`Account balance updated to ${newBalance}`);
  }
}
