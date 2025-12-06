// Legacy exports (maintained for backward compatibility)
export * from './position-sizer.js';
export * from './drawdown.js';
export * from './risk-manager.js';

// New comprehensive risk engine
export { RiskEngine } from './risk-engine.js';

// Configuration schema and types
export {
  RiskEngineConfigSchema,
  KellyConfigSchema,
  VaRConfigSchema,
  CircuitBreakerConfigSchema,
  ExposureLimitsConfigSchema,
  LiquidationBufferConfigSchema,
  VolatilityConfigSchema,
  BlacklistConfigSchema,
  type RiskEngineConfig,
  type KellyConfig,
  type VaRConfig,
  type CircuitBreakerConfig,
  type ExposureLimitsConfig,
  type LiquidationBufferConfig,
  type VolatilityConfig,
  type BlacklistConfig,
} from './config.schema.js';

// Configuration loader
export {
  loadRiskConfig,
  loadRiskConfigFromObject,
  getDefaultRiskConfig,
  saveRiskConfig,
} from './config-loader.js';

// Individual components (for advanced usage)
export { KellySizer, type TradeStats } from './kelly-sizer.js';
export { VaRCalculator, type VaRResult, type PriceReturn } from './var-calculator.js';
export { CircuitBreaker, type DrawdownState } from './circuit-breaker.js';
export {
  ExposureManager,
  type StrategyExposure,
  type TokenExposure,
} from './exposure-manager.js';
export {
  LiquidationBuffer,
  type PerpPosition,
  type BufferStatus,
} from './liquidation-buffer.js';
export {
  VolatilityMonitor,
  type VolatilityMetrics,
  type Candle,
} from './volatility-monitor.js';
