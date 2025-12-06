/**
 * Example: Dynamic Grid Strategy
 * 
 * This example demonstrates how to use the Dynamic Grid Strategy
 * with ATR-based range adjustment.
 */

import { 
  DynamicGridStrategy, 
  StrategyMode,
  Candle,
  Execution 
} from '@trading-bot/strategies';
import { logger } from '@trading-bot/core';

async function runDynamicGridExample() {
  logger.info('=== Dynamic Grid Strategy Example ===');
  
  // Create strategy instance
  const strategy = new DynamicGridStrategy({
    mode: StrategyMode.LIVE,
    symbols: ['ETH/USD'],
    params: {
      gridLevels: 10,           // 10 grid levels
      atrPeriod: 14,            // 14-period ATR
      atrMultiplier: 2.0,       // Grid spans 2x ATR
      orderSize: 0.1,           // 0.1 ETH per order
      rebalanceThreshold: 0.1,  // Rebalance at 10% price move
    },
    riskConfig: {
      positionSizer: {
        method: 'fixed',
        accountBalance: 10000,
        fixedAmount: 1000,
        riskPercent: 0.02,
      },
      drawdownMonitor: {
        maxDrawdownPercent: 0.2,
        resetOnNewHigh: true,
        circuitBreakerDuration: 3600000,
      },
      maxPositionSize: 10,
      stopLossPercent: 0.05,
      takeProfitPercent: 0.1,
    },
  });
  
  // Setup event listeners
  strategy.on('order', (order) => {
    logger.info('🔔 New order placed:', order);
  });
  
  strategy.on('orderFill', (fill: Execution) => {
    logger.info('✅ Order filled:', fill);
  });
  
  strategy.on('orderRejected', (order) => {
    logger.warn('❌ Order rejected:', order);
  });
  
  strategy.on('error', (error) => {
    logger.error('💥 Strategy error:', error);
  });
  
  // Initialize strategy
  await strategy.initialize();
  logger.info('Strategy initialized successfully');
  
  // Simulate incoming candle data
  const mockCandles: Candle[] = generateMockCandles('ETH/USD', 50);
  
  for (const candle of mockCandles) {
    strategy.onCandle(candle);
    
    // Simulate order fills (in production, these come from exchange)
    if (Math.random() > 0.8) {
      const mockFill: Execution = {
        orderId: `order-${Date.now()}`,
        symbol: candle.symbol,
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        quantity: 0.1,
        price: candle.close,
        fee: 0.001,
        timestamp: candle.timestamp,
        executionId: `exec-${Date.now()}`,
      };
      strategy.onOrderFill(mockFill);
    }
    
    // Small delay between candles
    await sleep(100);
  }
  
  // Get strategy statistics
  const stats = strategy.getStats();
  logger.info('📊 Strategy Statistics:', {
    totalTrades: stats.totalTrades,
    winRate: (stats.winRate * 100).toFixed(2) + '%',
    totalPnL: stats.totalPnL.toFixed(2),
    sharpeRatio: stats.sharpeRatio.toFixed(2),
    maxDrawdown: (stats.maxDrawdown * 100).toFixed(2) + '%',
    profitFactor: stats.profitFactor.toFixed(2),
  });
  
  // Shutdown
  await strategy.shutdown();
  logger.info('Strategy shut down successfully');
}

/**
 * Generate mock candle data for testing
 */
function generateMockCandles(symbol: string, count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 2000;
  let timestamp = Date.now() - (count * 5 * 60 * 1000); // Start 5min candles from past
  
  for (let i = 0; i < count; i++) {
    const volatility = 20;
    const change = (Math.random() - 0.5) * volatility;
    
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 10;
    const low = Math.min(open, close) - Math.random() * 10;
    const volume = 100 + Math.random() * 500;
    
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
    timestamp += 5 * 60 * 1000; // 5 minutes
  }
  
  return candles;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run example
runDynamicGridExample()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Example failed:', error);
    process.exit(1);
  });
