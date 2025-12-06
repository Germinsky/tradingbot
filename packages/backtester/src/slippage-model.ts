export interface SlippageConfig {
  constantBps: number; // Constant slippage in basis points (e.g., 5 = 0.05%)
  impactBps: number;   // Linear price impact per $1M volume (e.g., 10 = 0.10% per $1M)
  minSlippage: number; // Minimum slippage in basis points
  maxSlippage: number; // Maximum slippage in basis points (cap)
}

export interface OrderFill {
  timestamp: number;
  symbol: string;
  side: 'buy' | 'sell';
  requestedPrice: number;
  requestedQuantity: number;
  filledPrice: number;
  filledQuantity: number;
  slippageBps: number;
  fees: number;
  volumeUsd: number;
}

export class SlippageModel {
  private config: SlippageConfig;

  constructor(config?: Partial<SlippageConfig>) {
    this.config = {
      constantBps: config?.constantBps ?? 5,
      impactBps: config?.impactBps ?? 10,
      minSlippage: config?.minSlippage ?? 1,
      maxSlippage: config?.maxSlippage ?? 500,
    };
  }

  /**
   * Calculate realistic fill price considering slippage
   */
  calculateFill(
    side: 'buy' | 'sell',
    requestedPrice: number,
    quantity: number,
    currentVolume: number,
    timestamp: number,
    symbol: string
  ): OrderFill {
    const volumeUsd = requestedPrice * quantity;
    
    // Calculate slippage components
    const constantSlippage = this.config.constantBps;
    
    // Linear price impact: scales with order size relative to volume
    const volumeMillions = volumeUsd / 1_000_000;
    const impactSlippage = this.config.impactBps * volumeMillions;
    
    // Total slippage in basis points
    let totalSlippageBps = constantSlippage + impactSlippage;
    
    // Apply min/max bounds
    totalSlippageBps = Math.max(this.config.minSlippage, totalSlippageBps);
    totalSlippageBps = Math.min(this.config.maxSlippage, totalSlippageBps);
    
    // Convert to decimal
    const slippageDecimal = totalSlippageBps / 10000;
    
    // Calculate filled price
    let filledPrice: number;
    if (side === 'buy') {
      // Buying costs more (price goes up)
      filledPrice = requestedPrice * (1 + slippageDecimal);
    } else {
      // Selling receives less (price goes down)
      filledPrice = requestedPrice * (1 - slippageDecimal);
    }
    
    // Trading fees (e.g., 0.05% = 5 bps)
    const feeBps = 5;
    const fees = volumeUsd * (feeBps / 10000);
    
    return {
      timestamp,
      symbol,
      side,
      requestedPrice,
      requestedQuantity: quantity,
      filledPrice,
      filledQuantity: quantity,
      slippageBps: totalSlippageBps,
      fees,
      volumeUsd,
    };
  }

  /**
   * Simulate partial fills for large orders
   */
  calculatePartialFills(
    side: 'buy' | 'sell',
    requestedPrice: number,
    quantity: number,
    availableLiquidity: number,
    currentVolume: number,
    timestamp: number,
    symbol: string
  ): OrderFill[] {
    const fills: OrderFill[] = [];
    const volumeUsd = requestedPrice * quantity;
    
    // If order is too large relative to liquidity, split it
    const maxOrderSizeRatio = 0.1; // Max 10% of volume in single fill
    const maxOrderSize = currentVolume * maxOrderSizeRatio;
    
    if (volumeUsd <= maxOrderSize) {
      // Single fill
      return [this.calculateFill(side, requestedPrice, quantity, currentVolume, timestamp, symbol)];
    }
    
    // Multiple fills with increasing slippage
    let remainingQuantity = quantity;
    let currentPrice = requestedPrice;
    const numFills = Math.ceil(volumeUsd / maxOrderSize);
    
    for (let i = 0; i < numFills; i++) {
      const fillQuantity = Math.min(remainingQuantity, maxOrderSize / currentPrice);
      const fill = this.calculateFill(side, currentPrice, fillQuantity, currentVolume, timestamp, symbol);
      
      fills.push(fill);
      remainingQuantity -= fillQuantity;
      
      // Price moves with each fill
      currentPrice = fill.filledPrice;
      
      if (remainingQuantity <= 0) break;
    }
    
    return fills;
  }

  /**
   * Calculate slippage for market orders using candle data
   */
  calculateMarketFill(
    side: 'buy' | 'sell',
    quantity: number,
    candle: { open: number; high: number; low: number; close: number; volume: number },
    timestamp: number,
    symbol: string
  ): OrderFill {
    // Use midpoint of OHLC as reference price
    const referencePrice = (candle.open + candle.high + candle.low + candle.close) / 4;
    
    // For market orders, use worse price within the candle
    let executionPrice: number;
    if (side === 'buy') {
      // Buy at higher price (closer to high)
      executionPrice = (referencePrice + candle.high) / 2;
    } else {
      // Sell at lower price (closer to low)
      executionPrice = (referencePrice + candle.low) / 2;
    }
    
    return this.calculateFill(side, executionPrice, quantity, candle.volume, timestamp, symbol);
  }

  /**
   * Update slippage configuration
   */
  updateConfig(config: Partial<SlippageConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SlippageConfig {
    return { ...this.config };
  }

  /**
   * Estimate total slippage for given order size
   */
  estimateSlippage(orderSizeUsd: number): number {
    const volumeMillions = orderSizeUsd / 1_000_000;
    let slippageBps = this.config.constantBps + this.config.impactBps * volumeMillions;
    
    slippageBps = Math.max(this.config.minSlippage, slippageBps);
    slippageBps = Math.min(this.config.maxSlippage, slippageBps);
    
    return slippageBps;
  }
}
