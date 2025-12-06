/**
 * Example: Hot-Reload Strategy System
 * 
 * This example demonstrates hot-reloading of strategies
 * during runtime without stopping execution.
 */

import { 
  StrategyLoader,
  StrategyMode,
  Candle 
} from '@trading-bot/strategies';
import { logger } from '@trading-bot/core';
import * as fs from 'fs';
import * as path from 'path';

async function runHotReloadExample() {
  logger.info('=== Hot-Reload Strategy Example ===\n');
  
  // Create a temporary strategy file for testing
  const tempStrategyPath = path.join(__dirname, 'temp-strategy.js');
  createTempStrategy(tempStrategyPath, 1);
  
  // Create strategy loader with hot-reload enabled
  const loader = new StrategyLoader({
    mode: StrategyMode.LIVE,
    symbols: ['ETH/USD'],
    params: {
      gridLevels: 10,
      orderSize: 0.1,
    },
    enableHotReload: true,
  });
  
  logger.info('📦 Loading initial strategy...');
  const strategy = await loader.loadStrategy(tempStrategyPath);
  
  // Setup event listeners
  strategy.on('order', (order) => {
    logger.info('🔔 Order:', order);
  });
  
  strategy.on('initialized', () => {
    logger.info('✅ Strategy initialized');
  });
  
  strategy.on('shutdown', () => {
    logger.info('🛑 Strategy shut down');
  });
  
  logger.info(`\n🚀 Strategy running: ${strategy.name} v${strategy.version}`);
  logger.info('📡 Hot-reload is active, watching for changes...\n');
  
  // Feed some candles
  logger.info('📊 Processing candles...');
  for (let i = 0; i < 5; i++) {
    const candle = generateCandle('ETH/USD', 2000 + i * 10);
    strategy.onCandle(candle);
    await sleep(1000);
  }
  
  // Simulate strategy file change
  logger.info('\n🔄 Modifying strategy file (simulating hot-reload)...');
  await sleep(2000);
  
  createTempStrategy(tempStrategyPath, 2);
  logger.info('✏️  Strategy file updated to version 2.0.0');
  
  // Wait for hot-reload to complete
  logger.info('⏳ Waiting for hot-reload...');
  await sleep(3000);
  
  logger.info(`\n🔥 Strategy reloaded: ${strategy.name} v${strategy.version}`);
  logger.info('📊 Continuing with updated strategy...\n');
  
  // Continue with updated strategy
  for (let i = 5; i < 10; i++) {
    const candle = generateCandle('ETH/USD', 2000 + i * 10);
    strategy.onCandle(candle);
    await sleep(1000);
  }
  
  // Get stats
  const stats = strategy.getStats();
  logger.info('\n📊 Strategy Statistics:', {
    totalTrades: stats.totalTrades,
    winRate: (stats.winRate * 100).toFixed(2) + '%',
  });
  
  // Cleanup
  await loader.stop();
  
  // Remove temporary file
  if (fs.existsSync(tempStrategyPath)) {
    fs.unlinkSync(tempStrategyPath);
    logger.info('\n🧹 Cleaned up temporary files');
  }
  
  logger.info('\n✅ Hot-reload example completed!');
}

/**
 * Create a temporary strategy file for testing
 */
function createTempStrategy(filePath: string, version: number): void {
  const strategyCode = `
import { TradingStrategy } from '@trading-bot/strategies';

export class TempStrategy extends TradingStrategy {
  name = 'TempStrategy';
  version = '${version}.0.0';
  
  async onInitialize() {
    console.log('TempStrategy v${version}.0.0 initialized');
  }
  
  async onShutdown() {
    console.log('TempStrategy v${version}.0.0 shutting down');
  }
  
  handleCandle(candle) {
    console.log(\`TempStrategy v${version}.0.0 processing candle: \${candle.symbol} @ \${candle.close}\`);
  }
  
  handleOrderFill(fill) {
    console.log(\`TempStrategy v${version}.0.0 order filled: \${fill.orderId}\`);
  }
  
  handlePositionUpdate(position) {
    console.log(\`TempStrategy v${version}.0.0 position updated: \${position.symbol}\`);
  }
  
  onReset() {
    console.log('TempStrategy v${version}.0.0 reset');
  }
}

export default TempStrategy;
`;
  
  fs.writeFileSync(filePath, strategyCode, 'utf8');
}

function generateCandle(symbol: string, price: number): Candle {
  return {
    symbol,
    timestamp: Date.now(),
    open: price - 1,
    high: price + 2,
    low: price - 2,
    close: price,
    volume: 100 + Math.random() * 200,
    interval: '5m',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run example
runHotReloadExample()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Example failed:', error);
    process.exit(1);
  });
