import { logger } from '@trading-bot/core';
import { LiquidationBufferConfig } from './config.schema.js';

export interface PerpPosition {
  symbol: string;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  collateral: number;
  leverage: number;
  side: 'long' | 'short';
}

export interface BufferStatus {
  bufferPercent: number;
  isHealthy: boolean;
  distanceToLiquidation: number;
  recommendedAction: 'none' | 'add_collateral' | 'reduce_position' | 'emergency_close';
}

/**
 * Liquidation Buffer Calculator for Perpetual Positions
 * Monitors distance to liquidation and triggers warnings/actions
 */
export class LiquidationBuffer {
  private config: LiquidationBufferConfig;
  private positions: Map<string, PerpPosition> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config: LiquidationBufferConfig) {
    this.config = config;
  }

  /**
   * Start monitoring liquidation buffers
   */
  startMonitoring(callback: (symbol: string, status: BufferStatus) => void): void {
    if (!this.config.enabled) {
      logger.warn('Liquidation buffer monitoring is disabled');
      return;
    }

    this.monitoringInterval = setInterval(() => {
      for (const [symbol, position] of this.positions.entries()) {
        const status = this.calculateBufferStatus(position);
        callback(symbol, status);

        // Log warnings for unhealthy positions
        if (!status.isHealthy) {
          logger.warn('Liquidation buffer unhealthy', {
            symbol,
            buffer: (status.bufferPercent * 100).toFixed(2) + '%',
            action: status.recommendedAction,
          });
        }
      }
    }, this.config.checkFrequencyMs);

    logger.info('Liquidation buffer monitoring started', {
      frequency: `${this.config.checkFrequencyMs}ms`,
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Liquidation buffer monitoring stopped');
    }
  }

  /**
   * Add or update a perpetual position
   */
  updatePosition(position: PerpPosition): void {
    this.positions.set(position.symbol, position);
    
    const status = this.calculateBufferStatus(position);
    logger.debug('Perpetual position updated', {
      symbol: position.symbol,
      buffer: (status.bufferPercent * 100).toFixed(2) + '%',
      liquidationPrice: position.liquidationPrice.toFixed(2),
    });
  }

  /**
   * Remove a position from monitoring
   */
  removePosition(symbol: string): void {
    this.positions.delete(symbol);
    logger.info('Perpetual position removed from monitoring', { symbol });
  }

  /**
   * Calculate liquidation price for a position
   */
  calculateLiquidationPrice(
    entryPrice: number,
    leverage: number,
    side: 'long' | 'short',
    maintenanceMarginRate: number = 0.005 // 0.5% default
  ): number {
    if (side === 'long') {
      // Long liquidation: entryPrice * (1 - 1/leverage + maintenanceMarginRate)
      return entryPrice * (1 - 1 / leverage + maintenanceMarginRate);
    } else {
      // Short liquidation: entryPrice * (1 + 1/leverage - maintenanceMarginRate)
      return entryPrice * (1 + 1 / leverage - maintenanceMarginRate);
    }
  }

  /**
   * Calculate buffer status for a position
   */
  calculateBufferStatus(position: PerpPosition): BufferStatus {
    const distanceToLiquidation = this.calculateDistanceToLiquidation(position);
    const bufferPercent = distanceToLiquidation / position.markPrice;

    let recommendedAction: BufferStatus['recommendedAction'] = 'none';
    let isHealthy = true;

    if (bufferPercent <= this.config.emergencyCloseThreshold) {
      recommendedAction = 'emergency_close';
      isHealthy = false;
    } else if (bufferPercent <= this.config.minBufferPercent) {
      recommendedAction = 'reduce_position';
      isHealthy = false;
    } else if (bufferPercent <= this.config.targetBufferPercent) {
      recommendedAction = 'add_collateral';
      isHealthy = false;
    }

    return {
      bufferPercent,
      isHealthy,
      distanceToLiquidation,
      recommendedAction,
    };
  }

  /**
   * Calculate distance from current price to liquidation
   */
  private calculateDistanceToLiquidation(position: PerpPosition): number {
    if (position.side === 'long') {
      return position.markPrice - position.liquidationPrice;
    } else {
      return position.liquidationPrice - position.markPrice;
    }
  }

  /**
   * Calculate required collateral to maintain target buffer
   */
  calculateRequiredCollateral(
    position: PerpPosition,
    targetBuffer: number = this.config.targetBufferPercent
  ): number {
    const positionSize = position.collateral * position.leverage;
    const targetLiquidationDistance = position.markPrice * targetBuffer;

    let targetLiquidationPrice: number;
    if (position.side === 'long') {
      targetLiquidationPrice = position.markPrice - targetLiquidationDistance;
    } else {
      targetLiquidationPrice = position.markPrice + targetLiquidationDistance;
    }

    // Calculate required collateral based on target liquidation price
    const priceChange = Math.abs(position.markPrice - targetLiquidationPrice);
    const requiredCollateral = (positionSize * priceChange) / position.markPrice;

    return Math.max(0, requiredCollateral - position.collateral);
  }

  /**
   * Calculate optimal position size given collateral and desired buffer
   */
  calculateOptimalPositionSize(
    collateral: number,
    entryPrice: number,
    leverage: number,
    side: 'long' | 'short'
  ): number {
    const targetBuffer = this.config.targetBufferPercent;
    const maintenanceMarginRate = 0.005;

    // Account for buffer in effective leverage
    let effectiveLeverage = leverage;

    if (side === 'long') {
      effectiveLeverage = 1 / (1 / leverage - targetBuffer + maintenanceMarginRate);
    } else {
      effectiveLeverage = 1 / (1 / leverage + targetBuffer - maintenanceMarginRate);
    }

    effectiveLeverage = Math.min(effectiveLeverage, leverage * 0.9); // Cap at 90% of max

    return (collateral * effectiveLeverage) / entryPrice;
  }

  /**
   * Check if position can be opened with safe buffer
   */
  canOpenPosition(
    entryPrice: number,
    positionSize: number,
    leverage: number,
    side: 'long' | 'short'
  ): { allowed: boolean; reason?: string; suggestedSize?: number } {
    const collateral = (entryPrice * positionSize) / leverage;
    const liquidationPrice = this.calculateLiquidationPrice(entryPrice, leverage, side);

    const distance = side === 'long' 
      ? entryPrice - liquidationPrice 
      : liquidationPrice - entryPrice;
    
    const bufferPercent = distance / entryPrice;

    if (bufferPercent < this.config.minBufferPercent) {
      const optimalSize = this.calculateOptimalPositionSize(
        collateral,
        entryPrice,
        leverage,
        side
      );

      return {
        allowed: false,
        reason: `Liquidation buffer ${(bufferPercent * 100).toFixed(2)}% below minimum ${(this.config.minBufferPercent * 100).toFixed(2)}%`,
        suggestedSize: optimalSize,
      };
    }

    return { allowed: true };
  }

  /**
   * Get all positions with unhealthy buffers
   */
  getUnhealthyPositions(): Array<{ symbol: string; position: PerpPosition; status: BufferStatus }> {
    const unhealthy: Array<{ symbol: string; position: PerpPosition; status: BufferStatus }> = [];

    for (const [symbol, position] of this.positions.entries()) {
      const status = this.calculateBufferStatus(position);
      if (!status.isHealthy) {
        unhealthy.push({ symbol, position, status });
      }
    }

    return unhealthy;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LiquidationBufferConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Liquidation buffer configuration updated', config);
  }

  /**
   * Get current position
   */
  getPosition(symbol: string): PerpPosition | undefined {
    return this.positions.get(symbol);
  }

  /**
   * Get all positions
   */
  getAllPositions(): Map<string, PerpPosition> {
    return new Map(this.positions);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopMonitoring();
    this.positions.clear();
  }
}
