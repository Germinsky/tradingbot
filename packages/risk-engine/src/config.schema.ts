import { z } from 'zod';

/**
 * Zod schema for risk engine configuration
 * Validates YAML config files for type safety
 */

export const KellyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  fractionalKelly: z.number().min(0.1).max(1.0).default(0.25),
  minWinRate: z.number().min(0).max(1).default(0.4),
  maxPositionPercent: z.number().min(0.01).max(0.5).default(0.1),
});

export const VaRConfigSchema = z.object({
  enabled: z.boolean().default(true),
  method: z.enum(['historical', 'monte-carlo', 'both']).default('both'),
  confidenceLevel: z.number().min(0.9).max(0.99).default(0.95),
  lookbackPeriod: z.number().min(50).max(1000).default(252),
  monteCarloSimulations: z.number().min(1000).max(100000).default(10000),
  updateFrequencyMs: z.number().min(1000).max(60000).default(5000),
});

export const CircuitBreakerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxDailyDrawdown: z.number().min(0.01).max(0.5).default(0.15),
  maxTotalDrawdown: z.number().min(0.1).max(0.8).default(0.25),
  cooldownPeriodMs: z.number().min(60000).max(86400000).default(3600000), // 1 hour default
  autoResetOnRecovery: z.boolean().default(false),
  recoveryThreshold: z.number().min(0).max(1).default(0.5), // 50% recovery
});

export const ExposureLimitsConfigSchema = z.object({
  maxTotalExposure: z.number().min(0.1).max(10).default(1.0), // 1x leverage default
  maxPerStrategyExposure: z.number().min(0.01).max(5).default(0.3),
  maxPerTokenExposure: z.number().min(0.01).max(1).default(0.25),
  maxCorrelatedExposure: z.number().min(0.01).max(1).default(0.5),
  correlationThreshold: z.number().min(0.5).max(1).default(0.7),
});

export const LiquidationBufferConfigSchema = z.object({
  enabled: z.boolean().default(true),
  minBufferPercent: z.number().min(0.01).max(0.5).default(0.05),
  targetBufferPercent: z.number().min(0.05).max(0.8).default(0.2),
  emergencyCloseThreshold: z.number().min(0.01).max(0.1).default(0.02),
  checkFrequencyMs: z.number().min(1000).max(30000).default(5000),
});

export const VolatilityConfigSchema = z.object({
  enabled: z.boolean().default(true),
  method: z.enum(['bollinger', 'atr', 'garch']).default('bollinger'),
  bollingerPeriod: z.number().min(10).max(100).default(20),
  bollingerStdDev: z.number().min(1).max(4).default(2),
  bandwidthThreshold: z.number().min(0.01).max(0.5).default(0.1),
  atrPeriod: z.number().min(5).max(50).default(14),
  atrMultiplier: z.number().min(1).max(5).default(2),
  deleveragePercent: z.number().min(0.1).max(1).default(0.5),
  maxVolatilityLevel: z.number().min(1).max(10).default(3),
});

export const BlacklistConfigSchema = z.object({
  tokens: z.array(z.string()).default([]),
  strategies: z.array(z.string()).default([]),
  exchanges: z.array(z.string()).default([]),
  autoBlacklistOnLoss: z.boolean().default(false),
  autoBlacklistThreshold: z.number().min(0.1).max(0.9).default(0.5),
});

export const RiskEngineConfigSchema = z.object({
  accountBalance: z.number().min(0).default(10000),
  baseCurrency: z.string().default('USD'),
  kelly: KellyConfigSchema,
  var: VaRConfigSchema,
  circuitBreaker: CircuitBreakerConfigSchema,
  exposureLimits: ExposureLimitsConfigSchema,
  liquidationBuffer: LiquidationBufferConfigSchema,
  volatility: VolatilityConfigSchema,
  blacklist: BlacklistConfigSchema,
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    logVaR: z.boolean().default(true),
    logExposure: z.boolean().default(true),
  }).default({}),
});

export type KellyConfig = z.infer<typeof KellyConfigSchema>;
export type VaRConfig = z.infer<typeof VaRConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export type ExposureLimitsConfig = z.infer<typeof ExposureLimitsConfigSchema>;
export type LiquidationBufferConfig = z.infer<typeof LiquidationBufferConfigSchema>;
export type VolatilityConfig = z.infer<typeof VolatilityConfigSchema>;
export type BlacklistConfig = z.infer<typeof BlacklistConfigSchema>;
export type RiskEngineConfig = z.infer<typeof RiskEngineConfigSchema>;
