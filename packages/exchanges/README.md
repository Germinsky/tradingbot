# @trading-bot/exchanges

Professional decentralized exchange connector interface with support for multiple DEXes, aggregators, and MEV protection.

## Features

### Supported Protocols

#### DEXes
- **Uniswap V2** - Classic AMM with constant product formula
- **Uniswap V3** - Concentrated liquidity with multiple fee tiers
- **SushiSwap** - Uniswap V2 fork with additional features
- **PancakeSwap** - BSC-based AMM

#### Aggregators
- **0x Protocol** - Multi-source aggregation with RFQ
- **1inch** - Advanced routing across 100+ sources
- **CoW Swap** - Intent-based trading with MEV protection

#### Cross-Chain
- **Across V2** - Fast optimistic bridging
- **Hop Protocol** - AMM-based cross-chain transfers
- **Synapse** - Multi-chain bridge network

#### MEV Protection
- **Flashbots Protect** - Private transaction submission
- **Eden Network** - Priority access and MEV protection
- **CoW Protocol** - Batch auction mechanism

## Installation

Already included in the trading-bot monorepo.

## Quick Start

```typescript
import { createPublicClient, createWalletClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createUniswapV3Adapter,
  createZeroExAdapter,
  wrapWithMEVProtection,
  Token,
  TokenAmount,
} from '@trading-bot/exchanges';

// Setup clients
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY'),
});

const account = privateKeyToAccount('0x...');
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY'),
});

// Create adapter
const uniswap = createUniswapV3Adapter(publicClient, walletClient, 1);

// Define tokens
const WETH: Token = {
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  symbol: 'WETH',
  decimals: 18,
  chainId: 1,
};

const USDC: Token = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
  chainId: 1,
};

// Get quote
const quote = await uniswap.getQuote(
  { token: WETH, amount: BigInt(1e18) },
  USDC,
  0.5 // 0.5% slippage
);

// Execute swap
const result = await uniswap.executeSwap(quote, {
  flashbots: true,
  waitForConfirmation: true,
});
```

## Usage Examples

### 1. Uniswap V3 Swap

```typescript
const adapter = createUniswapV3Adapter(publicClient, walletClient, 1);
const quote = await adapter.getQuote(inputAmount, outputToken, 0.5);
const result = await adapter.executeSwap(quote, {
  waitForConfirmation: true,
});
```

### 2. 0x Aggregator

```typescript
const zeroEx = createZeroExAdapter(publicClient, walletClient, 'YOUR-API-KEY');
const quote = await zeroEx.getQuote(inputAmount, outputToken, 0.5);
// Quote includes best route across multiple sources
console.log('Sources:', quote.sources);
```

### 3. MEV Protection

```typescript
const protectedAdapter = wrapWithMEVProtection(
  uniswapV3,
  publicClient,
  walletClient
);

await protectedAdapter.executeSwap(quote, {
  flashbots: true, // Use Flashbots Protect
  privateTx: true,
});
```

### 4. CoW Swap (Gasless)

```typescript
const cowSwap = createCowSwapAdapter(publicClient, walletClient);
const quote = await cowSwap.getQuote(inputAmount, outputToken, 0.5);

// Submit as signed order (gasless)
await cowSwap.executeSwap(quote, {
  cowSwapOrder: true,
});
```

### 5. Cross-Chain Bridge

```typescript
const across = createAcrossAdapter(publicClient, walletClient, 1);
const quote = await across.getCrossChainQuote(inputAmount, outputToken, {
  destinationChainId: 10, // Optimism
  slippage: 0.5,
  bridge: 'across',
});

const tx = await across.buildCrossChainTransaction(quote, {
  destinationChainId: 10,
  slippage: 0.5,
  bridge: 'across',
});
```

### 6. Compare Multiple Sources

