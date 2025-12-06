// Legacy exports (backward compatible)
export * from './event-queue.js';
export { Backtester, BacktestConfig } from './backtester.js';
export { PerformanceMetrics as LegacyPerformanceMetrics } from './metrics.js';

// Data loading
export * from './data-loader';

// Slippage modeling
export * from './slippage-model';

// Metrics and analytics
export * from './metrics-calculator';

// HTML reporting
export * from './html-reporter';

// High-performance backtester
export * from './high-performance-backtester';

// Parallel execution
export * from './parallel-backtester';

// Example strategies
export * from './example-strategies';
