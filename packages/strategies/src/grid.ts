import { BaseStrategy } from './base';
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

  constructor(params: GridStrategyParams) {
    super(params);
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
          side: 'sell',
          type: 'limit',
          quantity: (this.params as GridStrategyParams).quantity,
          price: level,
        };
      } else if (this.lastPrice > level && price <= level) {
        // Price crossed downward - buy
        logger.debug(`Price crossed grid level ${level} downward, generating buy order`);
        this.lastPrice = price;
        return {
          symbol: data.symbol,
          side: 'buy',
          type: 'limit',
          quantity: (this.params as GridStrategyParams).quantity,
          price: level,
        };
      }
    }

    this.lastPrice = price;
    return null;
  }
}
