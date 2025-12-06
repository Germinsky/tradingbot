import { EventEmitter } from 'events';
import { Candle } from './data-loader';
import { SlippageModel, OrderFill } from './slippage-model';
import { Trade, EquityPoint, PerformanceMetrics, MetricsCalculator } from './metrics-calculator';

export interface BacktestConfig {
  initialEquity: number;
  commission: number; // Basis points
  slippage?: {
    constantBps: number;
    impactBps: number;
    minSlippage: number;
    maxSlippage: number;
  };
  rebalanceInterval?: number; // In milliseconds (e.g., 86400000 for daily)
  maxPositions?: number;
  riskPerTrade?: number; // Percentage of equity per trade
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  entryTime: number;
  quantity: number;
  strategy: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface StrategySignal {
  timestamp: number;
  symbol: string;
  action: 'buy' | 'sell' | 'close';
  quantity?: number;
  stopLoss?: number;
  takeProfit?: number;
  strategy: string;
}

export interface PortfolioState {
  equity: number;
  cash: number;
  positions: Map<string, Position>;
  highWaterMark: number;
  drawdown: number;
}

export class HighPerformanceBacktester extends EventEmitter {
  private config: BacktestConfig;
  private slippageModel: SlippageModel;
  private portfolio: PortfolioState;
  private trades: Trade[] = [];
  private equityCurve: EquityPoint[] = [];
  private strategies: Map<string, IBacktestStrategy> = new Map();
  private currentCandle: Candle | null = null;
  private lastRebalance: number = 0;

  constructor(config: BacktestConfig) {
    super();
    this.config = config;
    this.slippageModel = new SlippageModel(config.slippage);
    this.portfolio = {
      equity: config.initialEquity,
      cash: config.initialEquity,
      positions: new Map(),
      highWaterMark: config.initialEquity,
      drawdown: 0,
    };
  }

  /**
   * Register a strategy for backtesting
   */
  registerStrategy(name: string, strategy: IBacktestStrategy): void {
    this.strategies.set(name, strategy);
    strategy.initialize?.(this.config.initialEquity);
  }

