# 🚀 Trading Bot - Quick Start Guide

## Prerequisites

```bash
npm install -g tsx  # TypeScript executor
```

## Option 1: Run Demo (No Setup Required)

The demo shows all 5 DEX adapters without needing API keys or wallets:

```bash
cd /home/digitalprophets/trading-bot
npx tsx demo.ts
```

This will display:
- ✅ Uniswap V2 quotes
- ✅ Uniswap V3 multi-fee-tier optimization
- ⚠️  0x aggregator (needs API key)
- ⚠️  1inch v6 (needs API key)
- ✅ CoW Swap MEV-protected quotes

## Option 2: Full Setup (For Real Trading)

### 1. Install Dependencies

```bash
cd /home/digitalprophets/trading-bot
npm install
npm run build
```

### 2. Configure Environment

Create `.env` file:

```bash
# RPC Access (get free key from https://alchemy.com)
ALCHEMY_API_KEY=your-alchemy-api-key

# Wallet (NEVER commit this!)
PRIVATE_KEY=0xYourPrivateKeyHere

# Optional: Aggregator APIs
ZEROX_API_KEY=your-0x-api-key          # https://0x.org/docs/api
ONEINCH_API_KEY=your-1inch-api-key     # https://portal.1inch.dev
```

### 3. Run the Bot

```bash
# Run demo with your settings
npx tsx demo.ts

# Or use the full bot package
npm run build
npm run bot
```

## Option 3: Simple Code Example

Create `test.ts`:

```typescript
import { createPublicClient, http, parseEther } from 'viem';
import { mainnet } from 'viem/chains';
import { createUniswapV3Adapter } from './packages/exchanges/src/index';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/demo'),
});

const walletClient = createWalletClient({
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/demo'),
});

const adapter = createUniswapV3Adapter(publicClient, walletClient, 1);

const quote = await adapter.getQuote(
  {
    token: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      symbol: 'WETH',
      decimals: 18,
      chainId: 1,
    },
    amount: parseEther('1'),
  },
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    decimals: 6,
    chainId: 1,
  },
  0.5 // 0.5% slippage
);

console.log('Quote:', quote);
```

Run it:
```bash
npx tsx test.ts
```

## What Each Adapter Does

### Uniswap V2 Adapter
- Direct DEX with 0.3% fee
- Uses constant product formula (x*y=k)
- Best for: Standard token swaps

### Uniswap V3 Adapter
- Concentrated liquidity
- Tests multiple fee tiers: 0.01%, 0.05%, 0.3%, 1%
- Best for: Optimal execution with capital efficiency

### 0x Protocol Adapter
- Aggregates 70+ DEXes
- RFQ (Request for Quote) system
- Best for: Large trades, best prices

### 1inch v6 Adapter
- Aggregates 100+ protocols
- Pathfinder routing algorithm
- Best for: Complex multi-hop routes

### CoW Swap Adapter
- MEV-protected batch auctions
- Gasless execution
- Best for: Protection from sandwich attacks

## Next Steps

1. **Test Locally**: Run `npx tsx demo.ts`
2. **Get API Keys**: Sign up for Alchemy, 0x, 1inch
3. **Add Strategies**: Implement your trading logic
4. **Backtest**: Use the backtester package
5. **Deploy**: Run the full bot in production

## Architecture

```
packages/
├── core/          - Types, logger, config
├── exchanges/     - 5 DEX adapters ✅
├── strategies/    - Trading strategies
├── risk-engine/   - Position sizing, risk management
├── backtester/    - Historical testing
├── bot/           - Main orchestrator
└── ui/            - React dashboard
```

## Support

- 📚 Docs: `/packages/exchanges/README.md`
- 📊 Status: `/packages/exchanges/STATUS.md`
- 🐛 Issues: https://github.com/Germinsky/tradingbot/issues

## Quick Commands

```bash
# Install everything
npm install

# Build all packages
npm run build

# Run demo (no setup)
npx tsx demo.ts

# Run tests
npm test

# Run bot
npm run bot

# Run UI dashboard
npm run dev --workspace=@trading-bot/ui
```

Happy trading! 🎯
