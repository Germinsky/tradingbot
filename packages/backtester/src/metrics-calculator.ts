import { OrderFill } from './slippage-model';

export interface Trade {
  entryTime: number;
  exitTime: number;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  slippage: number;
  duration: number;
  strategy: string;
}

export interface PerformanceMetrics {
  // Returns
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  
  // Risk metrics
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  
  // Advanced metrics
  avgTradeDuration: number;
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  
  // Equity curve points
  equityCurve: EquityPoint[];
  underwaterCurve: number[];
  monthlyReturns: MonthlyReturn[];
  
  // Per-strategy breakdown
  strategyMetrics: Map<string, StrategyMetrics>;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  highWaterMark: number;
  drawdown: number;
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
  trades: number;
}

export interface StrategyMetrics {
  strategyName: string;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  winRate: number;
}

export class MetricsCalculator {
  private initialEquity: number;

  constructor(initialEquity: number) {
    this.initialEquity = initialEquity;
  }

  calculateMetrics(
    trades: Trade[],
    equityCurve: EquityPoint[],
    durationDays: number
  ): PerformanceMetrics {
    if (trades.length === 0 || equityCurve.length === 0) {
      return this.getEmptyMetrics();
    }

    const finalEquity = equityCurve[equityCurve.length - 1].equity;
    const totalReturn = finalEquity - this.initialEquity;
    const totalReturnPercent = (totalReturn / this.initialEquity) * 100;

    // Annualized return
    const years = durationDays / 365;
    const annualizedReturn = years > 0 
      ? (Math.pow(finalEquity / this.initialEquity, 1 / years) - 1) * 100 
      : 0;

    // Calculate returns for Sharpe/Sortino
    const returns = this.calculateReturns(equityCurve);
    const avgReturn = this.mean(returns);
    const stdDev = this.standardDeviation(returns);
    const downside = this.downsideDeviation(returns);

    // Risk-adjusted metrics
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    const sortinoRatio = downside > 0 ? (avgReturn / downside) * Math.sqrt(252) : 0;

    // Drawdown metrics
    const { maxDrawdown, maxDrawdownPercent } = this.calculateMaxDrawdown(equityCurve);
    const calmarRatio = maxDrawdownPercent > 0 
      ? annualizedReturn / maxDrawdownPercent 
      : 0;

    // Trade statistics
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    const avgWin = winningTrades.length > 0 
      ? totalWins / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0 
      ? totalLosses / losingTrades.length 
      : 0;

    // Trade duration
    const avgTradeDuration = trades.length > 0
      ? trades.reduce((sum, t) => sum + t.duration, 0) / trades.length
      : 0;

    // Best/worst trades
    const bestTrade = trades.length > 0
      ? Math.max(...trades.map(t => t.pnl))
      : 0;
    const worstTrade = trades.length > 0
      ? Math.min(...trades.map(t => t.pnl))
      : 0;

    // Consecutive wins/losses
    const { maxWins, maxLosses } = this.calculateConsecutive(trades);

    // Underwater curve (drawdown over time)
    const underwaterCurve = equityCurve.map(p => p.drawdown);

    // Monthly returns
    const monthlyReturns = this.calculateMonthlyReturns(equityCurve);

    // Per-strategy metrics
    const strategyMetrics = this.calculateStrategyMetrics(trades, equityCurve);

    return {
      totalReturn,
      totalReturnPercent,
      annualizedReturn,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      maxDrawdown,
      maxDrawdownPercent,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      avgTradeDuration,
      bestTrade,
      worstTrade,
      consecutiveWins: maxWins,
      consecutiveLosses: maxLosses,
      equityCurve,
      underwaterCurve,
      monthlyReturns,
      strategyMetrics,
    };
  }

  private calculateReturns(equityCurve: EquityPoint[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const ret = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
      returns.push(ret);
    }
    return returns;
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squaredDiffs));
  }

  private downsideDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const negativeValues = values.filter(v => v < 0);
    if (negativeValues.length === 0) return 0;
    const squaredDiffs = negativeValues.map(v => Math.pow(v, 2));
    return Math.sqrt(this.mean(squaredDiffs));
  }

  private calculateMaxDrawdown(equityCurve: EquityPoint[]): {
    maxDrawdown: number;
    maxDrawdownPercent: number;
  } {
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    for (const point of equityCurve) {
      if (point.drawdown > maxDrawdown) {
        maxDrawdown = point.drawdown;
        maxDrawdownPercent = (point.drawdown / point.highWaterMark) * 100;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  private calculateConsecutive(trades: Trade[]): {
    maxWins: number;
    maxLosses: number;
  } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const trade of trades) {
      if (trade.pnl > 0) {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      }
    }

    return { maxWins, maxLosses };
  }

  private calculateMonthlyReturns(equityCurve: EquityPoint[]): MonthlyReturn[] {
    const monthlyMap = new Map<string, { equity: number[]; trades: number }>();

    for (const point of equityCurve) {
      const date = new Date(point.timestamp);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { equity: [], trades: 0 });
      }
      monthlyMap.get(key)!.equity.push(point.equity);
    }

    const monthlyReturns: MonthlyReturn[] = [];
    for (const [key, data] of monthlyMap.entries()) {
      const [year, month] = key.split('-').map(Number);
      const startEquity = data.equity[0];
      const endEquity = data.equity[data.equity.length - 1];
      const ret = ((endEquity - startEquity) / startEquity) * 100;

      monthlyReturns.push({
        year,
        month,
        return: ret,
        trades: data.trades,
      });
    }

    return monthlyReturns.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }

  private calculateStrategyMetrics(
    trades: Trade[],
    equityCurve: EquityPoint[]
  ): Map<string, StrategyMetrics> {
    const strategyMap = new Map<string, Trade[]>();

    for (const trade of trades) {
      if (!strategyMap.has(trade.strategy)) {
        strategyMap.set(trade.strategy, []);
      }
      strategyMap.get(trade.strategy)!.push(trade);
    }

    const metrics = new Map<string, StrategyMetrics>();

    for (const [strategyName, strategyTrades] of strategyMap.entries()) {
      const totalReturn = strategyTrades.reduce((sum, t) => sum + t.pnl, 0);
      const returns = strategyTrades.map(t => t.pnlPercent / 100);
      const avgReturn = this.mean(returns);
      const stdDev = this.standardDeviation(returns);
      const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

      // Calculate strategy-specific drawdown
      let maxDD = 0;
      let peak = 0;
      let equity = this.initialEquity;
      for (const trade of strategyTrades) {
        equity += trade.pnl;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDD) maxDD = dd;
      }

      const winningTrades = strategyTrades.filter(t => t.pnl > 0);
      const winRate = strategyTrades.length > 0 
        ? (winningTrades.length / strategyTrades.length) * 100 
        : 0;

      metrics.set(strategyName, {
        strategyName,
        totalReturn,
        sharpeRatio,
        maxDrawdown: maxDD,
        totalTrades: strategyTrades.length,
        winRate,
      });
    }

    return metrics;
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      totalReturn: 0,
      totalReturnPercent: 0,
      annualizedReturn: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      avgTradeDuration: 0,
      bestTrade: 0,
      worstTrade: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      equityCurve: [],
      underwaterCurve: [],
      monthlyReturns: [],
      strategyMetrics: new Map(),
    };
  }
}
