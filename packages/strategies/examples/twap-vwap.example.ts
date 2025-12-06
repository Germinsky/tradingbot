/**
 * Example: TWAP/VWAP Execution Strategy
 * 
 * This example demonstrates smart order execution with
 * DEX aggregator routing.
 */

import { 
  TWAPVWAPStrategy, 
  StrategyMode,
  Candle,
  Execution 
} from '@trading-bot/strategies';
import { logger } from '@trading-bot/core';

async function runTWAPVWAPExample() {
  logger.info('=== TWAP/VWAP Execution Strategy Example ===');
  
  // Example 1: TWAP Execution
  await runTWAPExample();
  
  // Example 2: VWAP Execution
  await runVWAPExample();
}

async function runTWAPExample() {
  logger.info('\n📊 Running TWAP Example...');
  
  const strategy = new TWAPVWAPStrategy({
    mode: StrategyMode.LIVE,
    symbols: ['BTC/USD'],
    params: {
      totalSize: 5.0,           // Execute 5 BTC
      duration: 3600,           // Over 1 hour
      intervals: 20,            // In 20 chunks
      mode: 'twap',             // Time-weighted
      maxSlippage: 0.005,       // 0.5% max slippage
      useAggregator: 'auto',    // Auto-select best aggregator
      minChunkSize: 0.1,        // Min 0.1 BTC per order
      side: 'buy',              // Buy side
    },
  });
  
  // Listen for execution events
  strategy.on('order', (order) => {
    logger.info('⏰ TWAP order scheduled:', {
      size: order.quantity,
      side: order.side,
      timestamp: new Date().toISOString(),
    });
  });
  
  strategy.on('orderFill', (fill: Execution) => {
    logger.info('✅ TWAP chunk executed:', {
      size: fill.quantity,
      price: fill.price,
      fee: fill.fee,
    });
  });
  
  strategy.on('executionComplete', (summary) => {
    logger.info('🎉 TWAP execution complete:', summary);
  });
  
  await strategy.initialize();
  
  // Feed candle data to trigger execution
  const candles = generateMockCandles('BTC/USD', 25);
  
  for (const candle of candles) {
    strategy.onCandle(candle);
    
    // Simulate fills (in production, comes from exchange)
    if (Math.random() > 0.3) {
      const fill: Execution = {
        orderId: `twap-${Date.now()}`,
        symbol: 'BTC/USD',
        side: 'buy',
        quantity: 0.25,
        price: candle.close,
        fee: candle.close * 0.25 * 0.001,
        timestamp: candle.timestamp,
        executionId: `exec-${Date.now()}`,
      };
      strategy.onOrderFill(fill);
    }
    
    await sleep(200);
  }
  
  await strategy.shutdown();
}

async function runVWAPExample() {
  logger.info('\n📈 Running VWAP Example...');
  
  const strategy = new TWAPVWAPStrategy({
    mode: StrategyMode.LIVE,
    symbols: ['ETH/USD'],
    params: {
      totalSize: 10.0,          // Execute 10 ETH
      duration: 7200,           // Over 2 hours
      intervals: 30,            // In 30 chunks
      mode: 'vwap',             // Volume-weighted
      maxSlippage: 0.003,       // 0.3% max slippage
      useAggregator: '1inch',   // Use 1inch aggregator
      minChunkSize: 0.1,
      side: 'sell',             // Sell side
    },
  });
  
  strategy.on('order', (order) => {
    logger.info('📊 VWAP order (volume-weighted):', {
      size: order.quantity,
      side: order.side,
      hour: new Date().getHours(),
    });
  });
  
  strategy.on('orderFill', (fill: Execution) => {
    const avgPrice = strategy.getStats().totalPnL / strategy.getStats().totalTrades;
    logger.info('✅ VWAP chunk executed:', {
      size: fill.quantity,
      price: fill.price,
      avgExecutionPrice: avgPrice.toFixed(2),
    });
  });
  
  strategy.on('executionComplete', (summary) => {
    logger.info('🎉 VWAP execution complete:', {
      totalSize: summary.totalSize,
      executedSize: summary.executedSize,
      duration: summary.duration.toFixed(2) + 's',
      avgPrice: (summary.executedSize / summary.totalSize).toFixed(2),
    });
  });
  
  await strategy.initialize();
  
  // Feed candle data
  const candles = generateMockCandles('ETH/USD', 35);
  
  for (const candle of candles) {
    strategy.onCandle(candle);
    
    if (Math.random() > 0.4) {
      const fill: Execution = {
        orderId: `vwap-${Date.now()}`,
        symbol: 'ETH/USD',
        side: 'sell',
        quantity: 0.33,
        price: candle.close,
        fee: candle.close * 0.33 * 0.001,
        timestamp: candle.timestamp,
        executionId: `exec-${Date.now()}`,
      };
      strategy.onOrderFill(fill);
    }
    
    await sleep(200);
  }
  
  await strategy.shutdown();
}

function generateMockCandles(symbol: string, count: number): Candle[] {
  const candles: Candle[] = [];
  let price = symbol.includes('BTC') ? 40000 : 2000;
  let timestamp = Date.now() - (count * 5 * 60 * 1000);
  
  for (let i = 0; i < count; i++) {
    const hour = new Date(timestamp).getHours();
    
    // Simulate volume patterns (higher during US trading hours)
    const volumeMultiplier = (hour >= 13 && hour <= 21) ? 2.0 : 1.0;
    const baseVolume = symbol.includes('BTC') ? 10 : 500;
    
    const volatility = symbol.includes('BTC') ? 100 : 5;
    const change = (Math.random() - 0.5) * volatility;
    
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * (volatility / 2);
    const low = Math.min(open, close) - Math.random() * (volatility / 2);
    const volume = baseVolume * volumeMultiplier * (0.5 + Math.random());
    
    candles.push({
      symbol,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      interval: '5m',
    });
    
    price = close;
    timestamp += 5 * 60 * 1000;
  }
  
  return candles;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run example
runTWAPVWAPExample()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Example failed:', error);
    process.exit(1);
  });