  /**
   * Run backtest on historical candle data
   */
  async run(candles: Candle[]): Promise<{
    metrics: PerformanceMetrics;
    trades: Trade[];
    equityCurve: EquityPoint[];
  }> {
    console.log(`🎯 Starting backtest with ${candles.length} candles`);
    
    const startTime = Date.now();
    this.reset();

    // Main event loop
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      this.currentCandle = candle;

      // Update portfolio value with current prices
      this.updatePortfolioValue(candle);

      // Check stop losses and take profits
      this.checkExits(candle);

      // Get signals from all strategies
      const signals = await this.getStrategySignals(candle, i, candles);

      // Process rebalancing if needed
      if (this.shouldRebalance(candle.timestamp)) {
        await this.rebalancePortfolio(signals, candle);
      } else {
        // Process individual signals
        for (const signal of signals) {
          await this.processSignal(signal, candle);
        }
      }

      // Record equity snapshot
      this.recordEquity(candle.timestamp);

      // Emit progress
      if (i % 1000 === 0) {
        this.emit('progress', {
          processed: i,
          total: candles.length,
          equity: this.portfolio.equity,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Backtest complete in ${(duration / 1000).toFixed(2)}s`);
    console.log(`   Processed ${candles.length} candles, ${this.trades.length} trades`);

    // Calculate metrics
    const durationDays = (candles[candles.length - 1].timestamp - candles[0].timestamp) / 86400000;
    const calculator = new MetricsCalculator(this.config.initialEquity);
    const metrics = calculator.calculateMetrics(this.trades, this.equityCurve, durationDays);

    return {
      metrics,
      trades: this.trades,
      equityCurve: this.equityCurve,
    };
  }

  private async getStrategySignals(
    candle: Candle,
    index: number,
    allCandles: Candle[]
  ): Promise<StrategySignal[]> {
    const signals: StrategySignal[] = [];

    for (const [name, strategy] of this.strategies.entries()) {
      try {
        const signal = await strategy.onCandle(candle, index, allCandles, this.portfolio);
        if (signal) {
          signals.push({
            ...signal,
            strategy: name,
          });
        }
      } catch (error) {
        console.error(`Error in strategy ${name}:`, error);
      }
    }

    return signals;
  }

  private async processSignal(signal: StrategySignal, candle: Candle): Promise<void> {
    if (signal.action === 'close') {
      this.closePosition(signal.symbol, signal.strategy, candle);
      return;
    }

    const side = signal.action === 'buy' ? 'long' : 'short';
    const existingPosition = this.portfolio.positions.get(signal.symbol);

    // Close opposite position if exists
    if (existingPosition && existingPosition.side !== side) {
      this.closePosition(signal.symbol, signal.strategy, candle);
    }

    // Don't open new position if we already have one
    if (existingPosition && existingPosition.side === side) {
      return;
    }

    // Check max positions limit
    if (this.config.maxPositions && this.portfolio.positions.size >= this.config.maxPositions) {
      return;
    }

    // Calculate position size
    const quantity = signal.quantity ?? this.calculatePositionSize(candle.close, signal.stopLoss);

    if (quantity <= 0) return;

    // Simulate fill with slippage
    const fill = this.slippageModel.calculateMarketFill(
      signal.action,
      quantity,
      candle,
      candle.timestamp,
      signal.symbol
    );

    const cost = fill.filledPrice * fill.filledQuantity + fill.fees;

    if (cost > this.portfolio.cash) {
      // Not enough cash
      return;
    }

    // Open position
    const position: Position = {
      symbol: signal.symbol,
      side,
      entryPrice: fill.filledPrice,
      entryTime: candle.timestamp,
      quantity: fill.filledQuantity,
      strategy: signal.strategy,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
    };

    this.portfolio.positions.set(signal.symbol, position);
    this.portfolio.cash -= cost;

    this.emit('positionOpened', position);
  }

  private closePosition(symbol: string, strategy: string, candle: Candle): void {
    const position = this.portfolio.positions.get(symbol);
    if (!position) return;

    // Simulate fill
    const exitSide = position.side === 'long' ? 'sell' : 'buy';
    const fill = this.slippageModel.calculateMarketFill(
      exitSide,
      position.quantity,
      candle,
      candle.timestamp,
      symbol
    );

    const proceeds = fill.filledPrice * fill.filledQuantity - fill.fees;
    this.portfolio.cash += proceeds;

    // Calculate P&L
    let pnl: number;
    if (position.side === 'long') {
      pnl = (fill.filledPrice - position.entryPrice) * position.quantity - fill.fees;
    } else {
      pnl = (position.entryPrice - fill.filledPrice) * position.quantity - fill.fees;
    }

    const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;

    // Record trade
    const trade: Trade = {
      entryTime: position.entryTime,
      exitTime: candle.timestamp,
      symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: fill.filledPrice,
      quantity: position.quantity,
      pnl,
      pnlPercent,
      fees: fill.fees,
      slippage: fill.slippageBps,
      duration: candle.timestamp - position.entryTime,
      strategy: position.strategy,
    };

    this.trades.push(trade);
    this.portfolio.positions.delete(symbol);

    this.emit('positionClosed', trade);
  }

  private checkExits(candle: Candle): void {
    for (const [symbol, position] of this.portfolio.positions.entries()) {
      // Check stop loss
      if (position.stopLoss) {
        if (position.side === 'long' && candle.low <= position.stopLoss) {
          this.closePosition(symbol, position.strategy, candle);
          continue;
        }
        if (position.side === 'short' && candle.high >= position.stopLoss) {
          this.closePosition(symbol, position.strategy, candle);
          continue;
        }
      }

      // Check take profit
      if (position.takeProfit) {
        if (position.side === 'long' && candle.high >= position.takeProfit) {
          this.closePosition(symbol, position.strategy, candle);
          continue;
        }
        if (position.side === 'short' && candle.low <= position.takeProfit) {
          this.closePosition(symbol, position.strategy, candle);
          continue;
        }
      }
    }
  }

  private updatePortfolioValue(candle: Candle): void {
    let positionsValue = 0;

    for (const position of this.portfolio.positions.values()) {
      if (position.symbol === candle.symbol) {
        let unrealizedPnl: number;
        if (position.side === 'long') {
          unrealizedPnl = (candle.close - position.entryPrice) * position.quantity;
        } else {
          unrealizedPnl = (position.entryPrice - candle.close) * position.quantity;
        }
        positionsValue += position.entryPrice * position.quantity + unrealizedPnl;
      } else {
        // Use entry price for other symbols (not updated this candle)
        positionsValue += position.entryPrice * position.quantity;
      }
    }

    this.portfolio.equity = this.portfolio.cash + positionsValue;
    
    // Update high water mark and drawdown
    if (this.portfolio.equity > this.portfolio.highWaterMark) {
      this.portfolio.highWaterMark = this.portfolio.equity;
    }
    this.portfolio.drawdown = this.portfolio.highWaterMark - this.portfolio.equity;
  }

  private recordEquity(timestamp: number): void {
    this.equityCurve.push({
      timestamp,
      equity: this.portfolio.equity,
      highWaterMark: this.portfolio.highWaterMark,
      drawdown: this.portfolio.drawdown,
    });
  }

  private calculatePositionSize(price: number, stopLoss?: number): number {
    const riskPercent = this.config.riskPerTrade ?? 2; // Default 2%
    const riskAmount = this.portfolio.equity * (riskPercent / 100);

    if (stopLoss) {
      // Position size based on stop loss distance
      const stopDistance = Math.abs(price - stopLoss);
      return riskAmount / stopDistance;
    } else {
      // Fixed percentage of equity
      return (riskAmount / price);
    }
  }

  private shouldRebalance(timestamp: number): boolean {
    if (!this.config.rebalanceInterval) return false;
    return timestamp - this.lastRebalance >= this.config.rebalanceInterval;
  }

  private async rebalancePortfolio(signals: StrategySignal[], candle: Candle): Promise<void> {
    // Close all positions
    for (const [symbol, position] of this.portfolio.positions.entries()) {
      this.closePosition(symbol, position.strategy, candle);
    }

    // Open new positions based on signals
    for (const signal of signals) {
      if (signal.action !== 'close') {
        await this.processSignal(signal, candle);
      }
    }

    this.lastRebalance = candle.timestamp;
    this.emit('rebalanced', { timestamp: candle.timestamp, signals: signals.length });
  }

  private reset(): void {
    this.portfolio = {
      equity: this.config.initialEquity,
      cash: this.config.initialEquity,
      positions: new Map(),
      highWaterMark: this.config.initialEquity,
      drawdown: 0,
    };
    this.trades = [];
    this.equityCurve = [];
    this.lastRebalance = 0;
  }

  getPortfolio(): PortfolioState {
    return { ...this.portfolio };
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  getEquityCurve(): EquityPoint[] {
    return [...this.equityCurve];
  }
}

/**
 * Interface that strategies must implement
 */
export interface IBacktestStrategy {
  initialize?(initialEquity: number): void;
  
  onCandle(
    candle: Candle,
    index: number,
    allCandles: Candle[],
    portfolio: PortfolioState
  ): Promise<StrategySignal | null>;
  
  onTradeComplete?(trade: Trade): void;
}
