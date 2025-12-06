# @trading-bot/risk-engine

Comprehensive risk management engine for cryptocurrency trading with Kelly Criterion position sizing, real-time VaR/CVaR, circuit breakers, exposure limits, liquidation buffers, and volatility-based de-leveraging.

## Features

### 🎯 Kelly Criterion Position Sizing
- **Fractional Kelly**: Conservative position sizing (default 25% of full Kelly)
- **Adaptive**: Automatically adjusts based on win rate and risk/reward
- **Trade History**: Learns from past trades to optimize future positions
- **Safety Caps**: Maximum position size limits to prevent over-allocation

### 📊 Value at Risk (VaR) & CVaR
- **Historical VaR**: Based on actual historical returns
- **Monte Carlo VaR**: Simulated future returns using statistical parameters
- **CVaR (Expected Shortfall)**: Expected loss beyond VaR threshold
- **Real-time Updates**: Continuous monitoring with configurable frequency (default 5s)
- **95% Confidence**: Default confidence level with adjustable parameters

### 🚨 Circuit Breaker
- **Daily Drawdown**: Automatic trading halt at 15% daily loss (configurable)
- **Total Drawdown**: Monitors drawdown from all-time high (default 25%)
- **Auto-Recovery**: Optional automatic reset when equity recovers
- **Cooldown Period**: Configurable cooldown before trading resumes (default 1 hour)
- **Manual Override**: Ability to manually reset circuit breaker

### 💼 Exposure Management
- **Total Exposure**: Limit total portfolio leverage (default 1x)
- **Per-Strategy Limits**: Cap exposure per strategy (default 30%)
- **Per-Token Limits**: Prevent over-concentration in single tokens (default 25%)
- **Correlation Tracking**: Monitor and limit correlated asset exposure (default 70% correlation threshold)

### 🔐 Liquidation Buffer (Perpetuals)
- **Distance Monitoring**: Real-time tracking of distance to liquidation price
- **Target Buffer**: Maintain 20% buffer by default (configurable)
- **Emergency Actions**: Automatic warnings at 5% buffer, emergency close at 2%
- **Optimal Sizing**: Calculate position size with safe liquidation buffer
- **Real-time Alerts**: Continuous monitoring with configurable frequency

### 📈 Volatility-Based De-leveraging
- **Bollinger Bands**: Bandwidth monitoring (default 10% threshold)
- **ATR (Average True Range)**: Alternative volatility measure
- **Volatility Scale**: 1-10 level system
- **Automatic Reduction**: Reduce leverage by 50% on spikes (configurable)
- **Adaptive Leverage**: Recommend leverage based on current volatility

### 🚫 Blacklisting
- **Token Blacklist**: Block specific tokens from trading
- **Strategy Blacklist**: Disable specific strategies
- **Exchange Blacklist**: Exclude specific exchanges
- **Auto-Blacklist**: Automatically blacklist after threshold losses
- **Manual Control**: Add/remove from blacklists programmatically

### ⚙️ Configuration via YAML + Zod
- **Type-Safe**: Full TypeScript type checking with Zod schema validation
- **YAML Format**: Human-readable configuration files
- **Runtime Validation**: Catches configuration errors before execution
- **Hot-Reload**: Update configuration without restart
- **Defaults**: Sensible defaults for all parameters

## Installation

```bash
npm install @trading-bot/risk-engine
```

## Quick Start

### 1. Create Configuration File

Create `risk-config.yaml`:

```yaml
accountBalance: 10000
baseCurrency: USD

kelly:
  enabled: true
  fractionalKelly: 0.25
  minWinRate: 0.4
  maxPositionPercent: 0.1

var:
  enabled: true
  method: both
  confidenceLevel: 0.95
  lookbackPeriod: 252
  monteCarloSimulations: 10000

circuitBreaker:
  enabled: true
  maxDailyDrawdown: 0.15
  maxTotalDrawdown: 0.25
  cooldownPeriodMs: 3600000

exposureLimits:
  maxTotalExposure: 1.0
  maxPerStrategyExposure: 0.3
  maxPerTokenExposure: 0.25

liquidationBuffer:
  enabled: true
  minBufferPercent: 0.05
  targetBufferPercent: 0.2
  emergencyCloseThreshold: 0.02

volatility:
  enabled: true
  method: bollinger
  bandwidthThreshold: 0.1
  deleveragePercent: 0.5

blacklist:
  tokens: []
  strategies: []
```

### 2. Initialize Risk Engine

```typescript
import { RiskEngine } from '@trading-bot/risk-engine';

// Load from YAML file
const riskEngine = new RiskEngine('./risk-config.yaml');

// Or use object configuration
const riskEngine = new RiskEngine({
  accountBalance: 10000,
  kelly: {
    enabled: true,
    fractionalKelly: 0.25,
  },
  // ... other config
});
```

### 3. Validate Orders

```typescript
const order = {
  symbol: 'ETH/USD',
  side: 'buy',
  quantity: 1,
  price: 2000,
  // ...
};

const validation = riskEngine.validateOrder(
  order,
  'MyStrategy',
  1  // leverage
);

if (validation.approved) {
  console.log('Order approved ✅');
  // Execute order
} else {
  console.log('Order rejected:', validation.reason);
}
```

### 4. Calculate Position Size

```typescript
const positionSize = riskEngine.calculatePositionSize(
  2000,  // entry price
  1900,  // stop loss
  'ETH/USD',
  'MyStrategy',
  {
    winRate: 0.55,
    avgWin: 50,
    avgLoss: -30,
    totalTrades: 100,
  }
);

console.log(`Optimal position: ${positionSize} ETH`);
```

### 5. Update Market Data

