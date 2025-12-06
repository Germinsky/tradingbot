import { EventEmitter } from 'events';
import { logger } from '@trading-bot/core';
import { RiskManager, RiskManagerConfig } from '@trading-bot/risk-engine';
import {
  ITradingStrategy,
  StrategyMode,
  StrategyConfig,
  StrategyStats,
  Candle,
  Execution,
  MarketOrder,
  LimitOrder,
} from './types.js';
import { Position } from '@trading-bot/core';

/**
 * Abstract base class for all trading strategies
 * 
 * Features:
 * - Event-driven architecture via EventEmitter
 * - Built-in risk management integration
 * - Mode detection (backtest vs live)
 * - Performance tracking
 * - Order execution abstraction
 * - Hot-reload support
 */
export abstract class TradingStrategy extends EventEmitter implements ITradingStrategy {
  abstract readonly name: string;
  abstract readonly version: string;
  
  readonly mode: StrategyMode;
  protected config: StrategyConfig;
  protected riskManager: RiskManager;
  
  // Performance tracking
  private stats: StrategyStats = {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalPnL: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
  };
  
  private trades: Array<{ pnl: number; timestamp: number }> = [];
  private positions: Map<string, Position> = new Map();
  private initialized: boolean = false;
  
  constructor(config: StrategyConfig) {
    super();
    this.config = config;
    this.mode = config.mode;
    
    // Initialize risk manager
    const riskConfig: RiskManagerConfig = config.riskConfig || {
      positionSizer: {
        method: 'fixed',
        accountBalance: 10000,
        fixedAmount: 1000,
        riskPercent: 0.02,
      },
      drawdownMonitor: {
        maxDrawdownPercent: 0.2,
        resetOnNewHigh: true,
        circuitBreakerDuration: 3600000,
      },
      maxPositionSize: 10,
      stopLossPercent: 0.05,
      takeProfitPercent: 0.1,
    };
    
    this.riskManager = new RiskManager(riskConfig);
    
    // Note: name and version will be set by subclass
    logger.info(`Strategy initialized in ${this.mode} mode`, {
      symbols: config.symbols,
      params: config.params,
    });
  }
  
  /**
   * Initialize strategy (called once before execution)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn(`${this.name} already initialized`);
      return;
    }
    
    logger.info(`Initializing ${this.name}...`);
    await this.onInitialize();
    this.initialized = true;
    this.emit('initialized');
  }
  
  /**
   * Shutdown strategy gracefully
   */
  async shutdown(): Promise<void> {
    logger.info(`Shutting down ${this.name}...`);
    await this.onShutdown();
    this.removeAllListeners();
    this.emit('shutdown');
  }
  
  /**
   * Handle incoming candle data
   */
  onCandle(candle: Candle): void {
    try {
      this.validateCandle(candle);
      this.handleCandle(candle);
      this.emit('candle', candle);
    } catch (error) {
      logger.error(`Error handling candle in ${this.name}:`, error);
      this.emit('error', error);
    }
  }
  
  /**
   * Handle order fill/execution
   */
  onOrderFill(fill: Execution): void {
    try {
      logger.info(`Order filled in ${this.name}:`, fill);
      this.handleOrderFill(fill);
      this.updateStats(fill);
      this.emit('orderFill', fill);
    } catch (error) {
      logger.error(`Error handling order fill in ${this.name}:`, error);
      this.emit('error', error);
    }
  }
  
  /**
   * Handle position update
   */
  onPositionUpdate(position: Position): void {
    try {
      this.positions.set(position.symbol, position);
      this.riskManager.updatePosition(position);
      this.handlePositionUpdate(position);
      this.emit('positionUpdate', position);
    } catch (error) {
      logger.error(`Error handling position update in ${this.name}:`, error);
      this.emit('error', error);
    }
  }
  
