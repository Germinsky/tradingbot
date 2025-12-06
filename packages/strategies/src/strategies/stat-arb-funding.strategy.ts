import { logger, Position } from '@trading-bot/core';
import { TradingStrategy } from '../trading-strategy.js';
import { Candle, Execution, MarketOrder, StrategyConfig, FundingRate, ArbitrageSignal } from '../types.js';

/**
 * Statistical Arbitrage Strategy between DEX Perpetual Funding Rates and Spot Basis
 * 
 * Strategy:
 * - Monitors funding rates across multiple perpetual DEXes (GMX, dYdX, Gains, etc.)
 * - Compares funding rate vs spot basis (spot price - perp price)
 * - Identifies arbitrage opportunities when funding rate diverges from fair value
 * - Mean reversion trading on funding rate spreads
 * - Market neutral through delta hedging
 * 
 * Features:
 * - Z-score based entry/exit signals
 * - Half-life calculation for mean reversion speed
 * - Cross-protocol arbitrage
 * - Real-time funding rate tracking
 * - Automatic position balancing
 * 
 * Parameters:
 * - protocols: List of perp protocols to monitor
 * - lookbackPeriod: Historical data for statistical analysis (hours)
 * - entryZScore: Z-score threshold for entry (default: 2.0)
 * - exitZScore: Z-score threshold for exit (default: 0.5)
 * - positionSize: Size per leg (default: 1.0)
 * - rebalanceThreshold: Delta threshold for rebalancing (default: 0.1)
 */
export class StatArbFundingStrategy extends TradingStrategy {
  readonly name = 'StatArbFundingStrategy';
  readonly version = '1.0.0';
  
  private protocols: string[];
  private lookbackPeriod: number;
  private entryZScore: number;
  private exitZScore: number;
  private positionSize: number;
  private rebalanceThreshold: number;
  
  // State
  private fundingRates: Map<string, FundingRate[]> = new Map();
  private spotPrices: Map<string, number> = new Map();
  private perpPrices: Map<string, Map<string, number>> = new Map();
  private spreads: Map<string, number[]> = new Map();
  private activeSignals: Map<string, ArbitrageSignal> = new Map();
  private arbPositions: Map<string, { spot: number; perp: number; protocol: string }> = new Map();
  
  constructor(config: StrategyConfig) {
    super(config);
    
    const params = config.params;
    this.protocols = params.protocols || ['gmx', 'dydx', 'gains', 'perp-protocol', 'kwenta'];
    this.lookbackPeriod = params.lookbackPeriod || 24;
    this.entryZScore = params.entryZScore || 2.0;
    this.exitZScore = params.exitZScore || 0.5;
    this.positionSize = params.positionSize || 1.0;
    this.rebalanceThreshold = params.rebalanceThreshold || 0.1;
    
    logger.info(`${this.name} parameters:`, {
      protocols: this.protocols,
      lookbackPeriod: this.lookbackPeriod,
      entryZScore: this.entryZScore,
      exitZScore: this.exitZScore,
      positionSize: this.positionSize,
    });
    
    // Initialize data structures
    this.protocols.forEach(protocol => {
      this.fundingRates.set(protocol, []);
      this.perpPrices.set(protocol, new Map());
    });
  }
  
  protected async onInitialize(): Promise<void> {
    logger.info(`Initializing ${this.name}...`);
    
    // Subscribe to funding rate updates
    this.protocols.forEach(protocol => {
      logger.info(`Subscribing to funding rates for ${protocol}...`);
      // In production, subscribe to real-time funding rate feeds
    });
  }
  
  protected async onShutdown(): Promise<void> {
    logger.info(`Shutting down ${this.name}...`);
    
    // Close all open positions
    for (const [symbol, position] of this.arbPositions) {
      if (position.spot !== 0 || position.perp !== 0) {
        logger.info(`Closing position for ${symbol}...`);
        await this.closeArbitragePosition(symbol);
      }
    }
  }
  
  protected handleCandle(candle: Candle): void {
    // Update spot price
    this.spotPrices.set(candle.symbol, candle.close);
    
    // Calculate basis and spreads for each protocol
    this.protocols.forEach(protocol => {
      this.updateBasisAndSpread(candle.symbol, protocol);
    });
    
    // Check for arbitrage opportunities
    this.checkArbitrageOpportunities(candle.symbol);
    
    // Monitor existing positions
    this.monitorPositions(candle.symbol);
  }
  
  protected handleOrderFill(fill: Execution): void {
    logger.info(`Stat arb order filled:`, fill);
    
    // Update position tracking
    const positionKey = `${fill.symbol}-${fill.orderId.split('-')[0]}`;
    const position = this.arbPositions.get(fill.symbol) || { spot: 0, perp: 0, protocol: '' };
    
    if (fill.orderId.includes('spot')) {
      position.spot += fill.side === 'buy' ? fill.quantity : -fill.quantity;
    } else if (fill.orderId.includes('perp')) {
      position.perp += fill.side === 'buy' ? fill.quantity : -fill.quantity;
    }
    
    this.arbPositions.set(fill.symbol, position);
    
    // Check if position needs rebalancing
    this.checkRebalance(fill.symbol);
  }
  
