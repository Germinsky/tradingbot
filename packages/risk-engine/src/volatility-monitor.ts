import { logger } from '@trading-bot/core';
import { VolatilityConfig } from './config.schema.js';

export interface VolatilityMetrics {
  currentVolatility: number;
  bollingerBandwidth: number;
  atr: number;
  volatilityLevel: number; // 1-10 scale
  shouldDeleverage: boolean;
  recommendedLeverageReduction: number;
  timestamp: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Volatility Monitor with Automatic De-leveraging
 * Tracks volatility using Bollinger Bands and ATR
 * Triggers position reduction when volatility spikes
 */
export class VolatilityMonitor {
  private config: VolatilityConfig;
  private priceHistory: number[] = [];
  private candles: Candle[] = [];
  private currentMetrics: VolatilityMetrics | null = null;
  private deleverageCallback: ((reduction: number) => void) | null = null;

  constructor(config: VolatilityConfig) {
    this.config = config;
  }

  /**
   * Add new price data
   */
  addPrice(price: number, timestamp: number = Date.now()): void {
    this.priceHistory.push(price);

    // Keep lookback period
    if (this.priceHistory.length > this.config.bollingerPeriod * 2) {
      this.priceHistory.shift();
    }

    // Update metrics
    if (this.priceHistory.length >= this.config.bollingerPeriod) {
      this.updateMetrics();
    }
  }

  /**
   * Add new candle data (more accurate for ATR)
   */
  addCandle(candle: Candle): void {
    this.candles.push(candle);
    this.priceHistory.push(candle.close);

    // Keep lookback period
    const maxCandles = Math.max(this.config.bollingerPeriod, this.config.atrPeriod) * 2;
    if (this.candles.length > maxCandles) {
      this.candles.shift();
    }
    if (this.priceHistory.length > maxCandles) {
      this.priceHistory.shift();
    }

    // Update metrics
    if (this.candles.length >= Math.max(this.config.bollingerPeriod, this.config.atrPeriod)) {
      this.updateMetrics();
    }
  }

  /**
   * Update volatility metrics
   */
  private updateMetrics(): void {
    let bandwidth = 0;
    let atr = 0;
    let volatilityLevel = 1;
    let currentVolatility = 0;

    // Calculate Bollinger Bands bandwidth
    if (this.config.method === 'bollinger' || this.config.method === 'atr') {
      const bb = this.calculateBollingerBands();
      bandwidth = bb.bandwidth;
      currentVolatility = bb.stdDev;
    }

    // Calculate ATR
    if ((this.config.method === 'atr' || this.config.method === 'bollinger') && this.candles.length >= this.config.atrPeriod) {
      atr = this.calculateATR();
      if (this.config.method === 'atr') {
        currentVolatility = atr;
      }
    }

    // Determine volatility level (1-10 scale)
    volatilityLevel = this.calculateVolatilityLevel(bandwidth, atr);

    // Check if de-leveraging is needed
    const shouldDeleverage = this.shouldTriggerDeleverage(bandwidth, volatilityLevel);
    const recommendedLeverageReduction = shouldDeleverage
      ? this.config.deleveragePercent
      : 0;

    this.currentMetrics = {
      currentVolatility,
      bollingerBandwidth: bandwidth,
      atr,
      volatilityLevel,
      shouldDeleverage,
      recommendedLeverageReduction,
      timestamp: Date.now(),
    };

    // Trigger de-leverage if needed
    if (shouldDeleverage && this.deleverageCallback) {
      logger.warn('Volatility spike detected, triggering de-leverage', {
        bandwidth: bandwidth.toFixed(4),
        level: volatilityLevel,
        reduction: `${(recommendedLeverageReduction * 100).toFixed(0)}%`,
      });
      this.deleverageCallback(recommendedLeverageReduction);
    }

    logger.debug('Volatility metrics updated', {
      bandwidth: bandwidth.toFixed(4),
      atr: atr.toFixed(2),
      level: volatilityLevel,
    });
  }

