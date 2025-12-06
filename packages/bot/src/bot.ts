import { EventEmitter } from 'events';
import { Exchange, Strategy, MarketData, Order, Position, logger, Config } from '@trading-bot/core';
import { RiskManager, RiskManagerConfig } from '@trading-bot/risk-engine';
import { StrategyLoader } from '@trading-bot/strategies';

export interface BotState {
  running: boolean;
  equity: number;
  positions: Position[];
  orders: Order[];
  errors: string[];
}

export class TradingBot extends EventEmitter {
  private config: Config;
  private exchange: Exchange;
  private strategy: Strategy;
  private riskManager: RiskManager;
  private strategyLoader: StrategyLoader | null = null;
  private state: BotState;

  constructor(
    config: Config,
    exchange: Exchange,
    strategy: Strategy,
    riskManager: RiskManager
  ) {
    super();
    this.config = config;
    this.exchange = exchange;
    this.strategy = strategy;
    this.riskManager = riskManager;
    this.state = {
      running: false,
      equity: 0,
      positions: [],
      orders: [],
      errors: [],
    };
  }

  async start(): Promise<void> {
    if (this.state.running) {
      logger.warn('Bot is already running');
      return;
    }

    logger.info('Starting trading bot...');
    this.state.running = true;

    try {
      // Connect to exchange
      await this.exchange.connect();
      logger.info(`Connected to ${this.exchange.name}`);

      // Initialize strategy
      await this.strategy.initialize();
      logger.info(`Strategy ${this.strategy.name} initialized`);

      // Subscribe to market data
      const symbol = 'ETH/USD'; // Example symbol
      this.exchange.subscribeMarketData(symbol, this.onMarketData.bind(this));

      this.emit('started');
    } catch (error) {
      logger.error('Failed to start bot', error);
      this.state.errors.push(String(error));
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.state.running) {
      logger.warn('Bot is not running');
      return;
    }

    logger.info('Stopping trading bot...');
    this.state.running = false;

    try {
      await this.strategy.shutdown();
      await this.exchange.disconnect();
      this.emit('stopped');
    } catch (error) {
      logger.error('Error during bot shutdown', error);
      this.state.errors.push(String(error));
    }
  }

  private async onMarketData(data: MarketData): Promise<void> {
    if (!this.state.running) return;

    try {
      // Update positions
      await this.updatePositions(data);

      // Generate signal from strategy
      const order = await this.strategy.onMarketData(data);

      if (order) {
        await this.executeOrder(order);
      }
    } catch (error) {
      logger.error('Error processing market data', error);
      this.state.errors.push(String(error));
    }
  }

  private async executeOrder(order: Omit<Order, 'id' | 'status' | 'timestamp'>): Promise<void> {
    const fullOrder: Order = {
      ...order,
      id: `pending-${Date.now()}`,
      status: 'pending',
      timestamp: Date.now(),
    };

    // Validate with risk manager
    if (!this.riskManager.validateOrder(fullOrder)) {
      logger.warn('Order rejected by risk manager', order);
      return;
    }

    try {
      // Submit to exchange
      const submittedOrder = await this.exchange.submitOrder(order);
      this.state.orders.push(submittedOrder);
      
      logger.info(`Order submitted: ${submittedOrder.id}`, submittedOrder);

      // Notify strategy
      if (submittedOrder.status === 'filled') {
        await this.strategy.onOrderFilled(submittedOrder);
      }

      this.emit('order', submittedOrder);
    } catch (error) {
      logger.error('Failed to execute order', error);
      this.state.errors.push(String(error));
    }
  }

  private async updatePositions(data: MarketData): Promise<void> {
    try {
      const position = await this.exchange.getPosition(data.symbol);
      
      if (position) {
        this.riskManager.updatePosition(position);
        
        // Update state
        const index = this.state.positions.findIndex((p) => p.symbol === position.symbol);
        if (index >= 0) {
          this.state.positions[index] = position;
        } else {
          this.state.positions.push(position);
        }
      }
    } catch (error) {
      logger.error('Failed to update positions', error);
    }
  }

  getState(): BotState {
    return { ...this.state };
  }

  getRiskStatus() {
    return this.riskManager.getDrawdownStatus();
  }

  async submitManualOrder(orderParams: {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    price?: number;
    type: string;
  }): Promise<Order> {
    if (!this.state.running) {
      throw new Error('Bot is not running');
    }

    const order: Omit<Order, 'id' | 'status' | 'timestamp'> = {
      symbol: orderParams.symbol,
      side: orderParams.side,
      type: orderParams.type as 'market' | 'limit',
      quantity: orderParams.quantity,
      price: orderParams.price,
    };

    await this.executeOrder(order);
    return this.state.orders[this.state.orders.length - 1];
  }

  enableHotReload(strategyPath: string): void {
    this.strategyLoader = new StrategyLoader(strategyPath);
    
    this.strategyLoader.watchStrategies(async (filePath, newStrategy) => {
      logger.info(`Reloading strategy from ${filePath}`);
      
      // Shutdown old strategy
      await this.strategy.shutdown();
      
      // Replace with new strategy
      this.strategy = newStrategy;
      await this.strategy.initialize();
      
      this.emit('strategy-reloaded', newStrategy.name);
    });
  }
}
