import { MarketData, Order, Position } from '@trading-bot/core';

export interface BacktestEvent {
  timestamp: number;
  type: 'market_data' | 'order_filled' | 'position_update';
  data: MarketData | Order | Position;
}

export class EventQueue {
  private events: BacktestEvent[] = [];
  private currentIndex: number = 0;

  addEvent(event: BacktestEvent): void {
    this.events.push(event);
  }

  addEvents(events: BacktestEvent[]): void {
    this.events.push(...events);
  }

  sortByTimestamp(): void {
    this.events.sort((a, b) => a.timestamp - b.timestamp);
  }

  hasNext(): boolean {
    return this.currentIndex < this.events.length;
  }

  next(): BacktestEvent | null {
    if (!this.hasNext()) return null;
    return this.events[this.currentIndex++];
  }

  peek(): BacktestEvent | null {
    if (!this.hasNext()) return null;
    return this.events[this.currentIndex];
  }

  reset(): void {
    this.currentIndex = 0;
  }

  getProgress(): number {
    return this.events.length > 0 ? this.currentIndex / this.events.length : 0;
  }
}
