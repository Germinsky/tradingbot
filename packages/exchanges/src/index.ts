// Core types
export * from './types';

// Base adapter
export { BaseAdapter } from './adapters/base-adapter';

// Uniswap V2 and forks
export {
  UniswapV2Adapter,
  createUniswapV2Adapter,
  createSushiSwapAdapter,
  createPancakeSwapAdapter,
} from './adapters/uniswap-v2';

// Uniswap V3
export { UniswapV3Adapter, createUniswapV3Adapter } from './adapters/uniswap-v3';

// Aggregators
export { ZeroExAdapter, createZeroExAdapter } from './adapters/zerox';
export { OneInchAdapter, createOneInchAdapter } from './adapters/oneinch';

// CoW Swap
export { CowSwapAdapter, createCowSwapAdapter } from './adapters/cowswap';

// Cross-chain bridges (TODO: Fix compilation issues)
// export { AcrossAdapter, createAcrossAdapter } from './adapters/across';

// MEV Protection (TODO: Fix compilation issues)
// export {
//   MEVProtectionMiddleware,
//   FlashbotsAdapter,
//   wrapWithMEVProtection,
// } from './adapters/mev-protection';

// Legacy exports for backward compatibility
export { BaseExchange } from './base';
export { UniswapExchange } from './uniswap';