  /**
   * Execute a market order
   */
  protected async executeOrder(order: MarketOrder | LimitOrder): Promise<void> {
    try {
      // Convert to internal order format
      const internalOrder = this.convertToInternalOrder(order);
      
      // Validate with risk manager
      if (!this.riskManager.validateOrder(internalOrder)) {
        logger.warn(`Order rejected by risk manager:`, order);
        this.emit('orderRejected', order);
        return;
      }
      
      // In backtest mode, emit for simulation engine to handle
      // In live mode, emit for exchange connector to handle
      if (this.mode === StrategyMode.BACKTEST) {
        this.emit('backtestOrder', order);
      } else {
        this.emit('order', order);
      }
      
      logger.info(`Order executed by ${this.name}:`, order);
    } catch (error) {
      logger.error(`Error executing order in ${this.name}:`, error);
      this.emit('error', error);
    }
  }
  
  /**
   * Get current strategy statistics
   */
  getStats(): StrategyStats {
    return { ...this.stats };
  }
  
  /**
   * Reset strategy state (useful for backtesting)
   */
  reset(): void {
    this.stats = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
    };
    this.trades = [];
    this.positions.clear();
    this.onReset();
    this.emit('reset');
  }
  
  /**
   * Check if strategy is in backtest mode
   */
  protected isBacktest(): boolean {
    return this.mode === StrategyMode.BACKTEST;
  }
  
  /**
   * Check if strategy is in live mode
   */
  protected isLive(): boolean {
    return this.mode === StrategyMode.LIVE;
  }
  
  /**
   * Check if strategy is in paper trading mode
   */
  protected isPaper(): boolean {
    return this.mode === StrategyMode.PAPER;
  }
  
  /**
   * Get current position for symbol
   */
  protected getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }
  
  /**
   * Get all current positions
   */
  protected getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }
  
  // Abstract methods that child strategies must implement
  protected abstract onInitialize(): Promise<void>;
  protected abstract onShutdown(): Promise<void>;
  protected abstract handleCandle(candle: Candle): void;
  protected abstract handleOrderFill(fill: Execution): void;
  protected abstract handlePositionUpdate(position: Position): void;
  protected abstract onReset(): void;
  
  // Helper methods
  private validateCandle(candle: Candle): void {
    if (!candle.symbol || !candle.timestamp || !candle.close) {
      throw new Error('Invalid candle data');
    }
  }
  
  private convertToInternalOrder(order: MarketOrder | LimitOrder): any {
    return {
      id: `${this.name}-${Date.now()}`,
      symbol: order.symbol,
      side: order.side,
      type: 'price' in order ? 'limit' : 'market',
      quantity: order.quantity,
      price: 'price' in order ? order.price : undefined,
      status: 'pending',
      timestamp: Date.now(),
    };
  }
  
  private updateStats(fill: Execution): void {
    // Update trade count
    this.stats.totalTrades++;
    
    // Calculate PnL for closed positions
    const position = this.positions.get(fill.symbol);
    if (position) {
      const pnl = position.realizedPnL;
      this.stats.totalPnL += pnl;
      
      if (pnl > 0) {
        this.stats.winningTrades++;
      } else if (pnl < 0) {
        this.stats.losingTrades++;
      }
      
      this.trades.push({ pnl, timestamp: fill.timestamp });
    }
    
    // Calculate derived metrics
    this.calculateDerivedStats();
  }
  
  private calculateDerivedStats(): void {
    if (this.stats.totalTrades === 0) return;
    
    // Win rate
    this.stats.winRate = this.stats.winningTrades / this.stats.totalTrades;
    
    // Average win/loss
    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl < 0);
    
    this.stats.avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length
      : 0;
    
    this.stats.avgLoss = losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length)
      : 0;
    
    // Profit factor
    const totalWins = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    this.stats.profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;
    
    // Sharpe ratio (simplified)
    if (this.trades.length > 1) {
      const returns = this.trades.map(t => t.pnl);
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      this.stats.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    }
    
    // Max drawdown
    let peak = 0;
    let maxDD = 0;
    let cumPnL = 0;
    
    for (const trade of this.trades) {
      cumPnL += trade.pnl;
      if (cumPnL > peak) {
        peak = cumPnL;
      }
      const drawdown = (peak - cumPnL) / peak;
      if (drawdown > maxDD) {
        maxDD = drawdown;
      }
    }
    
    this.stats.maxDrawdown = maxDD;
  }
}
