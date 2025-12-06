# @trading-bot/backtester

High-performance, event-driven backtesting engine for cryptocurrency trading strategies with realistic slippage modeling, multi-strategy portfolio simulation, and comprehensive performance analytics.

## Features

### 🚀 High Performance
- **Event-driven architecture** for efficient candle processing
- **Parallel execution** across years using Node.js worker threads
- **Optimized data structures** for fast portfolio calculations
- Processes 10,000+ candles per second

### 📊 Data Loading
- **Parquet file support** for efficient local storage
- **TheGraph integration** for on-chain data
- **Data validation** with gap detection and quality checks
- Automatic splitting by year for parallel processing

### 💹 Realistic Simulation
- **Advanced slippage model** with constant + linear price impact
- **Commission fees** configurable in basis points
- **Market orders** simulated using OHLC data
- **Partial fills** for large orders
- **Stop loss & take profit** execution

### 🎯 Multi-Strategy Support
- Run multiple strategies simultaneously
- Per-strategy performance tracking
- Portfolio rebalancing at configurable intervals
- Position size limits and risk management

### 📈 Comprehensive Metrics
- **Return metrics**: Total, annualized, monthly breakdowns
- **Risk-adjusted**: Sharpe, Sortino, Calmar ratios
- **Drawdown analysis**: Max drawdown, underwater curve
- **Trade statistics**: Win rate, profit factor, consecutive wins/losses
- **Per-strategy breakdown**: Individual strategy performance

### 📝 Beautiful HTML Reports
- Interactive equity & drawdown curves (Chart.js)
- Color-coded performance metrics
- Monthly returns table
- Complete trade log with filtering
- Strategy breakdown section
- Mobile-responsive design

## Installation

```bash
npm install @trading-bot/backtester
```

## Quick Start

```typescript
import {
  DataLoader,
  HighPerformanceBacktester,
  HTMLReporter,
  SMAStrategy,
} from '@trading-bot/backtester';

// 1. Load historical data
const loader = new DataLoader({
  source: 'parquet',
  parquetPath: './data/ETH-USD-1h.parquet',
  symbol: 'ETH/USD',
  startTime: new Date('2023-01-01').getTime(),
  endTime: new Date('2023-12-31').getTime(),
  timeframe: '1h',
});

const candles = await loader.loadCandles();

// 2. Configure backtester
const backtester = new HighPerformanceBacktester({
  initialEquity: 100000,
  commission: 5, // 5 bps
  slippage: {
    constantBps: 5,
    impactBps: 10,
    minSlippage: 1,
    maxSlippage: 500,
  },
  maxPositions: 3,
  riskPerTrade: 2,
});

// 3. Register strategies
backtester.registerStrategy('SMA', new SMAStrategy(20, 50));

// 4. Run backtest
const { metrics, trades } = await backtester.run(candles);

// 5. Generate report
const reporter = new HTMLReporter({
  title: 'Backtest Report',
  outputPath: './report.html',
  includeTradeLog: true,
  includeCharts: true,
});

reporter.generateReport(metrics, trades);

console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
console.log(`Total Return: ${metrics.totalReturnPercent.toFixed(2)}%`);
```

## Data Loading

### From Parquet Files

```typescript
const loader = new DataLoader({
  source: 'parquet',
  parquetPath: './data/BTC-USD-1d.parquet',
  symbol: 'BTC/USD',
  startTime: Date.now() - 365 * 86400000, // 1 year ago
  endTime: Date.now(),
  timeframe: '1d',
});

const candles = await loader.loadCandles();
```

### From TheGraph

```typescript
const loader = new DataLoader({
  source: 'thegraph',
  graphEndpoint: 'https://api.thegraph.com/subgraphs/name/your-subgraph',
  symbol: 'ETH/USD',
  startTime: Date.now() - 30 * 86400000,
  endTime: Date.now(),
  timeframe: '1h',
});

const candles = await loader.loadCandles();
```

### Data Validation

```typescript
const validation = DataLoader.validateCandles(candles);

if (!validation.valid) {
  console.error('Data errors:', validation.errors);
}

if (validation.warnings.length > 0) {
  console.warn('Data warnings:', validation.warnings);
}
```

## Creating Custom Strategies

Implement the `IBacktestStrategy` interface:

```typescript
import { IBacktestStrategy, StrategySignal, PortfolioState, Candle } from '@trading-bot/backtester';

export class MyStrategy implements IBacktestStrategy {
  initialize(initialEquity: number): void {
    // Setup strategy state
  }

  async onCandle(
    candle: Candle,
    index: number,
    allCandles: Candle[],
    portfolio: PortfolioState
  ): Promise<StrategySignal | null> {
    // Your strategy logic here
    
    // Return buy signal
    return {
      timestamp: candle.timestamp,
      symbol: candle.symbol,
      action: 'buy',
      stopLoss: candle.close * 0.95,
      takeProfit: candle.close * 1.10,
      strategy: 'MyStrategy',
    };
    
    // Or return null for no action
    return null;
  }
}
```

## Built-in Strategies