  protected handlePositionUpdate(position: Position): void {
    logger.debug(`Position updated:`, {
      symbol: position.symbol,
      quantity: position.quantity,
      pnl: position.unrealizedPnL,
    });
  }
  
  protected onReset(): void {
    this.fundingRates.clear();
    this.spotPrices.clear();
    this.perpPrices.clear();
    this.spreads.clear();
    this.activeSignals.clear();
    this.arbPositions.clear();
    
    this.protocols.forEach(protocol => {
      this.fundingRates.set(protocol, []);
      this.perpPrices.set(protocol, new Map());
    });
  }
  
  /**
   * Update funding rate data (called externally or via websocket)
   */
  public updateFundingRate(fundingRate: FundingRate): void {
    const rates = this.fundingRates.get(fundingRate.protocol) || [];
    rates.push(fundingRate);
    
    // Keep only recent data
    const cutoff = Date.now() - (this.lookbackPeriod * 3600 * 1000);
    const filtered = rates.filter(r => r.timestamp > cutoff);
    
    this.fundingRates.set(fundingRate.protocol, filtered);
    
    logger.debug(`Funding rate updated:`, {
      protocol: fundingRate.protocol,
      symbol: fundingRate.symbol,
      rate: fundingRate.rate,
      dataPoints: filtered.length,
    });
  }
  
  /**
   * Update perp price data
   */
  public updatePerpPrice(symbol: string, protocol: string, price: number): void {
    const protocolPrices = this.perpPrices.get(protocol);
    if (protocolPrices) {
      protocolPrices.set(symbol, price);
    }
  }
  
  /**
   * Calculate basis and spread
   */
  private updateBasisAndSpread(symbol: string, protocol: string): void {
    const spotPrice = this.spotPrices.get(symbol);
    const perpPrice = this.perpPrices.get(protocol)?.get(symbol);
    const fundingRates = this.fundingRates.get(protocol) || [];
    
    if (!spotPrice || !perpPrice || fundingRates.length === 0) {
      return;
    }
    
    // Calculate basis (spot - perp) as percentage
    const basis = ((spotPrice - perpPrice) / spotPrice) * 100;
    
    // Get latest funding rate
    const latestFunding = fundingRates[fundingRates.length - 1];
    const fundingRatePercent = latestFunding.rate * 100;
    
    // Spread = funding rate - basis (should converge to zero in equilibrium)
    const spread = fundingRatePercent - basis;
    
    // Store spread
    const spreadKey = `${symbol}-${protocol}`;
    const spreadsArray = this.spreads.get(spreadKey) || [];
    spreadsArray.push(spread);
    
    // Keep only recent spreads
    if (spreadsArray.length > 100) {
      spreadsArray.shift();
    }
    
    this.spreads.set(spreadKey, spreadsArray);
    
    logger.debug(`Updated spread for ${spreadKey}:`, {
      spotPrice,
      perpPrice,
      basis: basis.toFixed(4),
      fundingRate: fundingRatePercent.toFixed(4),
      spread: spread.toFixed(4),
    });
  }
  
  /**
   * Check for arbitrage opportunities using z-score
   */
  private checkArbitrageOpportunities(symbol: string): void {
    this.protocols.forEach(protocol => {
      const spreadKey = `${symbol}-${protocol}`;
      const spreadsArray = this.spreads.get(spreadKey);
      
      if (!spreadsArray || spreadsArray.length < 20) {
        return; // Need enough data for statistics
      }
      
      // Calculate z-score
      const currentSpread = spreadsArray[spreadsArray.length - 1];
      const mean = this.calculateMean(spreadsArray);
      const stdDev = this.calculateStdDev(spreadsArray, mean);
      
      if (stdDev === 0) return;
      
      const zScore = (currentSpread - mean) / stdDev;
      
      // Calculate half-life for mean reversion
      const halfLife = this.calculateHalfLife(spreadsArray);
      
      // Check for entry signal
      const existingSignal = this.activeSignals.get(spreadKey);
      
      if (!existingSignal && Math.abs(zScore) >= this.entryZScore) {
        // New opportunity detected
        const signal: ArbitrageSignal = {
          pair: [symbol, `${symbol}-PERP`],
          spread: currentSpread,
          zScore,
          halfLife,
          entryThreshold: this.entryZScore,
          exitThreshold: this.exitZScore,
          confidence: Math.min(Math.abs(zScore) / this.entryZScore, 1.0),
        };
        
        this.activeSignals.set(spreadKey, signal);
        
        logger.info(`Arbitrage opportunity detected:`, {
          symbol,
          protocol,
          zScore: zScore.toFixed(2),
          spread: currentSpread.toFixed(4),
          halfLife: halfLife.toFixed(2),
          direction: zScore > 0 ? 'short spread' : 'long spread',
        });
        
        // Enter position
        this.enterArbitragePosition(symbol, protocol, zScore > 0 ? 'short' : 'long');
        
      } else if (existingSignal && Math.abs(zScore) <= this.exitZScore) {
        // Exit signal
        logger.info(`Exit signal detected for ${spreadKey}:`, {
          entryZScore: existingSignal.zScore.toFixed(2),
          currentZScore: zScore.toFixed(2),
        });
        
        this.activeSignals.delete(spreadKey);
        this.closeArbitragePosition(symbol);
      }
    });
  }
  
