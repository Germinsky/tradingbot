import { logger, Position } from '@trading-bot/core';
import { TradingStrategy } from '../trading-strategy.js';
import { Candle, Execution, LimitOrder, StrategyConfig } from '../types.js';

/**
 * Dynamic Grid Trading Strategy with ATR-based range adjustment
 * 
 * Features:
 * - Automatically adjusts grid levels based on ATR (Average True Range)
 * - Places buy and sell orders at grid levels
 * - Takes profit as price moves through grid
 * - Rebalances grid when price breaks out of range
 * - Risk management via position sizing
 * 
 * Parameters:
 * - gridLevels: Number of grid levels (default: 10)
 * - atrPeriod: Period for ATR calculation (default: 14)
 * - atrMultiplier: Multiplier for grid range (default: 2.0)
 * - orderSize: Size of each grid order (default: 0.1)
 * - rebalanceThreshold: Price % to trigger rebalance (default: 0.1)
 */
export class DynamicGridStrategy extends TradingStrategy {
  readonly name = 'DynamicGridStrategy';
  readonly version = '1.0.0';
  
  private gridLevels: number;
  private atrPeriod: number;
  private atrMultiplier: number;
  private orderSize: number;
  private rebalanceThreshold: number;
  
  // State
  private candles: Candle[] = [];
  private gridOrders: Map<number, { buyOrderId?: string; sellOrderId?: string }> = new Map();
  private gridPrices: number[] = [];
  private centerPrice: number = 0;
  private atr: number = 0;
  private lastPrice: number = 0;
  
  constructor(config: StrategyConfig) {
    super(config);
    
    const params = config.params;
    this.gridLevels = params.gridLevels || 10;
    this.atrPeriod = params.atrPeriod || 14;
    this.atrMultiplier = params.atrMultiplier || 2.0;
    this.orderSize = params.orderSize || 0.1;
    this.rebalanceThreshold = params.rebalanceThreshold || 0.1;
    
    logger.info(`${this.name} parameters:`, {
      gridLevels: this.gridLevels,
      atrPeriod: this.atrPeriod,
      atrMultiplier: this.atrMultiplier,
      orderSize: this.orderSize,
      rebalanceThreshold: this.rebalanceThreshold,
    });
  }
  
  protected async onInitialize(): Promise<void> {
    logger.info(`Initializing ${this.name}...`);
    // Wait for enough candles to calculate ATR
  }
  
  protected async onShutdown(): Promise<void> {
    logger.info(`Shutting down ${this.name}...`);
    this.candles = [];
    this.gridOrders.clear();
    this.gridPrices = [];
  }
  
  protected handleCandle(candle: Candle): void {
    // Store candle for ATR calculation
    this.candles.push(candle);
    if (this.candles.length > this.atrPeriod * 2) {
      this.candles.shift();
    }
    
    this.lastPrice = candle.close;
    
    // Calculate ATR if we have enough data
    if (this.candles.length >= this.atrPeriod) {
      this.atr = this.calculateATR();
      
      // Initialize or rebalance grid
      if (this.gridPrices.length === 0) {
        this.initializeGrid(candle.close);
        this.placeGridOrders(candle.symbol);
      } else {
        this.checkRebalance(candle.close, candle.symbol);
      }
      
      // Check for grid level crosses
      this.checkGridCrosses(candle);
    }
  }
  
  protected handleOrderFill(fill: Execution): void {
    logger.info(`Grid order filled:`, fill);
    
    // Find which grid level this order belongs to
    for (const [level, orders] of this.gridOrders) {
      if (orders.buyOrderId === fill.orderId || orders.sellOrderId === fill.orderId) {
        // Order filled, place opposite order at same level
        if (orders.buyOrderId === fill.orderId) {
          // Buy order filled, place sell order
          logger.info(`Buy filled at level ${level}, placing sell order`);
          this.placeSellOrder(fill.symbol, this.gridPrices[level]);
        } else {
          // Sell order filled, place buy order
          logger.info(`Sell filled at level ${level}, placing buy order`);
          this.placeBuyOrder(fill.symbol, this.gridPrices[level]);
        }
        break;
      }
    }
  }
  
  protected handlePositionUpdate(position: Position): void {
    logger.debug(`Position updated:`, {
      symbol: position.symbol,
      quantity: position.quantity,
      pnl: position.unrealizedPnL,
    });
  }
  
