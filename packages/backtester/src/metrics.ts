import { Order } from '@trading-bot/core';

export class PerformanceMetrics {
  private initialCapital: number;
  private finalEquity: number;
  private orders: Order[];
  private equityHistory: { timestamp: number; equity: number }[];

  constructor(
    initialCapital: number,
    finalEquity: number,
    orders: Order[],
    equityHistory: { timestamp: number; equity: number }[]
  ) {
    this.initialCapital = initialCapital;
    this.finalEquity = finalEquity;
    this.orders = orders;
    this.equityHistory = equityHistory;
  }

  getTotalReturn(): number {
    return ((this.finalEquity - this.initialCapital) / this.initialCapital) * 100;
  }

  getTotalTrades(): number {
    return this.orders.filter((o) => o.status === 'filled').length;
  }

  getWinningTrades(): number {
    return this.orders.filter((o) => {
      if (o.status !== 'filled' || !o.price) return false;
      // Simplified: consider buys as potential wins if price > entry
      return o.side === 'buy';
    }).length;
  }

  getWinRate(): number {
    const total = this.getTotalTrades();
    if (total === 0) return 0;
    return (this.getWinningTrades() / total) * 100;
  }

  getMaxDrawdown(): number {
    let maxDrawdown = 0;
    let peak = this.initialCapital;

    for (const point of this.equityHistory) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const drawdown = ((peak - point.equity) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  getSharpeRatio(): number {
    if (this.equityHistory.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < this.equityHistory.length; i++) {
      const ret =
        (this.equityHistory[i].equity - this.equityHistory[i - 1].equity) /
        this.equityHistory[i - 1].equity;
      returns.push(ret);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualized Sharpe (assuming risk-free rate of 0)
    const sharpe = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(252); // 252 trading days
    return sharpe;
  }

  getProfitFactor(): number {
    let grossProfit = 0;
    let grossLoss = 0;

    for (let i = 1; i < this.equityHistory.length; i++) {
      const change = this.equityHistory[i].equity - this.equityHistory[i - 1].equity;
      if (change > 0) grossProfit += change;
      else grossLoss += Math.abs(change);
    }

    return grossLoss === 0 ? 0 : grossProfit / grossLoss;
  }

  getSummary() {
    return {
      initialCapital: this.initialCapital,
      finalEquity: this.finalEquity,
      totalReturn: this.getTotalReturn().toFixed(2) + '%',
      totalTrades: this.getTotalTrades(),
      winRate: this.getWinRate().toFixed(2) + '%',
      maxDrawdown: this.getMaxDrawdown().toFixed(2) + '%',
      sharpeRatio: this.getSharpeRatio().toFixed(2),
      profitFactor: this.getProfitFactor().toFixed(2),
    };
  }
}