### SMA Crossover

```typescript
import { SMAStrategy } from '@trading-bot/backtester';

const strategy = new SMAStrategy(
  20,  // Short period
  50   // Long period
);
```

### Mean Reversion (Bollinger Bands)

```typescript
import { MeanReversionStrategy } from '@trading-bot/backtester';

const strategy = new MeanReversionStrategy(
  20,  // Period
  2    // Standard deviations
);
```

### Momentum (RSI)

```typescript
import { MomentumStrategy } from '@trading-bot/backtester';

const strategy = new MomentumStrategy(
  14,  // RSI period
  30,  // Oversold threshold
  70   // Overbought threshold
);
```

## Slippage Model

The backtester uses a realistic slippage model with two components:

1. **Constant slippage**: Fixed cost per trade (e.g., 5 bps)
2. **Linear price impact**: Scales with order size (e.g., 10 bps per $1M)

```typescript
const slippageModel = new SlippageModel({
  constantBps: 5,    // 0.05% constant slippage
  impactBps: 10,     // 0.10% per $1M order size
  minSlippage: 1,    // Minimum 0.01%
  maxSlippage: 500,  // Maximum 5%
});

// Estimate slippage for $50k order
const slippage = slippageModel.estimateSlippage(50000);
console.log(`Estimated slippage: ${slippage} bps`);
```

## Parallel Processing

For large datasets, use parallel processing to speed up backtests:

```typescript
import { ParallelBacktester, DataLoader } from '@trading-bot/backtester';

const candles = await loader.loadCandles();
const parallelBacktester = new ParallelBacktester();

const { trades, equityCurve, yearResults } = await parallelBacktester.runParallel(
  candles,
  {
    initialEquity: 100000,
    commission: 5,
    slippage: { constantBps: 5, impactBps: 10, minSlippage: 1, maxSlippage: 500 },
  }
);

// Results from each year
for (const [year, result] of yearResults.entries()) {
  console.log(`Year ${year}: ${result.trades.length} trades`);
}
```

## Performance Metrics

### Available Metrics

```typescript
interface PerformanceMetrics {
  // Returns
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  
  // Risk-adjusted
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  
  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  
  // Time series data
  equityCurve: EquityPoint[];
  underwaterCurve: number[];
  monthlyReturns: MonthlyReturn[];
  
  // Per-strategy breakdown
  strategyMetrics: Map<string, StrategyMetrics>;
}
```

## HTML Report Customization

```typescript
const reporter = new HTMLReporter({
  title: 'My Strategy Backtest',
  outputPath: './reports/strategy-2023.html',
  includeTradeLog: true,   // Include detailed trade list
  includeCharts: true,     // Include equity & drawdown charts
});

reporter.generateReport(metrics, trades);
```

The generated report includes:
- Performance summary cards
- Risk metrics section
- Trade statistics
- Interactive equity curve chart
- Underwater (drawdown) curve chart
- Strategy breakdown table
- Monthly returns table
- Complete trade log

## Configuration Options

### Backtester Config

```typescript
interface BacktestConfig {
  initialEquity: number;           // Starting capital
  commission: number;               // Commission in basis points
  slippage?: SlippageConfig;        // Slippage model config
  rebalanceInterval?: number;       // Rebalancing interval (ms)
  maxPositions?: number;            // Max concurrent positions
  riskPerTrade?: number;            // Risk per trade (%)
}
```

### Slippage Config

```typescript
interface SlippageConfig {
  constantBps: number;    // Constant slippage (bps)
  impactBps: number;      // Price impact per $1M (bps)
  minSlippage: number;    // Minimum slippage (bps)
  maxSlippage: number;    // Maximum slippage cap (bps)
}
```

## Event Monitoring

Monitor backtest progress in real-time:

```typescript
backtester.on('progress', (data) => {
  console.log(`Progress: ${(data.processed / data.total * 100).toFixed(1)}%`);
  console.log(`Current Equity: $${data.equity.toFixed(2)}`);
});

backtester.on('positionOpened', (position) => {
  console.log(`Opened ${position.side} ${position.symbol} @ $${position.entryPrice}`);
});

backtester.on('positionClosed', (trade) => {
  console.log(`Closed ${trade.symbol} | P&L: $${trade.pnl.toFixed(2)}`);
});

backtester.on('rebalanced', (info) => {
  console.log(`Portfolio rebalanced: ${info.signals} signals processed`);
});
```

## Examples

See the `examples/` directory for complete working examples:

- `comprehensive.example.ts` - Full-featured multi-strategy backtest
- Run with: `npm run example:backtest`

## Performance Tips

1. **Use Parquet files** for large datasets (much faster than CSV/JSON)
2. **Enable parallel processing** for multi-year backtests
3. **Limit trade log size** in reports for datasets with 10,000+ trades
4. **Disable charts** if generating many reports programmatically
5. **Use appropriate timeframes** (1h/1d for long-term, 1m/5m for short-term)

## API Reference

See TypeScript definitions for complete API documentation. All types are exported and fully documented with JSDoc comments.

## License

MIT
