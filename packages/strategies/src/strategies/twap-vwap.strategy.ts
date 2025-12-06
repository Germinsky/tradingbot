import { logger, Position } from '@trading-bot/core';
import { TradingStrategy } from '../trading-strategy.js';
import { Candle, Execution, MarketOrder, StrategyConfig, DexQuote } from '../types.js';

/**
 * TWAP (Time-Weighted Average Price) / VWAP (Volume-Weighted Average Price) 
 * Execution Algorithm with DEX Routing
 * 
 * Features:
 * - Smart order splitting to minimize market impact
 * - TWAP: Equal-sized orders over time intervals
 * - VWAP: Order sizes based on historical volume patterns
 * - DEX routing optimization using 0x and 1inch aggregators
 * - Slippage protection
 * - Adaptive execution based on market conditions
 * 
 * Parameters:
 * - totalSize: Total order size to execute
 * - duration: Time duration for execution (seconds)
 * - intervals: Number of execution intervals
 * - mode: 'twap' or 'vwap'
 * - maxSlippage: Maximum allowed slippage (default: 0.005 = 0.5%)
 * - useAggregator: '0x' | '1inch' | 'auto'
 * - minChunkSize: Minimum order size per execution
 */
export class TWAPVWAPStrategy extends TradingStrategy {
  readonly name = 'TWAPVWAPStrategy';
  readonly version = '1.0.0';
  
  private totalSize: number;
  private duration: number;
  private intervals: number;
  private executionMode: 'twap' | 'vwap';
  private maxSlippage: number;
  private useAggregator: '0x' | '1inch' | 'auto';
  private minChunkSize: number;
  
  // State
  private targetSymbol: string;
  private targetSide: 'buy' | 'sell';
  private executedSize: number = 0;
  private startTime: number = 0;
  private intervalDuration: number = 0;
  private currentInterval: number = 0;
  private intervalTimer: NodeJS.Timeout | null = null;
  private volumeProfile: number[] = [];
  private candles: Candle[] = [];
  private executionStarted: boolean = false;
  
  constructor(config: StrategyConfig) {
    super(config);
    
    const params = config.params;
    this.totalSize = params.totalSize;
    this.duration = params.duration;
    this.intervals = params.intervals;
    this.executionMode = params.mode || 'twap';
    this.maxSlippage = params.maxSlippage || 0.005;
    this.useAggregator = params.useAggregator || 'auto';
    this.minChunkSize = params.minChunkSize || 0.01;
    
    this.targetSymbol = config.symbols[0];
    this.targetSide = params.side || 'buy';
    
    this.intervalDuration = (this.duration * 1000) / this.intervals;
    
    logger.info(`${this.name} parameters:`, {
      totalSize: this.totalSize,
      duration: this.duration,
      intervals: this.intervals,
      executionMode: this.executionMode,
      maxSlippage: this.maxSlippage,
      aggregator: this.useAggregator,
      intervalDuration: this.intervalDuration,
    });
  }
  
  protected async onInitialize(): Promise<void> {
    logger.info(`Initializing ${this.name}...`);
    
    if (this.executionMode === 'vwap') {
      // For VWAP, we need historical volume data
      logger.info('Loading historical volume data for VWAP calculation...');
    }
  }
  
