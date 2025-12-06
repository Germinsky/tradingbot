# Trading Bot Monorepo

A sophisticated TypeScript-based trading bot monorepo built with npm workspaces, featuring live trading, backtesting, risk management, and a real-time dashboard.

## 🏗️ Architecture

This monorepo consists of 7 packages organized in a modular architecture:

```
trading-bot/
├── packages/
│   ├── core/           # Shared types, utilities, logging, configuration
│   ├── exchanges/      # Multi-exchange connector abstractions (viem, wagmi, ethers)
│   ├── strategies/     # Hot-reloadable trading strategy base classes
│   ├── risk-engine/    # Position sizing, drawdown controls, circuit breakers
│   ├── backtester/     # Event-driven historical trading simulator
│   ├── bot/            # Live trading orchestrator
│   └── ui/             # React dashboard with Tailwind + Recharts + dark mode
```

### Package Dependencies

```mermaid
graph TD
    core[Core]
    exchanges[Exchanges]
    strategies[Strategies]
    risk[Risk Engine]
    backtester[Backtester]
    bot[Bot]
    ui[UI]
    
    exchanges --> core
    strategies --> core
    risk --> core
    backtester --> core
    backtester --> strategies
    backtester --> risk
    bot --> core
    bot --> exchanges
    bot --> strategies
    bot --> risk
    ui --> bot
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd trading-bot

# Install all dependencies
npm install

# Build all packages
npm run build
```

### Running the Bot

1. Configure environment variables:

```bash
cd packages/bot
cp .env.example .env
# Edit .env with your settings (RPC URL, strategy params, etc.)
```

2. Start the trading bot:

```bash
npm run bot
```

### Running the Dashboard

In a separate terminal:

```bash
npm run ui
```

The dashboard will be available at `http://localhost:3001`

## 📦 Packages

### @trading-bot/core

Foundation package providing:
- **Types**: Market data, orders, positions, strategy interfaces
- **Logging**: Singleton logger with configurable levels
- **Config**: Environment and file-based configuration loading with Zod validation
- **Utils**: PnL calculations, formatting, retry logic

### @trading-bot/exchanges

Exchange abstraction layer:
- **BaseExchange**: Abstract class for exchange implementations
- **UniswapExchange**: Example Uniswap connector using viem
- Supports: Market data fetching, order submission, position tracking
- Extensible for multiple DEXes and CEXes

### @trading-bot/strategies

Strategy framework:
- **BaseStrategy**: Abstract strategy class with lifecycle hooks
- **StrategyLoader**: Hot-reload strategies without restarting
- **GridStrategy**: Example grid trading implementation
- File watching for dynamic strategy updates

### @trading-bot/risk-engine

Risk management system:
- **PositionSizer**: Fixed, Kelly criterion, and percentage-based sizing
- **DrawdownMonitor**: Real-time drawdown tracking with high water mark
- **RiskManager**: Circuit breakers, position limits, stop-loss/take-profit
- Validates all orders before execution

### @trading-bot/backtester

Historical simulation:
- **EventQueue**: Time-ordered event processing
- **Backtester**: Simulates trading with commission and slippage
- **PerformanceMetrics**: Sharpe ratio, max drawdown, win rate, profit factor
- Event-driven architecture for accurate simulation

### @trading-bot/bot

Live trading orchestrator:
- **TradingBot**: Main bot class coordinating all systems
- Event emitters for state changes
- Graceful shutdown handling
- Optional hot-reload for strategies
- Market data subscription and order execution

### @trading-bot/ui

React dashboard:
- **Dark mode** by default with Tailwind CSS
- **Real-time charts** with Recharts (equity curve)
- **Positions list** with live P&L
- **Order history** with filtering
- **Zustand** for state management
- Vite for fast development

## 🛠️ Development

### Build all packages

```bash
npm run build
```

### Run in development mode

```bash
npm run dev
```

### Lint and format

```bash
npm run lint
npm run format
```

### Type checking

```bash
npm run typecheck
```

## 📊 Using the Backtester

Example usage:

```typescript
import { GridStrategy } from '@trading-bot/strategies';
import { RiskManager } from '@trading-bot/risk-engine';
import { Backtester } from '@trading-bot/backtester';

const strategy = new GridStrategy({
  gridSize: 10,
  gridSpacing: 50,
  basePrice: 2000,
  quantity: 0.1,
});

const riskManager = new RiskManager({
  positionSizer: { accountBalance: 10000, riskPerTrade: 0.02, method: 'fixed' },
  drawdownMonitor: { maxDrawdown: 0.1, highWaterMark: 10000 },
  maxPositionSize: 1000,
  stopLossPercent: 0.02,
  takeProfitPercent: 0.05,
});

const backtester = new Backtester(
  { initialCapital: 10000, commission: 0.001, slippage: 0.001 },
  strategy,
  riskManager
);

// Load historical data
backtester.loadHistoricalData(marketData);

// Run backtest
const metrics = await backtester.run();
console.log(metrics.getSummary());
```

## 🔧 Configuration

The bot uses environment variables for configuration. See `packages/bot/.env.example`:

```env
# Exchange
EXCHANGE_NAME=uniswap
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY

# Strategy
STRATEGY_NAME=grid
STRATEGY_PARAMS={"gridSize":10,"gridSpacing":50,"basePrice":2000,"quantity":0.1}

# Risk Management
MAX_POSITION_SIZE=1000
MAX_DRAWDOWN=0.1
STOP_LOSS_PERCENT=0.02
TAKE_PROFIT_PERCENT=0.05

# Logging
LOG_LEVEL=info
```

## 🎯 Key Features

### Hot-Reloadable Strategies
Modify strategy files and the bot will automatically reload them without restarting.

### Event-Driven Architecture
All systems communicate via events for maximum flexibility and testability.

### Risk-First Design
Every order passes through risk validation before execution.

### Comprehensive Backtesting
Realistic simulation with commission, slippage, and performance metrics.

### Real-Time Monitoring
Beautiful dashboard with live charts and position tracking.

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test
```

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please read the contributing guidelines first.

## ⚠️ Disclaimer

This software is for educational purposes only. Use at your own risk. Trading involves substantial risk of loss. Always test strategies thoroughly before live trading.

## 🔗 Tech Stack

- **TypeScript**: Type-safe development
- **Node.js**: Runtime environment
- **viem**: Modern EVM interactions
- **wagmi**: React hooks for Ethereum
- **ethers v6**: Additional Ethereum library
- **React**: UI framework
- **Tailwind CSS**: Utility-first styling
- **Recharts**: Charting library
- **Zustand**: State management
- **Zod**: Runtime validation
- **Turborepo**: Build caching
- **Vite**: Frontend tooling
- **ESLint + Prettier**: Code quality