```typescript
// Add price data for VaR/volatility
riskEngine.addPriceData('ETH/USD', 2050);

// Add candle data (more accurate)
riskEngine.addCandleData('ETH/USD', {
  timestamp: Date.now(),
  open: 2000,
  high: 2100,
  low: 1950,
  close: 2050,
  volume: 1000000,
});

// Update equity for circuit breaker
riskEngine.updateEquity(10500);
```

### 6. Monitor Perpetual Positions

```typescript
// Register perp position
riskEngine.addPerpPosition({
  symbol: 'ETH/USD-PERP',
  entryPrice: 2000,
  markPrice: 2050,
  liquidationPrice: 1600,
  collateral: 400,
  leverage: 5,
  side: 'long',
});

// Check unhealthy positions
const unhealthy = riskEngine.getUnhealthyPerpPositions();
for (const { symbol, status } of unhealthy) {
  console.log(`${symbol}: ${status.recommendedAction}`);
}
```

## Advanced Usage

### Kelly Criterion Deep Dive

```typescript
import { KellySizer } from '@trading-bot/risk-engine';

const sizer = new KellySizer({
  enabled: true,
  fractionalKelly: 0.25,
  minWinRate: 0.4,
  maxPositionPercent: 0.1,
});

// Calculate with metrics
const metrics = sizer.calculateKellyWithMetrics({
  winRate: 0.55,
  avgWin: 50,
  avgLoss: -30,
  totalTrades: 100,
});

console.log('Kelly:', metrics.kelly);
console.log('Expected Value:', metrics.expectedValue);
console.log('Sharpe:', metrics.sharpe);
```

### VaR Monitoring

```typescript
import { VaRCalculator } from '@trading-bot/risk-engine';

const varCalc = new VaRCalculator({
  enabled: true,
  method: 'both',
  confidenceLevel: 0.95,
  lookbackPeriod: 252,
  monteCarloSimulations: 10000,
  updateFrequencyMs: 5000,
});

// Start real-time monitoring
varCalc.startMonitoring((result) => {
  console.log('VaR:', result.historicalVaR);
  console.log('CVaR:', result.cvar);
});
```

### Circuit Breaker Management

```typescript
import { CircuitBreaker } from '@trading-bot/risk-engine';

const breaker = new CircuitBreaker(
  {
    enabled: true,
    maxDailyDrawdown: 0.15,
    maxTotalDrawdown: 0.25,
    cooldownPeriodMs: 3600000,
  },
  10000  // initial equity
);

// Check status
if (!breaker.isTradingAllowed()) {
  console.log('Trading halted!');
}

// Manual reset
breaker.resetCircuitBreaker();
```

### Exposure Tracking

```typescript
import { ExposureManager } from '@trading-bot/risk-engine';

const manager = new ExposureManager(
  {
    maxTotalExposure: 1.0,
    maxPerStrategyExposure: 0.3,
    maxPerTokenExposure: 0.25,
  },
  { tokens: [], strategies: [] }
);

// Check before opening
const check = manager.canOpenPosition(
  'GridStrategy',
  'ETH/USD',
  2000,
  2  // 2x leverage
);

if (check.allowed) {
  manager.addPosition('GridStrategy', 'ETH/USD', 2000, 2);
}

// Get summary
const summary = manager.getExposureSummary();
console.log('Total exposure:', summary.totalExposureRatio);
```

## Configuration Reference

See `config.example.yaml` for complete configuration with comments.

### Kelly Configuration
- `enabled`: Enable/disable Kelly sizing
- `fractionalKelly`: Fraction of full Kelly (0.1-1.0, default 0.25)
- `minWinRate`: Minimum win rate required (0-1, default 0.4)
- `maxPositionPercent`: Maximum position size (0.01-0.5, default 0.1)

### VaR Configuration
- `method`: 'historical', 'monte-carlo', or 'both'
- `confidenceLevel`: 0.9-0.99 (default 0.95)
- `lookbackPeriod`: 50-1000 days (default 252)
- `monteCarloSimulations`: 1000-100000 (default 10000)

### Circuit Breaker Configuration
- `maxDailyDrawdown`: 0.01-0.5 (default 0.15)
- `maxTotalDrawdown`: 0.1-0.8 (default 0.25)
- `cooldownPeriodMs`: Cooldown in milliseconds (default 3600000)
- `autoResetOnRecovery`: Boolean (default false)

## API Reference

### RiskEngine

Main class that orchestrates all risk management components.

#### Methods

- `validateOrder(order, strategyName, leverage, stats?)` - Validate order against all risk checks
- `calculatePositionSize(entryPrice, stopLoss, symbol, strategy, stats?)` - Calculate optimal position size
- `updateEquity(equity)` - Update account equity for circuit breaker
- `addPriceData(symbol, price, timestamp?)` - Add price data for VaR/volatility
- `addCandleData(symbol, candle)` - Add candle data (more accurate)
- `addPosition(strategy, symbol, value, leverage)` - Register position
- `removePosition(strategy, symbol, value, leverage)` - Remove position
- `addPerpPosition(position)` - Register perpetual position
- `removePerpPosition(symbol)` - Remove perpetual position
- `getRiskMetrics()` - Get comprehensive risk metrics
- `resetCircuitBreaker()` - Manually reset circuit breaker
- `blacklistToken(token, reason?)` - Add token to blacklist
- `blacklistStrategy(strategy, reason?)` - Add strategy to blacklist
- `getUnhealthyPerpPositions()` - Get positions near liquidation
- `updateConfig(config)` - Update configuration
- `destroy()` - Cleanup and stop monitoring

## Examples

See `examples/` directory for complete examples:
- `comprehensive.example.ts` - Full feature demonstration

Run examples:
```bash
npm run example:comprehensive
```

## Testing

```bash
npm test
```

## License

MIT
