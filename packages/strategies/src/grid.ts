import { BaseStrategy } from './base.js';
import { MarketData, Order, logger } from '@trading-bot/core';

interface GridStrategyParams {
  gridSize: number;
  gridSpacing: number;
  basePrice: number;
  quantity: number;
}

export class GridStrategy extends BaseStrategy {
  name = 'GridStrategy';
  private gridLevels: number[] = [];
  private lastPrice: number = 0;
  private gridParams: GridStrategyParams;

  constructor(params: GridStrategyParams) {
    super(params as unknown as Record<string, unknown>);
    this.gridParams = params;
    this.initializeGrid(params);
  }

  private initializeGrid(params: GridStrategyParams): void {
    const { gridSize, gridSpacing, basePrice } = params;
    
    for (let i = -gridSize / 2; i <= gridSize / 2; i++) {
      this.gridLevels.push(basePrice + i * gridSpacing);
    }
    
    logger.info('Grid levels initialized', this.gridLevels);
  }

  async onMarketData(data: MarketData): Promise<Order | null> {
    const { price } = data;
    
    // Check if price crossed a grid level
    for (const level of this.gridLevels) {
      if (this.lastPrice < level && price >= level) {
        // Price crossed upward - sell
        logger.debug(`Price crossed grid level ${level} upward, generating sell order`);
        this.lastPrice = price;
        return {
          symbol: data.symbol,
          timestamp: Date.now(),
          type: 'limit',
          status: 'pending',
          id: `grid-sell-${Date.now()}`,
          side: 'sell',
          quantity: this.gridParams.quantity,
          price: level,
        };
      } else if (this.lastPrice > level && price <= level) {
        // Price crossed downward - buy
        logger.debug(`Price crossed grid level ${level} downward, generating buy order`);
        this.lastPrice = price;
        return {
          symbol: data.symbol,
          timestamp: Date.now(),
          type: 'limit',
          status: 'pending',
          id: `grid-buy-${Date.now()}`,
          side: 'buy',
          quantity: this.gridParams.quantity,
          price: level,
        };
      }
    }

    this.lastPrice = price;
    return null;
  }
}
