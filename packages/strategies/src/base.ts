import { Strategy, MarketData, Order, logger } from '@trading-bot/core';

export abstract class BaseStrategy implements Strategy {
  abstract name: string;
  protected params: Record<string, unknown>;

  constructor(params: Record<string, unknown> = {}) {
    this.params = params;
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing strategy: ${this.name}`, this.params);
  }

  abstract onMarketData(data: MarketData): Promise<Order | null>;

  async onOrderFilled(order: Order): Promise<void> {
    logger.info(`Order filled for ${this.name}`, order);
  }

  async shutdown(): Promise<void> {
    logger.info(`Shutting down strategy: ${this.name}`);
  }
}
