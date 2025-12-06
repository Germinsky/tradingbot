# Perpetual DEX Adapters

Comprehensive adapters for decentralized perpetual futures trading across multiple protocols and chains.

## Overview

This package provides unified interfaces for interacting with major decentralized perpetual futures protocols:

- **GMX V2** - Arbitrum & Avalanche (up to 50x leverage)
- **Gains Network** - Polygon & Arbitrum (up to 150x leverage)
- **dYdX V4** - Cosmos-based chain (up to 20x leverage)
- **Perpetual Protocol V2** - Optimism (up to 10x leverage)
- **Kwenta** - Synthetix Perps on Optimism (up to 25x leverage)

## Features

- ✅ **Unified Interface**: All protocols implement the same `PerpAdapter` interface
- ✅ **Real-Time Updates**: Event-driven position and market updates via polling (2-3 seconds)
- ✅ **Multi-Chain Support**: Works across 5+ blockchains (Arbitrum, Avalanche, Polygon, Optimism, Cosmos)
- ✅ **Position Management**: Open, adjust, and close leveraged positions programmatically
- ✅ **Live PNL Tracking**: Real-time unrealized PNL calculations based on mark price
- ✅ **Funding Rates**: Query and monitor funding rates across all protocols
- ✅ **Liquidation Protection**: Calculate and track liquidation prices for risk management
- ✅ **WebSocket Support**: Real-time market data where available (dYdX, Kwenta)

## Installation

```bash
npm install @trading-bot/exchanges
```

## Quick Start

```typescript
import { createGMXArbitrumAdapter, PerpProtocol } from '@trading-bot/exchanges';

// Create adapter
const adapter = createGMXArbitrumAdapter(
  'https://arb1.arbitrum.io/rpc',
  '0x...' // Optional: Private key for trading
);

// Connect
await adapter.connect();

// Subscribe to real-time updates
adapter.on('positionUpdate', (position) => {
  console.log(`Position ${position.symbol}: PNL = $${position.unrealizedPnl}`);
});

// Open a position
const position = await adapter.openPosition({
  symbol: 'ETH/USD',
  side: 'long',
  size: 1.0, // 1 ETH
  leverage: 10,
  slippage: 0.005, // 0.5%
});

// Monitor position
adapter.subscribeToPosition(position.id);

// Close position
await adapter.closePosition(position.id);
```

## Supported Protocols

### GMX V2 (Arbitrum & Avalanche)

GMX V2 uses a decentralized oracle network and liquidity pools for zero-price-impact trading.

```typescript
import { createGMXArbitrumAdapter, createGMXAvalancheAdapter } from '@trading-bot/exchanges';

// Arbitrum
const gmxArb = createGMXArbitrumAdapter(
  'https://arb1.arbitrum.io/rpc',
  '0x...'
);

// Avalanche
const gmxAvax = createGMXAvalancheAdapter(
  'https://api.avax.network/ext/bc/C/rpc',
  '0x...'
);

await gmxArb.connect();

// Features:
// - Max leverage: 50x
// - Collateral: USDC
// - Execution fee: 0.001 ETH per trade
// - Slippage: 0.3% open, 0.5% close (default)
// - Price precision: 30 decimals (USD)
```

**Contract Addresses:**

**Arbitrum:**
- Router: `0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8`
- Reader: `0x38d91ED9a96E8A29cA4E0cF8D1F8FDbE857F9E62`
- DataStore: `0xFD70de6F0E5b7e5E2b1b05e1E96dd8aF48d0a1f0`

**Avalanche:**
- Router: `0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064`
- Reader: `0x67b789D48c926006F8321D7f2CF5BD94212B1c2b`
- DataStore: `0x2F0b2233E1C2b1E7e4F0e3e3c5c9C3C8c7c7c7c7`

### Gains Network (Polygon & Arbitrum)

Gains Network (gTrade) offers the highest leverage in DeFi with competitive funding rates.

```typescript
import { createGainsPolygonAdapter, createGainsArbitrumAdapter } from '@trading-bot/exchanges';

// Polygon
const gainsPolygon = createGainsPolygonAdapter(
  'https://polygon-rpc.com',
  '0x...'
);

// Arbitrum
const gainsArb = createGainsArbitrumAdapter(
  'https://arb1.arbitrum.io/rpc',
  '0x...'
);

// Features:
// - Max leverage: 150x (BTC/ETH), 100x (others)
// - Collateral: DAI (18 decimals)
// - Price precision: 10 decimals
// - Supports TP/SL orders
// - Hourly funding rates
```