```typescript
async function findBestQuote(input: TokenAmount, output: Token) {
  const adapters = [
    createUniswapV2Adapter(publicClient, walletClient, 1),
    createUniswapV3Adapter(publicClient, walletClient, 1),
    createZeroExAdapter(publicClient, walletClient, apiKey),
    createOneInchAdapter(publicClient, walletClient, apiKey),
  ];

  const quotes = await Promise.allSettled(
    adapters.map((a) => a.getQuote(input, output, 0.5))
  );

  const validQuotes = quotes
    .filter((r) => r.status === 'fulfilled')
    .map((r: any) => r.value);

  return validQuotes.reduce((best, current) =>
    current.outputAmount.amount > best.outputAmount.amount ? current : best
  );
}
```

## API Reference

### IExchangeAdapter Interface

```typescript
interface IExchangeAdapter {
  readonly name: string;
  readonly supportedChains: number[];

  getQuote(
    input: TokenAmount,
    output: Token,
    slippage: number,
    options?: Partial<BuildTransactionOptions>
  ): Promise<Quote>;

  buildTransaction(
    quote: Quote,
    options: BuildTransactionOptions
  ): Promise<TransactionRequest>;

  executeSwap(
    quote: Quote,
    options: ExecuteSwapOptions
  ): Promise<MEVProtectionResult>;

  getApprovalTransaction(
    token: Token,
    amount: bigint,
    spender?: Address
  ): Promise<TransactionRequest | null>;

  needsApproval(
    token: Token,
    amount: bigint,
    owner: Address
  ): Promise<boolean>;
}
```

### Quote Object

```typescript
interface Quote {
  inputAmount: TokenAmount;
  outputAmount: TokenAmount;
  minimumReceived: TokenAmount;
  priceImpact: number; // Percentage
  feeBps: number; // Basis points
  gasEstimate: bigint;
  routes: RouteHop[][];
  exchangeId: string;
  validUntil?: number;
  allowanceTarget?: Address;
}
```

### Execute Options

```typescript
interface ExecuteSwapOptions {
  flashbots?: boolean; // Use Flashbots Protect
  edenNetwork?: boolean; // Use Eden Network
  cowSwapOrder?: boolean; // Submit as CoW order
  privateTx?: boolean; // Use private mempool
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
  gasLimit?: bigint;
  waitForConfirmation?: boolean;
}
```

## Supported Networks

| Protocol | Ethereum | Base | Polygon | Arbitrum | Optimism | BSC |
|----------|----------|------|---------|----------|----------|-----|
| Uniswap V2 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Uniswap V3 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| SushiSwap | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| PancakeSwap | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 0x | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| 1inch | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| CoW Swap | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Across | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Flashbots | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Advanced Features

### Permit2 Support (Coming Soon)

```typescript
const quote = await adapter.getQuote(input, output, 0.5);
const tx = await adapter.buildTransaction(quote, {
  slippage: 0.5,
  permit2: {
    signature: '0x...',
    deadline: BigInt(Date.now() + 3600),
    nonce: BigInt(0),
  },
});
```

### Uniswap V4 Hooks (Abstract)

The architecture supports Uniswap V4 hooks but they are optional and abstracted through the base adapter interface.

### Custom Referrer Fees

```typescript
await adapter.buildTransaction(quote, {
  slippage: 0.5,
  referrer: '0xYourAddress',
  feeBps: 10, // 0.1% integrator fee
});
```

## Error Handling

```typescript
try {
  const quote = await adapter.getQuote(input, output, 0.5);
  const result = await adapter.executeSwap(quote, options);
} catch (error) {
  if (error.message.includes('insufficient liquidity')) {
    // Try different adapter or increase slippage
  } else if (error.message.includes('approval needed')) {
    // Get and execute approval transaction
    const approvalTx = await adapter.getApprovalTransaction(token, amount);
    if (approvalTx) {
      await walletClient.sendTransaction(approvalTx);
    }
  }
}
```

## Testing

```bash
npm test
```

## Contributing

See the main repository contributing guidelines.

## License

MIT
