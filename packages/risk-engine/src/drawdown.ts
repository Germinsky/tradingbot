import { Position, logger } from '@trading-bot/core';

export interface DrawdownMonitorConfig {
  maxDrawdown: number; // Percentage (e.g., 0.1 for 10%)
  highWaterMark: number;
}

export class DrawdownMonitor {
  private config: DrawdownMonitorConfig;
  private currentEquity: number;
  private circuitBreakerActive: boolean = false;

  constructor(config: DrawdownMonitorConfig) {
    this.config = config;
    this.currentEquity = config.highWaterMark;
  }

  updateEquity(equity: number): void {
    this.currentEquity = equity;

    if (equity > this.config.highWaterMark) {
      this.config.highWaterMark = equity;
      logger.info(`New high water mark: ${equity}`);
    }

    const drawdown = this.calculateDrawdown();
    logger.debug(`Current drawdown: ${(drawdown * 100).toFixed(2)}%`);

    if (drawdown >= this.config.maxDrawdown && !this.circuitBreakerActive) {
      this.activateCircuitBreaker();
    }
  }

  calculateDrawdown(): number {
    if (this.config.highWaterMark === 0) return 0;
    return (this.config.highWaterMark - this.currentEquity) / this.config.highWaterMark;
  }

  private activateCircuitBreaker(): void {
    this.circuitBreakerActive = true;
    logger.error(
      `CIRCUIT BREAKER ACTIVATED: Max drawdown of ${(this.config.maxDrawdown * 100).toFixed(2)}% reached!`
    );
  }

  resetCircuitBreaker(): void {
    this.circuitBreakerActive = false;
    logger.info('Circuit breaker reset');
  }

  isCircuitBreakerActive(): boolean {
    return this.circuitBreakerActive;
  }

  getCurrentDrawdown(): number {
    return this.calculateDrawdown();
  }

  getHighWaterMark(): number {
    return this.config.highWaterMark;
  }
}
