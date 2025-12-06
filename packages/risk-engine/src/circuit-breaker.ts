import { logger } from '@trading-bot/core';
import { CircuitBreakerConfig } from './config.schema.js';

export interface DrawdownState {
  currentEquity: number;
  highWaterMark: number;
  dailyStartEquity: number;
  dailyHighWaterMark: number;
  totalDrawdown: number;
  dailyDrawdown: number;
  isCircuitBreakerActive: boolean;
  circuitBreakerActivatedAt: number | null;
  reasonForBreaker: string | null;
}

/**
 * Circuit Breaker for max drawdown protection
 * Monitors both daily and total drawdown
 * Pauses all trading when thresholds are breached
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: DrawdownState;
  private dailyResetTimer: NodeJS.Timeout | null = null;

  constructor(config: CircuitBreakerConfig, initialEquity: number) {
    this.config = config;
    this.state = {
      currentEquity: initialEquity,
      highWaterMark: initialEquity,
      dailyStartEquity: initialEquity,
      dailyHighWaterMark: initialEquity,
      totalDrawdown: 0,
      dailyDrawdown: 0,
      isCircuitBreakerActive: false,
      circuitBreakerActivatedAt: null,
      reasonForBreaker: null,
    };

    // Set up daily reset
    this.setupDailyReset();
  }

  /**
   * Update equity and check circuit breaker conditions
   */
  updateEquity(equity: number): void {
    this.state.currentEquity = equity;

    // Update high water marks
    if (equity > this.state.highWaterMark) {
      this.state.highWaterMark = equity;
    }

    if (equity > this.state.dailyHighWaterMark) {
      this.state.dailyHighWaterMark = equity;
    }

    // Calculate drawdowns
    this.state.totalDrawdown = this.calculateDrawdown(this.state.highWaterMark, equity);
    this.state.dailyDrawdown = this.calculateDrawdown(this.state.dailyHighWaterMark, equity);

    // Check circuit breaker conditions
    if (this.config.enabled && !this.state.isCircuitBreakerActive) {
      this.checkCircuitBreakerConditions();
    }

    // Check auto-recovery
    if (this.config.autoResetOnRecovery && this.state.isCircuitBreakerActive) {
      this.checkAutoRecovery();
    }

    logger.debug('Equity updated', {
      equity,
      totalDrawdown: (this.state.totalDrawdown * 100).toFixed(2) + '%',
      dailyDrawdown: (this.state.dailyDrawdown * 100).toFixed(2) + '%',
    });
  }

  /**
   * Check if circuit breaker should be activated
   */
  private checkCircuitBreakerConditions(): void {
    // Check daily drawdown
    if (this.state.dailyDrawdown >= this.config.maxDailyDrawdown) {
      this.activateCircuitBreaker(
        `Daily drawdown ${(this.state.dailyDrawdown * 100).toFixed(2)}% exceeded limit ${(this.config.maxDailyDrawdown * 100).toFixed(2)}%`
      );
      return;
    }

    // Check total drawdown
    if (this.state.totalDrawdown >= this.config.maxTotalDrawdown) {
      this.activateCircuitBreaker(
        `Total drawdown ${(this.state.totalDrawdown * 100).toFixed(2)}% exceeded limit ${(this.config.maxTotalDrawdown * 100).toFixed(2)}%`
      );
      return;
    }
  }

  /**
   * Activate circuit breaker
   */
  private activateCircuitBreaker(reason: string): void {
    this.state.isCircuitBreakerActive = true;
    this.state.circuitBreakerActivatedAt = Date.now();
    this.state.reasonForBreaker = reason;

    logger.error('🚨 CIRCUIT BREAKER ACTIVATED', {
      reason,
      currentEquity: this.state.currentEquity,
      dailyDrawdown: (this.state.dailyDrawdown * 100).toFixed(2) + '%',
      totalDrawdown: (this.state.totalDrawdown * 100).toFixed(2) + '%',
      cooldownPeriod: `${this.config.cooldownPeriodMs / 1000}s`,
    });

    // Auto-reset after cooldown period
    setTimeout(() => {
      if (this.state.isCircuitBreakerActive && !this.config.autoResetOnRecovery) {
        logger.warn('Circuit breaker cooldown period expired, manual reset still required');
      }
    }, this.config.cooldownPeriodMs);
  }

  /**
   * Check if equity has recovered enough to auto-reset
   */
  private checkAutoRecovery(): void {
    if (!this.state.circuitBreakerActivatedAt) return;

    const timeSinceActivation = Date.now() - this.state.circuitBreakerActivatedAt;
    if (timeSinceActivation < this.config.cooldownPeriodMs) {
      return; // Still in cooldown
    }

    // Calculate recovery from when breaker was activated
    const activationEquity = this.state.currentEquity; // Approximate
    const recovery = this.calculateDrawdown(this.state.highWaterMark, activationEquity);

    if (recovery <= this.config.maxTotalDrawdown * this.config.recoveryThreshold) {
      logger.info('Equity recovered sufficiently, auto-resetting circuit breaker', {
        recovery: (recovery * 100).toFixed(2) + '%',
        threshold: (this.config.maxTotalDrawdown * this.config.recoveryThreshold * 100).toFixed(
          2
        ) + '%',
      });
      this.resetCircuitBreaker();
    }
  }

  /**
   * Manually reset circuit breaker
   */
  resetCircuitBreaker(): void {
    if (!this.state.isCircuitBreakerActive) {
      logger.warn('Circuit breaker is not active, nothing to reset');
      return;
    }

    const wasActive = this.state.circuitBreakerActivatedAt
      ? Date.now() - this.state.circuitBreakerActivatedAt
      : 0;

    this.state.isCircuitBreakerActive = false;
    this.state.circuitBreakerActivatedAt = null;
    this.state.reasonForBreaker = null;

    logger.warn('Circuit breaker manually reset', {
      wasActiveDuration: `${(wasActive / 1000).toFixed(0)}s`,
      currentDrawdown: (this.state.totalDrawdown * 100).toFixed(2) + '%',
    });
  }

  /**
   * Check if trading is allowed
   */
  isTradingAllowed(): boolean {
    return !this.state.isCircuitBreakerActive;
  }

  /**
   * Get current drawdown state
   */
  getState(): DrawdownState {
    return { ...this.state };
  }

  /**
   * Calculate drawdown percentage
   */
  private calculateDrawdown(peak: number, current: number): number {
    if (peak === 0) return 0;
    return Math.max(0, (peak - current) / peak);
  }

  /**
   * Reset daily metrics at start of new trading day
   */
  private resetDailyMetrics(): void {
    this.state.dailyStartEquity = this.state.currentEquity;
    this.state.dailyHighWaterMark = this.state.currentEquity;
    this.state.dailyDrawdown = 0;

    logger.info('Daily drawdown metrics reset', {
      startEquity: this.state.dailyStartEquity,
    });
  }

  /**
   * Setup timer for daily reset (midnight UTC)
   */
  private setupDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    this.dailyResetTimer = setTimeout(() => {
      this.resetDailyMetrics();
      // Set up recurring daily reset
      this.dailyResetTimer = setInterval(
        () => this.resetDailyMetrics(),
        24 * 60 * 60 * 1000
      );
    }, msUntilMidnight);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Circuit breaker configuration updated', config);
  }

  /**
   * Cleanup timers
   */
  destroy(): void {
    if (this.dailyResetTimer) {
      clearInterval(this.dailyResetTimer);
      this.dailyResetTimer = null;
    }
  }
}
