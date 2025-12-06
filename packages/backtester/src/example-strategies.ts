import { Candle } from './data-loader';
import { IBacktestStrategy, StrategySignal, PortfolioState } from './high-performance-backtester';
import { Trade } from './metrics-calculator';

/**
 * Simple Moving Average Crossover Strategy
 */
export class SMAStrategy implements IBacktestStrategy {
  private shortPeriod: number;
  private longPeriod: number;
  private smaShort: number[] = [];
  private smaLong: number[] = [];

  constructor(shortPeriod: number = 20, longPeriod: number = 50) {
    this.shortPeriod = shortPeriod;
    this.longPeriod = longPeriod;
  }

  initialize(): void {
    this.smaShort = [];
    this.smaLong = [];
  }

  async onCandle(
    candle: Candle,
    index: number,
    allCandles: Candle[],
    portfolio: PortfolioState
  ): Promise<StrategySignal | null> {
    // Need enough history
    if (index < this.longPeriod) {
      return null;
    }

    // Calculate SMAs
    const shortSMA = this.calculateSMA(allCandles, index, this.shortPeriod);
    const longSMA = this.calculateSMA(allCandles, index, this.longPeriod);

    this.smaShort.push(shortSMA);
    this.smaLong.push(longSMA);

    // Need at least 2 periods to detect crossover
    if (this.smaShort.length < 2) {
      return null;
    }

    const prevShort = this.smaShort[this.smaShort.length - 2];
    const prevLong = this.smaLong[this.smaLong.length - 2];

    const hasPosition = portfolio.positions.has(candle.symbol);

    // Golden cross: short SMA crosses above long SMA
    if (prevShort <= prevLong && shortSMA > longSMA && !hasPosition) {
      return {
        timestamp: candle.timestamp,
        symbol: candle.symbol,
        action: 'buy',
        stopLoss: candle.close * 0.95, // 5% stop loss
        takeProfit: candle.close * 1.15, // 15% take profit
        strategy: 'SMA',
      };
    }

    // Death cross: short SMA crosses below long SMA
    if (prevShort >= prevLong && shortSMA < longSMA && hasPosition) {
      return {
        timestamp: candle.timestamp,
        symbol: candle.symbol,
        action: 'close',
        strategy: 'SMA',
      };
    }

    return null;
  }

  private calculateSMA(candles: Candle[], currentIndex: number, period: number): number {
    let sum = 0;
    for (let i = currentIndex - period + 1; i <= currentIndex; i++) {
      sum += candles[i].close;
    }
    return sum / period;
  }
}

/**
 * Mean Reversion Strategy (Bollinger Bands)
 */
export class MeanReversionStrategy implements IBacktestStrategy {
  private period: number;
  private stdDev: number;

  constructor(period: number = 20, stdDev: number = 2) {
    this.period = period;
    this.stdDev = stdDev;
  }

  initialize(): void {}

  async onCandle(
    candle: Candle,
    index: number,
    allCandles: Candle[],
    portfolio: PortfolioState
  ): Promise<StrategySignal | null> {
    if (index < this.period) {
      return null;
    }

    const { middle, upper, lower } = this.calculateBollingerBands(allCandles, index);
    const hasPosition = portfolio.positions.has(candle.symbol);

    // Buy when price touches lower band
    if (candle.close <= lower && !hasPosition) {
      return {
        timestamp: candle.timestamp,
        symbol: candle.symbol,
        action: 'buy',
        stopLoss: lower * 0.97,
        takeProfit: middle,
        strategy: 'MeanReversion',
      };
    }

    // Sell when price reaches middle or upper band
    if (hasPosition && (candle.close >= middle || candle.close >= upper)) {
      return {
        timestamp: candle.timestamp,
        symbol: candle.symbol,
        action: 'close',
        strategy: 'MeanReversion',
      };
    }

    return null;
  }

  private calculateBollingerBands(
    candles: Candle[],
    currentIndex: number
  ): { middle: number; upper: number; lower: number } {
    let sum = 0;
    for (let i = currentIndex - this.period + 1; i <= currentIndex; i++) {
      sum += candles[i].close;
    }
    const middle = sum / this.period;

    // Calculate standard deviation
    let variance = 0;
    for (let i = currentIndex - this.period + 1; i <= currentIndex; i++) {
      variance += Math.pow(candles[i].close - middle, 2);
    }
    const std = Math.sqrt(variance / this.period);

    return {
      middle,
      upper: middle + this.stdDev * std,
      lower: middle - this.stdDev * std,
    };
  }
}

/**
 * Momentum Strategy (RSI-based)
 */
export class MomentumStrategy implements IBacktestStrategy {
  private period: number;
  private overbought: number;
  private oversold: number;
  private prices: number[] = [];

  constructor(period: number = 14, oversold: number = 30, overbought: number = 70) {
    this.period = period;
    this.overbought = overbought;
    this.oversold = oversold;
  }

  initialize(): void {
    this.prices = [];
  }

  async onCandle(
    candle: Candle,
    index: number,
    allCandles: Candle[],
    portfolio: PortfolioState
  ): Promise<StrategySignal | null> {
    this.prices.push(candle.close);

    if (this.prices.length < this.period + 1) {
      return null;
    }

    const rsi = this.calculateRSI();
    const hasPosition = portfolio.positions.has(candle.symbol);

    // Buy when RSI is oversold
    if (rsi < this.oversold && !hasPosition) {
      return {
        timestamp: candle.timestamp,
        symbol: candle.symbol,
        action: 'buy',
        stopLoss: candle.close * 0.93,
        strategy: 'Momentum',
      };
    }

    // Sell when RSI is overbought
    if (rsi > this.overbought && hasPosition) {
      return {
        timestamp: candle.timestamp,
        symbol: candle.symbol,
        action: 'close',
        strategy: 'Momentum',
      };
    }

    return null;
  }

  private calculateRSI(): number {
    const changes: number[] = [];
    for (let i = this.prices.length - this.period; i < this.prices.length; i++) {
      changes.push(this.prices[i] - this.prices[i - 1]);
    }

    const gains = changes.filter(c => c > 0).reduce((sum, c) => sum + c, 0) / this.period;
    const losses = Math.abs(changes.filter(c => c < 0).reduce((sum, c) => sum + c, 0)) / this.period;

    if (losses === 0) return 100;

    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }
}