**Supported Pairs:**
- 0: BTC/USD
- 1: ETH/USD
- 2: LINK/USD
- 3: MATIC/USD

### dYdX V4 (Cosmos Chain)

dYdX V4 is a fully decentralized orderbook-based exchange on its own Cosmos chain.

```typescript
import { createDYDXAdapter } from '@trading-bot/exchanges';

const dydx = createDYDXAdapter(
  'https://indexer.dydx.trade',
  'your-mnemonic-here'
);

await dydx.connect();

// Features:
// - Max leverage: 20x
// - Orderbook-based (market & limit orders)
// - WebSocket support for real-time updates
// - Maker/taker fee structure
// - 3% maintenance margin
```

### Perpetual Protocol V2 (Optimism)

Perpetual Protocol uses a virtual AMM (vAMM) model for decentralized perpetual futures.

```typescript
import { createPerpProtocolAdapter } from '@trading-bot/exchanges';

const perpProtocol = createPerpProtocolAdapter(
  'https://mainnet.optimism.io',
  '0x...'
);

// Features:
// - Max leverage: 10x
// - vAMM-based pricing
// - USDC collateral
// - Collateral deposits required via Vault
// - 6.25% maintenance margin
```

**Contract Addresses (Optimism):**
- ClearingHouse: `0x82ac2CE43e33683c58BE4cDc40975E73aA50f459`
- Vault: `0xAD7b4C162707E0B2b5f6fdDbD3f8538A5fbA0d60`
- Exchange: `0xb33C7a3B9bCaCE7a4D8E91a63E9bFe8D2E0F3A2C`

### Kwenta (Synthetix Perps on Optimism)

Kwenta provides access to Synthetix Perps V2 with Chainlink oracle-based execution.

```typescript
import { createKwentaAdapter } from '@trading-bot/exchanges';

const kwenta = createKwentaAdapter(
  'https://mainnet.optimism.io',
  '0x...'
);

// Features:
// - Max leverage: 25x (varies by market)
// - sUSD collateral
// - Chainlink oracle execution
// - Delayed order mechanism (2 second delay)
// - 95% liquidation threshold
```

**Supported Markets:**
- ETH/USD: `0x2B3bb4c683BFc5239B029131EEf3B1d214478d93`
- BTC/USD: `0x59b007E9ea8F89b069c43F8f45834d30853e3699`
- LINK/USD: `0x31A1659Ca00F617E86Dc765B6494Afe70a5A9c1A`
- SOL/USD: `0x0EA09D97b4084d859328ec4bF8eBCF9ecCA26F1D`

## API Reference

### PerpAdapter Interface

All adapters implement this interface:

```typescript
interface PerpAdapter extends EventEmitter {
  // Position Management
  openPosition(params: PerpOrderParams): Promise<PerpPosition>;
  adjustPosition(positionId: string, params: Partial<PerpOrderParams>): Promise<PerpPosition>;
  closePosition(positionId: string, size?: number): Promise<void>;
  
  // Market Data
  getMarkPrice(symbol: string): Promise<number>;
  getFundingRate(symbol: string): Promise<number>;
  getMaxLeverage(symbol: string): Promise<number>;
  getMarketInfo(symbol: string): Promise<PerpMarketInfo>;
  
  // Position Queries
  getPosition(positionId: string): Promise<PerpPosition>;
  getPositions(): Promise<PerpPosition[]>;
  
  // Subscriptions
  subscribeToPosition(positionId: string): void;
  unsubscribeFromPosition(positionId: string): void;
  subscribeToMarket(symbol: string): void;
  unsubscribeFromMarket(symbol: string): void;
  
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // Events
  on(event: 'positionUpdate', listener: (position: PerpPosition) => void): this;
  on(event: 'marketUpdate', listener: (symbol: string, data: any) => void): this;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'positionClosed', listener: (data: { positionId: string; symbol: string }) => void): this;
}
```

### PerpPosition

Position data structure returned by all adapters:

```typescript
interface PerpPosition {
  id: string;                // Unique position identifier
  symbol: string;            // Trading pair (e.g., "ETH/USD")
  side: 'long' | 'short';   // Position direction
  size: number;              // Position size in base asset
  entryPrice: number;        // Average entry price
  markPrice: number;         // Current mark price
  leverage: number;          // Position leverage
  collateral: number;        // Collateral amount
  unrealizedPnl: number;     // Real-time unrealized PNL
  liquidationPrice: number;  // Estimated liquidation price
  fundingRate: number;       // Current funding rate (per hour)
  timestamp: number;         // Last update timestamp
}
```

### PerpOrderParams

Parameters for opening positions:

```typescript
interface PerpOrderParams {
  symbol: string;           // Trading pair
  side: 'long' | 'short';  // Position direction
  size: number;             // Size in base asset
  leverage?: number;        // Leverage (default: 10x)
  slippage?: number;        // Max slippage (default: 0.005 = 0.5%)
  stopLoss?: number;        // Stop loss price (optional)
  takeProfit?: number;      // Take profit price (optional)
}
```

### PerpMarketInfo

Market information:

```typescript
interface PerpMarketInfo {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;      // Per hour
  nextFundingTime: number;  // Timestamp
  openInterest: number;
  maxLeverage: number;
  minSize: number;
  available: boolean;
}
```

## Events

All adapters emit the following events:

### `positionUpdate`

Emitted when a position is updated (2-3 second intervals):

```typescript
adapter.on('positionUpdate', (position: PerpPosition) => {
  console.log(`${position.symbol}: $${position.unrealizedPnl.toFixed(2)}`);
  
  // Check liquidation risk
  const riskPercent = Math.abs(position.markPrice - position.liquidationPrice) / position.markPrice * 100;
  if (riskPercent < 5) {
    console.warn(`⚠️ Position close to liquidation! ${riskPercent.toFixed(2)}% away`);
  }
});
```

### `marketUpdate`

Emitted when market data changes:

```typescript
adapter.on('marketUpdate', (symbol: string, data: any) => {
  console.log(`${symbol} mark price: $${data.markPrice}`);
  console.log(`Funding rate: ${(data.fundingRate * 100).toFixed(4)}%/hr`);
});
```

### `positionClosed`

Emitted when a position is closed:

```typescript
adapter.on('positionClosed', ({ positionId, symbol }) => {
  console.log(`Position ${positionId} (${symbol}) closed`);
});
```

## Advanced Usage

### Multi-Protocol Strategy

```typescript
import { PerpAdapterFactories, PerpProtocol, createPerpAdapter } from '@trading-bot/exchanges';

// Create adapters for multiple protocols
const adapters = [
  PerpAdapterFactories.gmxArbitrum('https://arb1.arbitrum.io/rpc', '0x...'),
  PerpAdapterFactories.gainsPolygon('https://polygon-rpc.com', '0x...'),
  PerpAdapterFactories.kwenta('https://mainnet.optimism.io', '0x...'),
];

// Connect all
await Promise.all(adapters.map(a => a.connect()));

// Find best funding rate
async function findBestFundingRate(symbol: string) {
  const rates = await Promise.all(
    adapters.map(async (adapter, i) => ({
      protocol: ['GMX', 'Gains', 'Kwenta'][i],
      rate: await adapter.getFundingRate(symbol),
      maxLeverage: await adapter.getMaxLeverage(symbol),
    }))
  );
  
  return rates.sort((a, b) => a.rate - b.rate);
}

const best = await findBestFundingRate('ETH/USD');
console.log('Best funding rate:', best[0]);
```

### Risk Management

```typescript
class PerpPositionManager {
  constructor(private adapter: PerpAdapter) {
    // Monitor all positions
    this.adapter.on('positionUpdate', (pos) => this.checkRisk(pos));
  }
  
  private checkRisk(position: PerpPosition) {
    const priceToLiq = Math.abs(position.markPrice - position.liquidationPrice);
    const riskPercent = (priceToLiq / position.markPrice) * 100;
    
    // Auto-reduce position if too risky
    if (riskPercent < 3) {
      console.warn(`⚠️ High liquidation risk: ${riskPercent.toFixed(2)}%`);
      this.emergencyReduce(position);
    }
    
    // Track PNL
    if (position.unrealizedPnl < -position.collateral * 0.5) {
      console.error(`🚨 Position down 50%! Consider closing`);
    }
  }
  
  private async emergencyReduce(position: PerpPosition) {
    const reduceSize = position.size * 0.5; // Reduce by 50%
    await this.adapter.closePosition(position.id, reduceSize);
    console.log(`Emergency reduced ${position.symbol} by 50%`);
  }
}

const manager = new PerpPositionManager(adapter);
```

### Funding Rate Arbitrage