  /**
   * Calculate Bollinger Bands and bandwidth
   */
  private calculateBollingerBands(): {
    sma: number;
    upperBand: number;
    lowerBand: number;
    bandwidth: number;
    stdDev: number;
  } {
    const period = this.config.bollingerPeriod;
    const prices = this.priceHistory.slice(-period);

    // Calculate SMA
    const sma = prices.reduce((sum, p) => sum + p, 0) / period;

    // Calculate standard deviation
    const squaredDiffs = prices.map((p) => Math.pow(p - sma, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / period;
    const stdDev = Math.sqrt(variance);

    // Calculate bands
    const upperBand = sma + this.config.bollingerStdDev * stdDev;
    const lowerBand = sma - this.config.bollingerStdDev * stdDev;

    // Calculate bandwidth (normalized)
    const bandwidth = (upperBand - lowerBand) / sma;

    return {
      sma,
      upperBand,
      lowerBand,
      bandwidth,
      stdDev,
    };
  }

  /**
   * Calculate Average True Range (ATR)
   */
  private calculateATR(): number {
    const period = this.config.atrPeriod;
    const candles = this.candles.slice(-period);

    if (candles.length < 2) return 0;

    const trueRanges: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    // Simple average of true ranges
    const atr = trueRanges.reduce((sum, tr) => sum + tr, 0) / trueRanges.length;

    return atr;
  }

  /**
   * Calculate volatility level on 1-10 scale
   */
  private calculateVolatilityLevel(bandwidth: number, atr: number): number {
    let level = 1;

    if (this.config.method === 'bollinger') {
      // Map bandwidth to 1-10 scale
      const normalizedBandwidth = bandwidth / this.config.bandwidthThreshold;
      level = Math.min(10, Math.max(1, Math.ceil(normalizedBandwidth * 3)));
    } else if (this.config.method === 'atr') {
      // Map ATR to 1-10 scale based on current price
      const currentPrice = this.priceHistory[this.priceHistory.length - 1] || 1;
      const atrPercent = atr / currentPrice;
      const normalizedATR = atrPercent / 0.02; // 2% as baseline
      level = Math.min(10, Math.max(1, Math.ceil(normalizedATR * 3)));
    }

    return level;
  }

  /**
   * Check if de-leveraging should be triggered
   */
  private shouldTriggerDeleverage(bandwidth: number, volatilityLevel: number): boolean {
    if (!this.config.enabled) return false;

    // Check Bollinger bandwidth threshold
    if (this.config.method === 'bollinger' && bandwidth > this.config.bandwidthThreshold) {
      return true;
    }

    // Check volatility level
    if (volatilityLevel >= this.config.maxVolatilityLevel) {
      return true;
    }

    return false;
  }

  /**
   * Register callback for de-leverage events
   */
  onDeleverageRequired(callback: (reduction: number) => void): void {
    this.deleverageCallback = callback;
  }

  /**
   * Get current volatility metrics
   */
  getMetrics(): VolatilityMetrics | null {
    return this.currentMetrics;
  }

  /**
   * Check if current volatility is acceptable for a position
   */
  isVolatilityAcceptable(maxAcceptableLevel: number = 5): boolean {
    if (!this.currentMetrics) return true;
    return this.currentMetrics.volatilityLevel <= maxAcceptableLevel;
  }

  /**
   * Calculate recommended leverage based on current volatility
   */
  calculateRecommendedLeverage(baseLeverage: number): number {
    if (!this.currentMetrics) return baseLeverage;

    const volatilityLevel = this.currentMetrics.volatilityLevel;

    // Reduce leverage as volatility increases
    // Level 1-3: Full leverage
    // Level 4-6: 75% leverage
    // Level 7-9: 50% leverage
    // Level 10: 25% leverage

    if (volatilityLevel <= 3) {
      return baseLeverage;
    } else if (volatilityLevel <= 6) {
      return baseLeverage * 0.75;
    } else if (volatilityLevel <= 9) {
      return baseLeverage * 0.5;
    } else {
      return baseLeverage * 0.25;
    }
  }

  /**
   * Get Bollinger Band position (0 = lower band, 0.5 = SMA, 1 = upper band)
   */
  getBollingerPosition(): number | null {
    if (this.priceHistory.length < this.config.bollingerPeriod) return null;

    const bb = this.calculateBollingerBands();
    const currentPrice = this.priceHistory[this.priceHistory.length - 1];

    if (currentPrice <= bb.lowerBand) return 0;
    if (currentPrice >= bb.upperBand) return 1;

    return (currentPrice - bb.lowerBand) / (bb.upperBand - bb.lowerBand);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VolatilityConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Volatility configuration updated', config);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.priceHistory = [];
    this.candles = [];
    this.currentMetrics = null;
    logger.info('Volatility history cleared');
  }
}