  /**
   * Enter an arbitrage position (market neutral)
   */
  private async enterArbitragePosition(
    symbol: string,
    protocol: string,
    direction: 'long' | 'short'
  ): Promise<void> {
    logger.info(`Entering ${direction} spread position:`, { symbol, protocol });
    
    if (direction === 'long') {
      // Long spread: Buy spot, Short perp (expect spread to widen)
      await this.executeOrder({
        symbol,
        side: 'buy',
        quantity: this.positionSize,
      });
      
      // In production, also open short perp position via protocol adapter
      this.emit('perpOrder', {
        symbol,
        protocol,
        side: 'short',
        quantity: this.positionSize,
      });
      
    } else {
      // Short spread: Sell spot, Long perp (expect spread to narrow)
      await this.executeOrder({
        symbol,
        side: 'sell',
        quantity: this.positionSize,
      });
      
      // In production, also open long perp position via protocol adapter
      this.emit('perpOrder', {
        symbol,
        protocol,
        side: 'long',
        quantity: this.positionSize,
      });
    }
    
    // Track position
    this.arbPositions.set(symbol, {
      spot: direction === 'long' ? this.positionSize : -this.positionSize,
      perp: direction === 'long' ? -this.positionSize : this.positionSize,
      protocol,
    });
  }
  
  /**
   * Close an arbitrage position
   */
  private async closeArbitragePosition(symbol: string): Promise<void> {
    const position = this.arbPositions.get(symbol);
    if (!position) return;
    
    logger.info(`Closing arbitrage position:`, { symbol, position });
    
    // Close spot position
    if (position.spot !== 0) {
      await this.executeOrder({
        symbol,
        side: position.spot > 0 ? 'sell' : 'buy',
        quantity: Math.abs(position.spot),
      });
    }
    
    // Close perp position
    if (position.perp !== 0) {
      this.emit('closePerpPosition', {
        symbol,
        protocol: position.protocol,
        size: Math.abs(position.perp),
      });
    }
    
    this.arbPositions.delete(symbol);
  }
  
  /**
   * Monitor existing positions for PnL and delta
   */
  private monitorPositions(symbol: string): void {
    const position = this.arbPositions.get(symbol);
    if (!position) return;
    
    const spotPrice = this.spotPrices.get(symbol);
    const perpPrice = this.perpPrices.get(position.protocol)?.get(symbol);
    
    if (!spotPrice || !perpPrice) return;
    
    // Calculate delta (net directional exposure)
    const delta = position.spot + position.perp;
    
    // Log position status
    logger.debug(`Position status for ${symbol}:`, {
      spotPosition: position.spot,
      perpPosition: position.perp,
      delta,
      spotPrice,
      perpPrice,
    });
  }
  
  /**
   * Check if position needs delta rebalancing
   */
  private checkRebalance(symbol: string): void {
    const position = this.arbPositions.get(symbol);
    if (!position) return;
    
    const delta = position.spot + position.perp;
    const totalSize = Math.abs(position.spot) + Math.abs(position.perp);
    
    if (totalSize === 0) return;
    
    const deltaPercent = Math.abs(delta) / totalSize;
    
    if (deltaPercent > this.rebalanceThreshold) {
      logger.warn(`Position needs rebalancing:`, {
        symbol,
        delta,
        deltaPercent: (deltaPercent * 100).toFixed(2) + '%',
      });
      
      // In production, execute rebalancing trades
      this.emit('rebalanceNeeded', { symbol, delta });
    }
  }
  
  /**
   * Calculate mean
   */
  private calculateMean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[], mean: number): number {
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
  
  /**
   * Calculate half-life of mean reversion using Ornstein-Uhlenbeck process
   */
  private calculateHalfLife(spreads: number[]): number {
    if (spreads.length < 2) return 0;
    
    // Simple AR(1) estimation
    const changes = [];
    const levels = [];
    
    for (let i = 1; i < spreads.length; i++) {
      changes.push(spreads[i] - spreads[i - 1]);
      levels.push(spreads[i - 1]);
    }
    
    // Calculate regression coefficient
    const meanLevels = this.calculateMean(levels);
    const meanChanges = this.calculateMean(changes);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < levels.length; i++) {
      numerator += (levels[i] - meanLevels) * (changes[i] - meanChanges);
      denominator += Math.pow(levels[i] - meanLevels, 2);
    }
    
    const beta = denominator !== 0 ? numerator / denominator : 0;
    
    // Half-life = -ln(2) / ln(1 + beta)
    if (beta >= 0 || beta <= -2) return 0;
    
    const halfLife = -Math.log(2) / Math.log(1 + beta);
    
    return halfLife;
  }
}
