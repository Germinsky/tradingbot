import { MarketData, Order, Position, logger } from '@trading-bot/core';
import { Strategy } from '@trading-bot/core';
import { RiskManager } from '@trading-bot/risk-engine';
import { EventQueue, BacktestEvent } from './event-queue.js';
import { PerformanceMetrics } from './metrics.js';

export interface BacktestConfig {
  initialCapital: number;
  commission: number; // Percentage per trade
  slippage: number; // Percentage
}

export class Backtester {
  private config: BacktestConfig;
  private strategy: Strategy;
  private riskManager: RiskManager;
  private eventQueue: EventQueue;
  private positions: Map<string, Position> = new Map();
  private orders: Order[] = [];
  private equity: number;
  private equityHistory: { timestamp: number; equity: number }[] = [];

  constructor(
    config: BacktestConfig,
    strategy: Strategy,
    riskManager: RiskManager
  ) {
    this.config = config;
    this.strategy = strategy;
    this.riskManager = riskManager;
    this.eventQueue = new EventQueue();
    this.equity = config.initialCapital;
  }

  loadHistoricalData(data: MarketData[]): void {
    logger.info(`Loading ${data.length} historical data points`);
    
    const events: BacktestEvent[] = data.map((d) => ({
      timestamp: d.timestamp,
      type: 'market_data' as const,
      data: d,
    }));

    this.eventQueue.addEvents(events);
    this.eventQueue.sortByTimestamp();
  }

  async run(): Promise<PerformanceMetrics> {
    logger.info('Starting backtest...');
    await this.strategy.initialize();

    while (this.eventQueue.hasNext()) {
      const event = this.eventQueue.next();
      if (!event) break;

      await this.processEvent(event);

      // Record equity
      this.equityHistory.push({
        timestamp: event.timestamp,
        equity: this.equity,
      });
    }

    await this.strategy.shutdown();
    logger.info('Backtest completed');

    return this.calculateMetrics();
  }

  private async processEvent(event: BacktestEvent): Promise<void> {
    switch (event.type) {
      case 'market_data':
        await this.onMarketData(event.data as MarketData);
        break;
      case 'order_filled':
        await this.onOrderFilled(event.data as Order);
        break;
    }
  }

  private async onMarketData(data: MarketData): Promise<void> {
    // Update positions with current price
    this.updatePositions(data);

    // Generate signal from strategy
    const order = await this.strategy.onMarketData(data);
    
    if (order) {
      // Validate with risk manager
      const fullOrder: Order = {
        ...order,
        id: `backtest-${Date.now()}`,
        status: 'pending',
        timestamp: data.timestamp,
      };

      if (this.riskManager.validateOrder(fullOrder)) {
        // Simulate execution with slippage and commission
        await this.executeOrder(fullOrder, data.price);
      }
    }
  }

  private async executeOrder(order: Order, marketPrice: number): Promise<void> {
    // Apply slippage
    const slippageMultiplier = 1 + (order.side === 'buy' ? this.config.slippage : -this.config.slippage);
    const executionPrice = marketPrice * slippageMultiplier;

    // Calculate commission
    const commission = executionPrice * order.quantity * this.config.commission;

    // Update equity
    const orderValue = executionPrice * order.quantity;
    this.equity -= order.side === 'buy' ? orderValue + commission : -(orderValue - commission);

    // Create or update position
    const position = this.positions.get(order.symbol) || {
      symbol: order.symbol,
      quantity: 0,
      entryPrice: executionPrice,
      currentPrice: executionPrice,
      unrealizedPnL: 0,
      realizedPnL: 0,
      timestamp: order.timestamp,
    };

    if (order.side === 'buy') {
      position.quantity += order.quantity;
    } else {
      // Calculate realized PnL on sell
      const realizedPnL = (executionPrice - position.entryPrice) * order.quantity;
      position.realizedPnL += realizedPnL;
      position.quantity -= order.quantity;
    }

    this.positions.set(order.symbol, position);
    this.riskManager.updatePosition(position);

    // Record order
    const filledOrder: Order = { ...order, status: 'filled', price: executionPrice };
    this.orders.push(filledOrder);
    await this.strategy.onOrderFilled(filledOrder);

    logger.debug(`Order executed: ${order.side} ${order.quantity} ${order.symbol} @ ${executionPrice}`);
  }

  private updatePositions(data: MarketData): void {
    const position = this.positions.get(data.symbol);
    if (position && position.quantity > 0) {
      position.currentPrice = data.price;
      position.unrealizedPnL = (data.price - position.entryPrice) * position.quantity;
      this.positions.set(data.symbol, position);
    }
  }

  private async onOrderFilled(order: Order): Promise<void> {
    await this.strategy.onOrderFilled(order);
  }

  private calculateMetrics(): PerformanceMetrics {
    const metrics = new PerformanceMetrics(
      this.config.initialCapital,
      this.equity,
      this.orders,
      this.equityHistory
    );
    return metrics;
  }
}
