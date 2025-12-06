import { Order, Position, logger } from '@trading-bot/core';
import { RiskEngineConfig } from './config.schema.js';
import { KellySizer, TradeStats } from './kelly-sizer.js';
import { VaRCalculator, VaRResult } from './var-calculator.js';
import { CircuitBreaker, DrawdownState } from './circuit-breaker.js';
import { ExposureManager } from './exposure-manager.js';
import { LiquidationBuffer, PerpPosition, BufferStatus } from './liquidation-buffer.js';
import { VolatilityMonitor, VolatilityMetrics, Candle } from './volatility-monitor.js';
import { loadRiskConfig, loadRiskConfigFromObject } from './config-loader.js';

/**
 * Comprehensive Risk Engine
 * Integrates Kelly position sizing, VaR/CVaR, circuit breakers, exposure limits,
 * liquidation buffers, and volatility-based de-leveraging
 */
export class RiskEngine {
  private config: RiskEngineConfig;
  private kellySizer: KellySizer;
  private varCalculator: VaRCalculator;
  private circuitBreaker: CircuitBreaker;
  private exposureManager: ExposureManager;
  private liquidationBuffer: LiquidationBuffer;
  private volatilityMonitor: VolatilityMonitor;
  private accountBalance: number;

  constructor(config: RiskEngineConfig | string) {
    // Load config from file or object
    if (typeof config === 'string') {
      this.config = loadRiskConfig(config);
    } else {
      this.config = loadRiskConfigFromObject(config);
    }

    this.accountBalance = this.config.accountBalance;

    // Initialize components
    this.kellySizer = new KellySizer(this.config.kelly);
    this.varCalculator = new VaRCalculator(this.config.var);
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker, this.accountBalance);
    this.exposureManager = new ExposureManager(
      this.config.exposureLimits,
      this.config.blacklist
    );
    this.liquidationBuffer = new LiquidationBuffer(this.config.liquidationBuffer);
    this.volatilityMonitor = new VolatilityMonitor(this.config.volatility);

    // Set up monitoring callbacks
    this.setupMonitoring();

