import { Registry, Counter, Gauge, Histogram } from 'prom-client';
import { logger } from '@trading-bot/core';
import { TradingBot } from './bot.js';

export class PrometheusMetrics {
  private registry: Registry;
  private bot: TradingBot;
  private prefix: string;

  // Metrics
  private ordersTotal: Counter;
  private positionPnl: Gauge;
  private executionLatency: Histogram;
  private gasCostUsd: Histogram;
  private botUptime: Gauge;
  private errorsTotal: Counter;
  private positionsOpen: Gauge;
  private ordersActive: Gauge;

  constructor(bot: TradingBot, prefix: string = 'trading_bot_') {
    this.registry = new Registry();
    this.bot = bot;
    this.prefix = prefix;

    // Initialize metrics
    this.ordersTotal = new Counter({
      name: `${prefix}orders_total`,
      help: 'Total number of orders',
      labelNames: ['chain', 'strategy', 'side', 'status'],
      registers: [this.registry],
    });

    this.positionPnl = new Gauge({
      name: `${prefix}position_pnl`,
      help: 'Current position PnL',
      labelNames: ['chain', 'symbol'],
      registers: [this.registry],
    });

    this.executionLatency = new Histogram({
      name: `${prefix}execution_latency_ms`,
      help: 'Order execution latency in milliseconds',
      labelNames: ['chain', 'exchange'],
      buckets: [10, 50, 100, 500, 1000, 5000],
      registers: [this.registry],
    });

    this.gasCostUsd = new Histogram({
      name: `${prefix}gas_cost_usd`,
      help: 'Gas cost in USD',
      labelNames: ['chain'],
      buckets: [1, 5, 10, 25, 50, 100],
      registers: [this.registry],
    });

    this.botUptime = new Gauge({
      name: `${prefix}uptime_seconds`,
      help: 'Bot uptime in seconds',
      registers: [this.registry],
    });

    this.errorsTotal = new Counter({
      name: `${prefix}errors_total`,
      help: 'Total number of errors',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.positionsOpen = new Gauge({
      name: `${prefix}positions_open`,
      help: 'Number of open positions',
      labelNames: ['chain', 'symbol'],
      registers: [this.registry],
    });

    this.ordersActive = new Gauge({
      name: `${prefix}orders_active`,
      help: 'Number of active orders',
      labelNames: ['chain', 'side'],
      registers: [this.registry],
    });

    // Start collecting default metrics
    this.registry.setDefaultLabels({
      app: 'trading-bot',
      env: process.env.NODE_ENV || 'development',
    });

    // Update gauges periodically
    this.startPeriodicUpdates();

    logger.info('Prometheus metrics initialized');
  }

  private startPeriodicUpdates(): void {
    setInterval(() => {
      this.updateGauges();
    }, 5000); // Update every 5 seconds
  }

  private updateGauges(): void {
    try {
      const state = this.bot.getState();

      // Update positions
      this.positionsOpen.reset();
      for (const position of state.positions) {
        this.positionsOpen.inc({
          chain: 'unknown', // TODO: extract from position
          symbol: position.symbol,
        });

        this.positionPnl.set(
          {
            chain: 'unknown',
            symbol: position.symbol,
          },
          position.unrealizedPnL || 0
        );
      }

      // Update active orders
      this.ordersActive.reset();
      for (const order of state.orders) {
        if (order.status === 'pending' || order.status === 'open') {
          this.ordersActive.inc({
            chain: 'unknown',
            side: order.side,
          });
        }
      }

      // Update error count
      this.errorsTotal.inc({ type: 'general' }, state.errors.length);
    } catch (error) {
      logger.error('Failed to update metrics gauges', error);
    }
  }

  recordOrder(chain: string, strategy: string, side: string, status: string): void {
    this.ordersTotal.inc({ chain, strategy, side, status });
  }

  recordExecutionLatency(chain: string, exchange: string, latencyMs: number): void {
    this.executionLatency.observe({ chain, exchange }, latencyMs);
  }

  recordGasCost(chain: string, costUsd: number): void {
    this.gasCostUsd.observe({ chain }, costUsd);
  }

  recordError(type: string): void {
    this.errorsTotal.inc({ type });
  }

  async getMetrics(): Promise<string> {
    // Update uptime gauge
    this.botUptime.set(process.uptime());

    return await this.registry.metrics();
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