  protected onReset(): void {
    this.candles = [];
    this.gridOrders.clear();
    this.gridPrices = [];
    this.centerPrice = 0;
    this.atr = 0;
    this.lastPrice = 0;
  }
  
  /**
   * Calculate Average True Range
   */
  private calculateATR(): number {
    if (this.candles.length < this.atrPeriod) {
      return 0;
    }
    
    let atrSum = 0;
    for (let i = this.candles.length - this.atrPeriod; i < this.candles.length; i++) {
      const candle = this.candles[i];
      const prevClose = i > 0 ? this.candles[i - 1].close : candle.open;
      
      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevClose),
        Math.abs(candle.low - prevClose)
      );
      
      atrSum += tr;
    }
    
    return atrSum / this.atrPeriod;
  }
  
  /**
   * Initialize grid levels based on current price and ATR
   */
  private initializeGrid(currentPrice: number): void {
    this.centerPrice = currentPrice;
    this.gridPrices = [];
    
    const range = this.atr * this.atrMultiplier;
    const gridSpacing = (range * 2) / (this.gridLevels - 1);
    
    const startPrice = currentPrice - range;
    
    for (let i = 0; i < this.gridLevels; i++) {
      const price = startPrice + (i * gridSpacing);
      this.gridPrices.push(price);
    }
    
    logger.info(`Grid initialized:`, {
      centerPrice: this.centerPrice,
      atr: this.atr,
      range: range,
      gridSpacing: gridSpacing,
      levels: this.gridPrices,
    });
  }
  
  /**
   * Place grid orders at all levels
   */
  private placeGridOrders(symbol: string): void {
    this.gridPrices.forEach((price, index) => {
      // Place buy orders below center, sell orders above
      if (price < this.centerPrice) {
        this.placeBuyOrder(symbol, price, index);
      } else if (price > this.centerPrice) {
        this.placeSellOrder(symbol, price, index);
      }
    });
  }
  
  /**
   * Place a buy order at a grid level
   */
  private placeBuyOrder(symbol: string, price: number, level?: number): void {
    const order: LimitOrder = {
      symbol,
      side: 'buy',
      quantity: this.orderSize,
      price,
      postOnly: true,
    };
    
    this.executeOrder(order);
    
    if (level !== undefined) {
      const existing = this.gridOrders.get(level) || {};
      existing.buyOrderId = `buy-${level}-${Date.now()}`;
      this.gridOrders.set(level, existing);
    }
  }
  
  /**
   * Place a sell order at a grid level
   */
  private placeSellOrder(symbol: string, price: number, level?: number): void {
    const order: LimitOrder = {
      symbol,
      side: 'sell',
      quantity: this.orderSize,
      price,
      postOnly: true,
    };
    
    this.executeOrder(order);
    
    if (level !== undefined) {
      const existing = this.gridOrders.get(level) || {};
      existing.sellOrderId = `sell-${level}-${Date.now()}`;
      this.gridOrders.set(level, existing);
    }
  }
  
  /**
   * Check if grid needs rebalancing
   */
  private checkRebalance(currentPrice: number, symbol: string): void {
    const priceChange = Math.abs(currentPrice - this.centerPrice) / this.centerPrice;
    
    if (priceChange > this.rebalanceThreshold) {
      logger.info(`Rebalancing grid - price moved ${(priceChange * 100).toFixed(2)}%`, {
        oldCenter: this.centerPrice,
        newCenter: currentPrice,
      });
      
      // Cancel all existing orders (in production, emit cancel events)
      this.gridOrders.clear();
      
      // Reinitialize grid
      this.initializeGrid(currentPrice);
      this.placeGridOrders(symbol);
    }
  }
  
  /**
   * Check if price crossed any grid levels
   */
  private checkGridCrosses(candle: Candle): void {
    // Check each grid level for crosses
    this.gridPrices.forEach((price, level) => {
      // Skip if we don't have a previous price
      if (this.lastPrice === 0) return;
      
      // Check for upward cross (buy signal filled)
      if (this.lastPrice <= price && candle.close > price) {
        logger.debug(`Price crossed grid level ${level} upward at ${price}`);
      }
      
      // Check for downward cross (sell signal filled)
      if (this.lastPrice >= price && candle.close < price) {
        logger.debug(`Price crossed grid level ${level} downward at ${price}`);
      }
    });
  }
}