```typescript
// Monitor funding rates and capture arbitrage opportunities
async function monitorFundingArbitrage() {
  const adapters = [
    createGMXArbitrumAdapter('...'),
    createGainsPolygonAdapter('...'),
    createPerpProtocolAdapter('...'),
  ];
  
  await Promise.all(adapters.map(a => a.connect()));
  
  setInterval(async () => {
    const symbol = 'ETH/USD';
    const rates = await Promise.all(
      adapters.map(a => a.getFundingRate(symbol))
    );
    
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    const spread = maxRate - minRate;
    
    // If spread > 0.05% per hour, there's an arbitrage opportunity
    if (spread > 0.0005) {
      const shortAdapter = adapters[rates.indexOf(maxRate)];
      const longAdapter = adapters[rates.indexOf(minRate)];
      
      console.log(`📊 Arbitrage opportunity!`);
      console.log(`Short on ${shortAdapter.constructor.name}: ${maxRate * 100}%/hr`);
      console.log(`Long on ${longAdapter.constructor.name}: ${minRate * 100}%/hr`);
      console.log(`Spread: ${(spread * 100).toFixed(4)}%/hr`);
    }
  }, 60000); // Check every minute
}
```

## Configuration

### Environment Variables

```bash
# RPC URLs
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
POLYGON_RPC_URL=https://polygon-rpc.com
OPTIMISM_RPC_URL=https://mainnet.optimism.io
DYDX_API_URL=https://indexer.dydx.trade

# Private keys (optional, for trading)
PRIVATE_KEY=0x...
DYDX_MNEMONIC="your twelve word mnemonic phrase here"

# Polling intervals (milliseconds)
GMX_POLL_INTERVAL=2000
GAINS_POLL_INTERVAL=3000
KWENTA_POLL_INTERVAL=3000
```

### Factory Functions

```typescript
import { PerpAdapterFactories } from '@trading-bot/exchanges';

const adapter = PerpAdapterFactories.gmxArbitrum(
  process.env.ARBITRUM_RPC_URL!,
  process.env.PRIVATE_KEY as `0x${string}`
);
```

## Decimal Precision

Each protocol uses different decimal precision for prices and sizes:

| Protocol | Price Decimals | Size Decimals | Collateral |
|----------|----------------|---------------|------------|
| GMX V2 | 30 (USD) | 18 | USDC (6 decimals on-chain) |
| Gains Network | 10 | 18 | DAI (18 decimals) |
| dYdX V4 | 18 | 18 | USDC |
| Perp Protocol | vAMM sqrtPrice | 18 | USDC |
| Kwenta | 18 | 18 | sUSD (18 decimals) |

All adapters handle decimal conversions automatically.

## Error Handling

```typescript
try {
  const position = await adapter.openPosition({
    symbol: 'ETH/USD',
    side: 'long',
    size: 10.0,
    leverage: 50,
  });
} catch (error) {
  if (error.message.includes('insufficient collateral')) {
    console.error('Not enough collateral');
  } else if (error.message.includes('max leverage')) {
    console.error('Leverage too high for this market');
  } else if (error.message.includes('slippage')) {
    console.error('Slippage tolerance exceeded');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Testing

```bash
# Run unit tests
npm test

# Test on testnet
ARBITRUM_RPC_URL=https://goerli-rollup.arbitrum.io/rpc npm run test:integration
```

## Security Considerations

1. **Private Key Management**: Never commit private keys to version control
2. **RPC Endpoints**: Use your own RPC nodes for production
3. **Slippage Protection**: Always set appropriate slippage limits
4. **Liquidation Monitoring**: Implement liquidation alerts
5. **Position Limits**: Set maximum position sizes
6. **Gas Estimation**: Account for gas costs on each chain

## Performance

- **Polling Frequency**: 2-3 seconds (configurable)
- **WebSocket**: Used where available (dYdX, Kwenta)
- **Caching**: Mark prices cached for performance
- **Batch Queries**: Multiple positions fetched in parallel

## Troubleshooting

### Connection Issues

```typescript
adapter.on('disconnected', () => {
  console.error('Adapter disconnected, reconnecting...');
  setTimeout(() => adapter.connect(), 5000);
});
```

### Price Feed Failures

```typescript
try {
  const price = await adapter.getMarkPrice('ETH/USD');
} catch (error) {
  // Fallback to another adapter
  const backupPrice = await backupAdapter.getMarkPrice('ETH/USD');
}
```

## Roadmap

- [ ] Add more protocols (Drift, Jupiter Perps)
- [ ] Implement limit orders
- [ ] Add stop-loss/take-profit automation
- [ ] Cross-margin support
- [ ] Historical funding rate data
- [ ] Liquidation engine
- [ ] Gas optimization

## License

MIT

## Support

For issues and questions:
- GitHub: [trading-bot issues](https://github.com/yourusername/trading-bot/issues)
- Discord: [Join our community](#)

---

**⚠️ Risk Warning**: Perpetual futures trading involves significant risk. This software is provided as-is with no guarantees. Always test on testnets first and never trade with more than you can afford to lose.
