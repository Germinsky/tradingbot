import { Order, Position, logger } from '@trading-bot/core';
import { PositionSizer, PositionSizerConfig } from './position-sizer';
import { DrawdownMonitor, DrawdownMonitorConfig } from './drawdown';

export interface RiskManagerConfig {
  positionSizer: PositionSizerConfig;
  drawdownMonitor: DrawdownMonitorConfig;
  maxPositionSize: number;
  stopLossPercent: number;
  takeProfitPercent: number;
}

export class RiskManager {
  private positionSizer: PositionSizer;
  private drawdownMonitor: DrawdownMonitor;
  private config: RiskManagerConfig;
  private positions: Map<string, Position> = new Map();

  constructor(config: RiskManagerConfig) {
    this.config = config;
    this.positionSizer = new PositionSizer(config.positionSizer);
    this.drawdownMonitor = new DrawdownMonitor(config.drawdownMonitor);
  }

  validateOrder(order: Order): boolean {
    // Check circuit breaker
    if (this.drawdownMonitor.isCircuitBreakerActive()) {
      logger.warn('Order rejected: Circuit breaker is active');
      return false;
    }

    // Check max position size
    if (order.quantity > this.config.maxPositionSize) {
      logger.warn(`Order rejected: Position size ${order.quantity} exceeds max ${this.config.maxPositionSize}`);
      return false;
    }

    // Check position limits (simplified)
    const currentPosition = this.positions.get(order.symbol);
    if (currentPosition && order.side === 'buy' && currentPosition.quantity > 0) {
      logger.warn('Order rejected: Already have open long position');
      return false;
    }

    logger.info('Order validated successfully', order);
    return true;
  }

  calculateStopLoss(entryPrice: number, side: 'buy' | 'sell'): number {
    const stopLossDistance = entryPrice * this.config.stopLossPercent;
    return side === 'buy' ? entryPrice - stopLossDistance : entryPrice + stopLossDistance;
  }

  calculateTakeProfit(entryPrice: number, side: 'buy' | 'sell'): number {
    const takeProfitDistance = entryPrice * this.config.takeProfitPercent;
    return side === 'buy' ? entryPrice + takeProfitDistance : entryPrice - takeProfitDistance;
  }

  updatePosition(position: Position): void {
    this.positions.set(position.symbol, position);
    
    // Update equity for drawdown monitoring
    const totalPnL = Array.from(this.positions.values()).reduce(
      (sum, pos) => sum + pos.unrealizedPnL + pos.realizedPnL,
      0
    );
    const equity = this.config.positionSizer.accountBalance + totalPnL;
    this.drawdownMonitor.updateEquity(equity);
  }

  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getDrawdownStatus() {
    return {
      currentDrawdown: this.drawdownMonitor.getCurrentDrawdown(),
      highWaterMark: this.drawdownMonitor.getHighWaterMark(),
      circuitBreakerActive: this.drawdownMonitor.isCircuitBreakerActive(),
    };
  }
}
