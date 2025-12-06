import { Exchange, MarketData, Order, Position, logger } from '@trading-bot/core';

export abstract class BaseExchange implements Exchange {
  abstract name: string;

  async connect(): Promise<void> {
    logger.info(`Connecting to ${this.name}...`);
  }

  async disconnect(): Promise<void> {
    logger.info(`Disconnecting from ${this.name}...`);
  }

  abstract getMarketData(symbol: string): Promise<MarketData>;
  abstract submitOrder(order: Omit<Order, 'id' | 'status' | 'timestamp'>): Promise<Order>;
  abstract getPosition(symbol: string): Promise<Position | null>;
  abstract subscribeMarketData(symbol: string, callback: (data: MarketData) => void): void;
}