    logger.info('RiskEngine initialized', {
      accountBalance: this.accountBalance,
      kelly: this.config.kelly.enabled,
      var: this.config.var.enabled,
      circuitBreaker: this.config.circuitBreaker.enabled,
    });
  }

  /**
   * Setup real-time monitoring
   */
  private setupMonitoring(): void {
    // VaR monitoring
    if (this.config.var.enabled) {
      this.varCalculator.startMonitoring((result: VaRResult) => {
        if (this.config.logging.logVaR) {
          logger.info('VaR Update', {
            historicalVaR: (result.historicalVaR * 100).toFixed(2) + '%',
            monteCarloVaR: (result.monteCarloVaR * 100).toFixed(2) + '%',
            cvar: (result.cvar * 100).toFixed(2) + '%',
          });
        }
      });
    }

    // Liquidation buffer monitoring
    if (this.config.liquidationBuffer.enabled) {
      this.liquidationBuffer.startMonitoring((symbol: string, status: BufferStatus) => {
        if (!status.isHealthy) {
          logger.warn('Liquidation buffer warning', {
            symbol,
            buffer: (status.bufferPercent * 100).toFixed(2) + '%',
            action: status.recommendedAction,
          });

          // Auto-close on emergency
          if (status.recommendedAction === 'emergency_close') {
            logger.error('EMERGENCY: Position near liquidation', { symbol });
            // Emit event for emergency close
          }
        }
      });
    }

    // Volatility de-leveraging
    if (this.config.volatility.enabled) {
      this.volatilityMonitor.onDeleverageRequired((reduction: number) => {
        logger.warn('Volatility spike: De-leveraging positions', {
          reduction: `${(reduction * 100).toFixed(0)}%`,
        });
        // Implement position reduction logic
      });
    }

    // Update exposure manager with portfolio value
    this.exposureManager.updatePortfolioValue(this.accountBalance);
  }

  /**
   * Validate an order against all risk checks
   */
  validateOrder(
    order: Order,
    strategyName: string,
    leverage: number = 1,
    stats?: TradeStats
  ): {
    approved: boolean;
    reason?: string;
    adjustedQuantity?: number;
    warnings?: string[];
  } {
    const warnings: string[] = [];

    // 1. Check circuit breaker
    if (!this.circuitBreaker.isTradingAllowed()) {
      const state = this.circuitBreaker.getState();
      return {
        approved: false,
        reason: `Circuit breaker active: ${state.reasonForBreaker}`,
      };
    }

    // 2. Check exposure limits
    const positionValue = order.price * order.quantity;
    const exposureCheck = this.exposureManager.canOpenPosition(
      strategyName,
      order.symbol,
      positionValue,
      leverage
    );

    if (!exposureCheck.allowed) {
      return {
        approved: false,
        reason: exposureCheck.reason,
      };
    }

    // 3. Check volatility
    if (!this.volatilityMonitor.isVolatilityAcceptable()) {
      warnings.push('High volatility detected');
      const metrics = this.volatilityMonitor.getMetrics();
      if (metrics && metrics.volatilityLevel >= 8) {
        return {
          approved: false,
          reason: `Volatility too high: level ${metrics.volatilityLevel}/10`,
        };
      }
    }

    // 4. Check VaR
    const portfolioVaR = this.varCalculator.calculatePortfolioVaR(positionValue * leverage);
    const maxAcceptableVaR = this.accountBalance * 0.1; // 10% max VaR

    if (portfolioVaR.varAmount > maxAcceptableVaR) {
      warnings.push(
        `VaR ${portfolioVaR.varAmount.toFixed(2)} exceeds comfortable limit ${maxAcceptableVaR.toFixed(2)}`
      );
    }

    // 5. For perps, check liquidation buffer
    if (leverage > 1) {
      const entryPrice = order.price;
      const side = order.side === 'buy' ? 'long' : 'short';
      const bufferCheck = this.liquidationBuffer.canOpenPosition(
        entryPrice,
        order.quantity,
        leverage,
        side
      );

      if (!bufferCheck.allowed) {
        return {
          approved: false,
          reason: bufferCheck.reason,
          adjustedQuantity: bufferCheck.suggestedSize,
        };
      }
    }

    logger.info('Order approved by risk engine', {
      symbol: order.symbol,
      quantity: order.quantity,
      strategy: strategyName,
      warnings: warnings.length,
    });

    return {
      approved: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Calculate optimal position size using Kelly criterion
   */
  calculatePositionSize(
    entryPrice: number,
    stopLoss: number,
    symbol: string,
    strategyName: string,
    stats?: TradeStats
  ): number {
    let kellySize = this.kellySizer.calculatePositionSize(
      this.accountBalance,
      entryPrice,
      stopLoss,
      stats
    );

    // Adjust for volatility
    const metrics = this.volatilityMonitor.getMetrics();
    if (metrics && metrics.volatilityLevel > 5) {
      const volatilityAdjustment = 1 - ((metrics.volatilityLevel - 5) * 0.1);
      kellySize *= Math.max(0.5, volatilityAdjustment);
      logger.debug('Position size adjusted for volatility', {
        original: kellySize / volatilityAdjustment,
        adjusted: kellySize,
        level: metrics.volatilityLevel,
      });
    }

    return kellySize;
  }

  /**
   * Add trade result for Kelly optimization
   */
  recordTradeResult(profit: number, entryPrice: number): void {
    this.kellySizer.addTradeResult(profit, entryPrice);
  }

  /**
   * Update account balance and equity
   */
  updateEquity(equity: number): void {
    this.accountBalance = equity;
    this.circuitBreaker.updateEquity(equity);
    this.exposureManager.updatePortfolioValue(equity);

    if (this.config.logging.logExposure) {
      const exposure = this.exposureManager.getExposureSummary();
      logger.debug('Equity updated', {
        equity,
        exposure: (exposure.totalExposureRatio * 100).toFixed(2) + '%',
      });
    }
  }

  /**
   * Add price data for VaR and volatility monitoring
   */
  addPriceData(symbol: string, price: number, timestamp?: number): void {
    this.varCalculator.addPriceData(price, timestamp);
    this.volatilityMonitor.addPrice(price, timestamp);
  }

  /**
   * Add candle data for better volatility analysis
   */
  addCandleData(symbol: string, candle: Candle): void {
    this.volatilityMonitor.addCandle(candle);
  }

  /**
   * Register a new position
   */
  addPosition(strategyName: string, symbol: string, value: number, leverage: number = 1): void {
    this.exposureManager.addPosition(strategyName, symbol, value, leverage);
  }

  /**
   * Remove a position
   */
  removePosition(strategyName: string, symbol: string, value: number, leverage: number = 1): void {
    this.exposureManager.removePosition(strategyName, symbol, value, leverage);
  }

  /**
   * Register perpetual position for liquidation monitoring
   */
  addPerpPosition(position: PerpPosition): void {
    this.liquidationBuffer.updatePosition(position);
  }

  /**
   * Remove perpetual position from monitoring
   */
  removePerpPosition(symbol: string): void {
    this.liquidationBuffer.removePosition(symbol);
  }

  /**
   * Get current risk metrics
   */
  getRiskMetrics(): {
    circuitBreaker: DrawdownState;
    var: VaRResult | null;
    volatility: VolatilityMetrics | null;
    exposure: ReturnType<ExposureManager['getExposureSummary']>;
    kelly: TradeStats | null;
  } {
    return {
      circuitBreaker: this.circuitBreaker.getState(),
      var: this.varCalculator.getLatestVaR(),
      volatility: this.volatilityMonitor.getMetrics(),
      exposure: this.exposureManager.getExposureSummary(),
      kelly: this.kellySizer.getTradeStats(),
    };
  }

  /**
   * Manually reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.resetCircuitBreaker();
  }

  /**
   * Add token to blacklist
   */
  blacklistToken(token: string, reason?: string): void {
    this.exposureManager.blacklistToken(token, reason);
  }

  /**
   * Add strategy to blacklist
   */
  blacklistStrategy(strategyName: string, reason?: string): void {
    this.exposureManager.blacklistStrategy(strategyName, reason);
  }

  /**
   * Get unhealthy perpetual positions
   */
  getUnhealthyPerpPositions(): ReturnType<LiquidationBuffer['getUnhealthyPositions']> {
    return this.liquidationBuffer.getUnhealthyPositions();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RiskEngineConfig>): void {
    this.config = { ...this.config, ...config };

    // Update individual components
    if (config.kelly) this.kellySizer.updateConfig(config.kelly);
    if (config.var) this.varCalculator.updateConfig(config.var);
    if (config.circuitBreaker) this.circuitBreaker.updateConfig(config.circuitBreaker);
    if (config.exposureLimits) this.exposureManager.updateConfig(config.exposureLimits);
    if (config.liquidationBuffer) this.liquidationBuffer.updateConfig(config.liquidationBuffer);
    if (config.volatility) this.volatilityMonitor.updateConfig(config.volatility);

    logger.info('Risk engine configuration updated');
  }

  /**
   * Cleanup and stop monitoring
   */
  destroy(): void {
    this.varCalculator.stopMonitoring();
    this.liquidationBuffer.stopMonitoring();
    this.circuitBreaker.destroy();
    this.liquidationBuffer.destroy();

    logger.info('Risk engine destroyed');
  }
}