  protected async onShutdown(): Promise<void> {
    logger.info(`Shutting down ${this.name}...`);
    
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
  
  protected handleCandle(candle: Candle): void {
    // Store candles for volume analysis
    this.candles.push(candle);
    if (this.candles.length > 100) {
      this.candles.shift();
    }
    
    // Start execution on first candle if not started
    if (!this.executionStarted && this.candles.length >= 10) {
      this.startExecution();
    }
    
    // Update volume profile for VWAP
    if (this.executionMode === 'vwap') {
      this.updateVolumeProfile();
    }
  }
  
  protected handleOrderFill(fill: Execution): void {
    logger.info(`TWAP/VWAP order filled:`, fill);
    
    this.executedSize += fill.quantity;
    
    const progress = (this.executedSize / this.totalSize) * 100;
    logger.info(`Execution progress: ${progress.toFixed(2)}% (${this.executedSize}/${this.totalSize})`);
    
    // Check if execution is complete
    if (this.executedSize >= this.totalSize) {
      logger.info('TWAP/VWAP execution completed!');
      this.stopExecution();
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
    this.executedSize = 0;
    this.startTime = 0;
    this.currentInterval = 0;
    this.volumeProfile = [];
    this.candles = [];
    this.executionStarted = false;
    
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
  
  /**
   * Start the execution algorithm
   */
  private startExecution(): void {
    if (this.executionStarted) return;
    
    this.executionStarted = true;
    this.startTime = Date.now();
    
    logger.info(`Starting ${this.executionMode.toUpperCase()} execution:`, {
      totalSize: this.totalSize,
      duration: this.duration,
      intervals: this.intervals,
      intervalDuration: this.intervalDuration,
    });
    
    // Execute first interval immediately
    this.executeInterval();
    
    // Schedule remaining intervals
    this.intervalTimer = setInterval(() => {
      this.executeInterval();
    }, this.intervalDuration);
  }
  
  /**
   * Stop the execution algorithm
   */
  private stopExecution(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    
    this.executionStarted = false;
    
    const elapsedTime = (Date.now() - this.startTime) / 1000;
    logger.info(`Execution completed in ${elapsedTime.toFixed(2)}s`);
    
    this.emit('executionComplete', {
      totalSize: this.totalSize,
      executedSize: this.executedSize,
      duration: elapsedTime,
      mode: this.executionMode,
    });
  }
  
  /**
   * Execute one interval
   */
  private async executeInterval(): Promise<void> {
    this.currentInterval++;
    
    // Calculate remaining size
    const remainingSize = this.totalSize - this.executedSize;
    if (remainingSize <= 0) {
      this.stopExecution();
      return;
    }
    
    // Calculate chunk size based on mode
    let chunkSize: number;
    
    if (this.executionMode === 'twap') {
      // Equal-sized chunks
      const remainingIntervals = this.intervals - this.currentInterval + 1;
      chunkSize = remainingSize / remainingIntervals;
    } else {
      // VWAP: Size based on volume profile
      chunkSize = this.calculateVWAPChunkSize(remainingSize);
    }
    
    // Ensure minimum chunk size
    chunkSize = Math.max(chunkSize, this.minChunkSize);
    
    // Don't exceed remaining size
    chunkSize = Math.min(chunkSize, remainingSize);
    
    logger.info(`Executing interval ${this.currentInterval}/${this.intervals}:`, {
      chunkSize,
      remainingSize,
      executedSize: this.executedSize,
    });
    
    // Get best route from DEX aggregators
    const quote = await this.getBestDexRoute(chunkSize);
    
    if (quote) {
      // Execute the order
      await this.executeChunk(chunkSize, quote);
    } else {
      // Fallback to simple market order
      await this.executeChunk(chunkSize);
    }
  }
  
  /**
   * Calculate chunk size for VWAP based on volume profile
   */
  private calculateVWAPChunkSize(remainingSize: number): number {
    if (this.volumeProfile.length === 0) {
      // Fallback to equal sizing if no volume data
      const remainingIntervals = this.intervals - this.currentInterval + 1;
      return remainingSize / remainingIntervals;
    }
    
    // Calculate expected volume for current interval
    const currentHour = new Date().getHours();
    const volumeWeight = this.volumeProfile[currentHour] || 1;
    
    // Total remaining volume weight
    const remainingIntervals = this.intervals - this.currentInterval + 1;
    const avgVolumeWeight = this.volumeProfile.reduce((a, b) => a + b, 0) / this.volumeProfile.length;
    const totalRemainingWeight = avgVolumeWeight * remainingIntervals;
    
    // Size proportional to volume
    return (remainingSize * volumeWeight) / totalRemainingWeight;
  }
  
  /**
   * Update volume profile from historical candles
   */
  private updateVolumeProfile(): void {
    // Build 24-hour volume profile
    const hourlyVolume: { [hour: number]: number[] } = {};
    
    for (const candle of this.candles) {
      const hour = new Date(candle.timestamp).getHours();
      if (!hourlyVolume[hour]) {
        hourlyVolume[hour] = [];
      }
      hourlyVolume[hour].push(candle.volume);
    }
    
    // Calculate average volume per hour
    this.volumeProfile = [];
    for (let hour = 0; hour < 24; hour++) {
      const volumes = hourlyVolume[hour] || [1];
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      this.volumeProfile[hour] = avgVolume;
    }
  }
  
  /**
   * Get best DEX route using aggregators
   */
  private async getBestDexRoute(size: number): Promise<DexQuote | null> {
    if (this.isBacktest()) {
      // In backtest mode, return simulated quote
      return null;
    }
    
    try {
      const [baseToken, quoteToken] = this.targetSymbol.split('/');
      
      // Query aggregators based on configuration
      const quotes: DexQuote[] = [];
      
      if (this.useAggregator === '0x' || this.useAggregator === 'auto') {
        const zeroXQuote = await this.get0xQuote(baseToken, quoteToken, size);
        if (zeroXQuote) quotes.push(zeroXQuote);
      }
      
      if (this.useAggregator === '1inch' || this.useAggregator === 'auto') {
        const oneInchQuote = await this.get1inchQuote(baseToken, quoteToken, size);
        if (oneInchQuote) quotes.push(oneInchQuote);
      }
      
      if (quotes.length === 0) {
        return null;
      }
      
      // Select best quote (highest output amount for buy, lowest for sell)
      const bestQuote = quotes.reduce((best, current) => {
        if (this.targetSide === 'buy') {
          return parseFloat(current.outputAmount) > parseFloat(best.outputAmount) ? current : best;
        } else {
          return parseFloat(current.outputAmount) < parseFloat(best.outputAmount) ? current : best;
        }
      });
      
      logger.info(`Best DEX route selected:`, {
        protocol: bestQuote.protocol,
        price: bestQuote.price,
        estimatedGas: bestQuote.estimatedGas,
        route: bestQuote.route,
      });
      
      return bestQuote;
      
    } catch (error) {
      logger.error('Error fetching DEX routes:', error);
      return null;
    }
  }
  
  /**
   * Get quote from 0x API
   */
  private async get0xQuote(
    baseToken: string,
    quoteToken: string,
    size: number
  ): Promise<DexQuote | null> {
    // In production, call 0x API
    // This is a placeholder
    logger.debug('Fetching 0x quote...');
    return null;
  }
  
  /**
   * Get quote from 1inch API
   */
  private async get1inchQuote(
    baseToken: string,
    quoteToken: string,
    size: number
  ): Promise<DexQuote | null> {
    // In production, call 1inch API
    // This is a placeholder
    logger.debug('Fetching 1inch quote...');
    return null;
  }
  
  /**
   * Execute a chunk with optional DEX routing
   */
  private async executeChunk(size: number, quote?: DexQuote): Promise<void> {
    // Check slippage if quote provided
    if (quote && this.candles.length > 0) {
      const currentPrice = this.candles[this.candles.length - 1].close;
      const quotedPrice = quote.price;
      const slippage = Math.abs(quotedPrice - currentPrice) / currentPrice;
      
      if (slippage > this.maxSlippage) {
        logger.warn(`Slippage too high: ${(slippage * 100).toFixed(2)}%, skipping interval`);
        return;
      }
    }
    
    // Execute order
    const order: MarketOrder = {
      symbol: this.targetSymbol,
      side: this.targetSide,
      quantity: size,
      timeInForce: 'IOC', // Immediate or cancel
    };
    
    await this.executeOrder(order);
  }
}
