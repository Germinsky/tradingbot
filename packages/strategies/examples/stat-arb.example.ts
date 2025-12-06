/**
 * Example: Statistical Arbitrage Funding Rate Strategy
 * 
 * This example demonstrates stat arb between perpetual funding rates
 * and spot basis across multiple DEX protocols.
 */

import { 
  StatArbFundingStrategy, 
  StrategyMode,
  Candle,
  FundingRate,
  Execution 
} from '@trading-bot/strategies';
import { logger } from '@trading-bot/core';

async function runStatArbExample() {
  logger.info('=== Statistical Arbitrage Funding Rate Strategy Example ===');
  
  const strategy = new StatArbFundingStrategy({
    mode: StrategyMode.LIVE,
    symbols: ['ETH/USD'],
    params: {
      protocols: ['gmx', 'dydx', 'gains', 'perp-protocol', 'kwenta'],
      lookbackPeriod: 24,       // 24 hours of history
      entryZScore: 2.0,         // Enter at 2 std devs
      exitZScore: 0.5,          // Exit at 0.5 std devs
      positionSize: 1.0,        // 1 ETH per leg
      rebalanceThreshold: 0.1,  // Rebalance at 10% delta
    },
  });
  
  // Listen for arbitrage opportunities
  strategy.on('order', (order) => {
    logger.info('📍 Spot order:', order);
  });
  
  strategy.on('perpOrder', (order) => {
    logger.info('⚡ Perp order:', order);
  });
  
  strategy.on('orderFill', (fill: Execution) => {
    logger.info('✅ Fill:', {
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price,
    });
  });
  
  strategy.on('closePerpPosition', (close) => {
    logger.info('🔒 Closing perp position:', close);
  });
  
  strategy.on('rebalanceNeeded', (rebalance) => {
    logger.warn('⚖️  Position needs rebalancing:', rebalance);
  });
  
  await strategy.initialize();
  
  // Simulate incoming data
  const protocols = ['gmx', 'dydx', 'gains', 'perp-protocol', 'kwenta'];
  
  // Generate initial historical data
  logger.info('📥 Loading historical data...');
  for (let i = 0; i < 100; i++) {
    const timestamp = Date.now() - ((100 - i) * 15 * 60 * 1000); // 15min intervals
    
    protocols.forEach(protocol => {
      // Simulate funding rates with random walk
      const baseFunding = 0.0001;
      const noise = (Math.random() - 0.5) * 0.0002;
      const fundingRate = baseFunding + noise;
      
      strategy.updateFundingRate({
        symbol: 'ETH/USD',
        protocol,
        rate: fundingRate,
        timestamp,
        nextFundingTime: timestamp + 8 * 3600 * 1000,
        predictedRate: fundingRate * 1.1,
      });
      
      // Update perp prices (slightly different from spot)
      const perpPrice = 2000 + (Math.random() - 0.5) * 10;
      strategy.updatePerpPrice('ETH/USD', protocol, perpPrice);
    });
  }
  
  logger.info('✅ Historical data loaded');
  logger.info('🔍 Monitoring for arbitrage opportunities...\n');
  
  // Simulate real-time data feed
  for (let i = 0; i < 50; i++) {
    const timestamp = Date.now();
    
    // Generate spot candle
    const spotPrice = 2000 + Math.sin(i / 10) * 50 + (Math.random() - 0.5) * 20;
    const candle: Candle = {
      symbol: 'ETH/USD',
      timestamp,
      open: spotPrice - 1,
      high: spotPrice + 2,
      low: spotPrice - 2,
      close: spotPrice,
      volume: 100 + Math.random() * 200,
      interval: '15m',
    };
    
    strategy.onCandle(candle);
    
    // Update funding rates for each protocol
    protocols.forEach((protocol, idx) => {
      // Simulate funding rate divergence (create opportunity)
      let fundingRate: number;
      
      if (i > 20 && i < 30 && protocol === 'gmx') {
        // Create arbitrage opportunity on GMX
        fundingRate = 0.0005 + (Math.random() - 0.5) * 0.0001; // High funding
      } else if (i > 35 && i < 45 && protocol === 'dydx') {
        // Create opposite opportunity on dYdX
        fundingRate = -0.0003 + (Math.random() - 0.5) * 0.0001; // Negative funding
      } else {
        // Normal funding rates
        fundingRate = 0.0001 + (Math.random() - 0.5) * 0.00015;
      }
      
      strategy.updateFundingRate({
        symbol: 'ETH/USD',
        protocol,
        rate: fundingRate,
        timestamp,
        nextFundingTime: timestamp + 8 * 3600 * 1000,
      });
      
      // Update perp prices (create basis spread)
      const basisSpread = protocol === 'gmx' && i > 20 && i < 30 
        ? 10  // GMX perp trading at premium
        : protocol === 'dydx' && i > 35 && i < 45
        ? -8  // dYdX perp trading at discount
        : (Math.random() - 0.5) * 3;
      
      const perpPrice = spotPrice + basisSpread;
      strategy.updatePerpPrice('ETH/USD', protocol, perpPrice);
    });
    
    // Simulate order fills when positions are opened
    if (i === 25 || i === 40) {
      const fill: Execution = {
        orderId: `spot-${Date.now()}`,
        symbol: 'ETH/USD',
        side: i === 25 ? 'buy' : 'sell',
        quantity: 1.0,
        price: spotPrice,
        fee: spotPrice * 1.0 * 0.001,
        timestamp,
        executionId: `exec-${Date.now()}`,
      };
      strategy.onOrderFill(fill);
    }
    
    await sleep(500);
  }
  
  // Get final statistics
  const stats = strategy.getStats();
  logger.info('\n📊 Final Statistics:', {
    totalTrades: stats.totalTrades,
    winRate: (stats.winRate * 100).toFixed(2) + '%',
    totalPnL: stats.totalPnL.toFixed(2),
    sharpeRatio: stats.sharpeRatio.toFixed(2),
    profitFactor: stats.profitFactor.toFixed(2),
  });
  
  await strategy.shutdown();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run example
runStatArbExample()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Example failed:', error);
    process.exit(1);
  });
