// Core types
export * from './types.js';

// Base adapter
export { BaseAdapter } from './adapters/base-adapter.js';

// Uniswap V2 and forks
export {
  UniswapV2Adapter,
  createUniswapV2Adapter,
  createSushiSwapAdapter,
  createPancakeSwapAdapter,
} from './adapters/uniswap-v2.js';

// Uniswap V3
export { UniswapV3Adapter, createUniswapV3Adapter } from './adapters/uniswap-v3.js';

// Aggregators
export { ZeroExAdapter, createZeroExAdapter } from './adapters/zerox.js';
export { OneInchAdapter, createOneInchAdapter } from './adapters/oneinch.js';

// CoW Swap
export { CowSwapAdapter, createCowSwapAdapter } from './adapters/cowswap.js';

// Cross-chain bridges (TODO: Fix compilation issues)
// export { AcrossAdapter, createAcrossAdapter } from './adapters/across';

// MEV Protection (TODO: Fix compilation issues)
// export {
//   MEVProtectionMiddleware,
//   FlashbotsAdapter,
//   wrapWithMEVProtection,
// } from './adapters/mev-protection';

// Perpetual DEX adapters
export * from './perps/index.js';

// Legacy exports for backward compatibility
export { BaseExchange } from './base.js';
export { UniswapExchange } from './uniswap.js';
