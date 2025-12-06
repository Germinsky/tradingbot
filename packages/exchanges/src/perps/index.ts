// Export base types and interfaces
export type {
  PerpPosition,
  PerpOrderParams,
  PerpMarketInfo,
  PerpAdapter,
} from '../perp-adapter.js';

export { BasePerpAdapter } from '../perp-adapter.js';

// Export GMX adapters
export { GMXAdapter } from './gmx-adapter.js';
export { createGMXArbitrumAdapter, createGMXAvalancheAdapter } from './gmx-adapter.js';

// Export Gains Network adapters
export { GainsAdapter } from './gains-adapter.js';
export { createGainsPolygonAdapter, createGainsArbitrumAdapter } from './gains-adapter.js';

// Export dYdX adapter
export { DYDXAdapter } from './dydx-adapter.js';
export { createDYDXAdapter } from './dydx-adapter.js';

// Export Perpetual Protocol adapter
export { PerpProtocolAdapter } from './perp-protocol-adapter.js';
export { createPerpProtocolAdapter } from './perp-protocol-adapter.js';

// Export Kwenta adapter
export { KwentaAdapter } from './kwenta-adapter.js';
export { createKwentaAdapter } from './kwenta-adapter.js';

// Import factory functions for the convenience object
import { createGMXArbitrumAdapter, createGMXAvalancheAdapter } from './gmx-adapter.js';
import { createGainsPolygonAdapter, createGainsArbitrumAdapter } from './gains-adapter.js';
import { createDYDXAdapter } from './dydx-adapter.js';
import { createPerpProtocolAdapter } from './perp-protocol-adapter.js';
import { createKwentaAdapter } from './kwenta-adapter.js';

// Convenience exports for factory functions
export const PerpAdapterFactories = {
  // GMX V2
  gmxArbitrum: createGMXArbitrumAdapter,
  gmxAvalanche: createGMXAvalancheAdapter,
  
  // Gains Network
  gainsPolygon: createGainsPolygonAdapter,
  gainsArbitrum: createGainsArbitrumAdapter,
  
  // dYdX V4
  dydx: createDYDXAdapter,
  
  // Perpetual Protocol V2
  perpProtocol: createPerpProtocolAdapter,
  
  // Kwenta
  kwenta: createKwentaAdapter,
} as const;

// Protocol identifiers
export enum PerpProtocol {
  GMX_ARBITRUM = 'gmx-arbitrum',
  GMX_AVALANCHE = 'gmx-avalanche',
  GAINS_POLYGON = 'gains-polygon',
  GAINS_ARBITRUM = 'gains-arbitrum',
  DYDX = 'dydx',
  PERP_PROTOCOL = 'perp-protocol',
  KWENTA = 'kwenta',
}

// Helper to create adapter from protocol identifier
export function createPerpAdapter(protocol: PerpProtocol, rpcUrl: string, privateKey?: string): any {
  switch (protocol) {
    case PerpProtocol.GMX_ARBITRUM:
      return createGMXArbitrumAdapter(rpcUrl, privateKey as `0x${string}`);
    case PerpProtocol.GMX_AVALANCHE:
      return createGMXAvalancheAdapter(rpcUrl, privateKey as `0x${string}`);
    case PerpProtocol.GAINS_POLYGON:
      return createGainsPolygonAdapter(rpcUrl, privateKey as `0x${string}`);
    case PerpProtocol.GAINS_ARBITRUM:
      return createGainsArbitrumAdapter(rpcUrl, privateKey as `0x${string}`);
    case PerpProtocol.DYDX:
      return createDYDXAdapter(rpcUrl, privateKey);
    case PerpProtocol.PERP_PROTOCOL:
      return createPerpProtocolAdapter(rpcUrl, privateKey as `0x${string}`);
    case PerpProtocol.KWENTA:
      return createKwentaAdapter(rpcUrl, privateKey as `0x${string}`);
    default:
      throw new Error(`Unknown protocol: ${protocol}`);
  }
}
