import { RiskEngine, loadRiskConfig } from '../src/index.js';
import { Order } from '@trading-bot/core';

/**
 * Comprehensive example demonstrating all RiskEngine features
 */

async function main() {
  console.log('🎯 Risk Engine Comprehensive Example\n');

  // 1. Load configuration from YAML
  console.log('1️⃣  Loading configuration...');
  const config = loadRiskConfig('./config.example.yaml');
  console.log('   ✅ Configuration loaded\n');

  // 2. Initialize Risk Engine
  console.log('2️⃣  Initializing Risk Engine...');
  const riskEngine = new RiskEngine(config);
  console.log('   ✅ Risk Engine initialized\n');

  // 3. Update with initial market data
  console.log('3️⃣  Adding market data for VaR and volatility tracking...');
  
  // Simulate historical price data
  const basePrice = 2000;
  for (let i = 0; i < 100; i++) {
    const price = basePrice + (Math.random() - 0.5) * 100;
    riskEngine.addPriceData('ETH/USD', price, Date.now() - (100 - i) * 60000);
  }
  
  // Add candle data for better volatility analysis
  for (let i = 0; i < 50; i++) {
    const open = basePrice + (Math.random() - 0.5) * 50;
    const close = open + (Math.random() - 0.5) * 30;
    const high = Math.max(open, close) + Math.random() * 20;
    const low = Math.min(open, close) - Math.random() * 20;
    
    riskEngine.addCandleData('ETH/USD', {
      timestamp: Date.now() - (50 - i) * 3600000,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000000,
    });
  }
  console.log('   ✅ Market data added\n');

  // 4. Validate an order
  console.log('4️⃣  Validating a sample order...');
  const order: Order = {
    symbol: 'ETH/USD',
    side: 'buy',
    type: 'limit',
    quantity: 1,
    price: 2000,
    timestamp: Date.now(),
    status: 'pending',
    id: 'test-order-1',
  };

  const validation = riskEngine.validateOrder(order, 'GridStrategy', 1);
  
  if (validation.approved) {
    console.log('   ✅ Order approved');
    if (validation.warnings) {
      console.log('   ⚠️  Warnings:', validation.warnings);
    }
  } else {
    console.log('   ❌ Order rejected:', validation.reason);
  }
  console.log('');

  // 5. Calculate optimal position size using Kelly
  console.log('5️⃣  Calculating optimal position size (Kelly Criterion)...');
  const positionSize = riskEngine.calculatePositionSize(
    2000,  // Entry price
    1900,  // Stop loss
    'ETH/USD',
    'GridStrategy',
    {
      winRate: 0.55,
      avgWin: 50,
      avgLoss: -30,
      totalTrades: 100,
    }
  );
  console.log(`   📊 Recommended position size: ${positionSize.toFixed(4)} ETH\n`);

  // 6. Register position and update exposure
  console.log('6️⃣  Registering position...');
  riskEngine.addPosition('GridStrategy', 'ETH/USD', 2000, 1);
  console.log('   ✅ Position registered\n');

  // 7. Test perpetual position with liquidation monitoring
  console.log('7️⃣  Testing perpetual position with 5x leverage...');
  riskEngine.addPerpPosition({
    symbol: 'ETH/USD-PERP',
    entryPrice: 2000,
    markPrice: 2050,
    liquidationPrice: 1600,
    collateral: 400,
    leverage: 5,
    side: 'long',
  });
  console.log('   ✅ Perp position added to monitoring\n');

  // 8. Simulate drawdown
  console.log('8️⃣  Simulating drawdown scenario...');
  console.log('   Initial equity: $10,000');
  
  riskEngine.updateEquity(9500);
  console.log('   Equity after loss: $9,500 (5% drawdown)');
  
  riskEngine.updateEquity(9000);
  console.log('   Equity after more loss: $9,000 (10% drawdown)');
  
  riskEngine.updateEquity(8500);
  console.log('   Equity after more loss: $8,500 (15% drawdown)');
  console.log('   ⚠️  Circuit breaker should activate at 15% daily drawdown\n');

  // 9. Try to place order with circuit breaker active
  console.log('9️⃣  Testing order validation with circuit breaker active...');
  const blockedOrder: Order = {
    symbol: 'BTC/USD',
    side: 'buy',
    type: 'limit',
    quantity: 0.1,
    price: 40000,
    timestamp: Date.now(),
    status: 'pending',
    id: 'test-order-2',
  };

  const blockedValidation = riskEngine.validateOrder(blockedOrder, 'GridStrategy', 1);
  console.log('   Result:', blockedValidation.approved ? '✅ Approved' : '❌ Blocked');
  if (!blockedValidation.approved) {
    console.log('   Reason:', blockedValidation.reason);
  }
  console.log('');

  // 10. Get comprehensive risk metrics
  console.log('🔟 Getting comprehensive risk metrics...');
  const metrics = riskEngine.getRiskMetrics();
  
  console.log('\n   📊 Risk Metrics Summary:');
  console.log('   ========================');
  
  console.log('\n   Circuit Breaker:');
  console.log(`     Status: ${metrics.circuitBreaker.isCircuitBreakerActive ? '🔴 ACTIVE' : '🟢 Inactive'}`);
  console.log(`     Daily Drawdown: ${(metrics.circuitBreaker.dailyDrawdown * 100).toFixed(2)}%`);
  console.log(`     Total Drawdown: ${(metrics.circuitBreaker.totalDrawdown * 100).toFixed(2)}%`);
  
  if (metrics.var) {
    console.log('\n   Value at Risk (95% confidence):');
    console.log(`     Historical VaR: ${(metrics.var.historicalVaR * 100).toFixed(2)}%`);
    console.log(`     Monte Carlo VaR: ${(metrics.var.monteCarloVaR * 100).toFixed(2)}%`);
    console.log(`     CVaR (Expected Shortfall): ${(metrics.var.cvar * 100).toFixed(2)}%`);
  }
  
  if (metrics.volatility) {
    console.log('\n   Volatility:');
    console.log(`     Level: ${metrics.volatility.volatilityLevel}/10`);
    console.log(`     Bollinger Bandwidth: ${(metrics.volatility.bollingerBandwidth * 100).toFixed(2)}%`);
    console.log(`     Should De-leverage: ${metrics.volatility.shouldDeleverage ? '⚠️  Yes' : '✅ No'}`);
  }
  
  console.log('\n   Exposure:');
  console.log(`     Total Exposure: ${(metrics.exposure.totalExposureRatio * 100).toFixed(2)}%`);
  console.log(`     Strategies: ${metrics.exposure.strategies.length}`);
  console.log(`     Tokens: ${metrics.exposure.tokens.length}`);
  
  if (metrics.kelly) {
    console.log('\n   Kelly Stats:');
    console.log(`     Win Rate: ${(metrics.kelly.winRate * 100).toFixed(2)}%`);
    console.log(`     Avg Win: $${metrics.kelly.avgWin.toFixed(2)}`);
    console.log(`     Avg Loss: $${metrics.kelly.avgLoss.toFixed(2)}`);
    console.log(`     Total Trades: ${metrics.kelly.totalTrades}`);
  }

  // 11. Check unhealthy perp positions
  console.log('\n1️⃣1️⃣  Checking perpetual positions health...');
  const unhealthyPositions = riskEngine.getUnhealthyPerpPositions();
  
  if (unhealthyPositions.length > 0) {
    console.log('   ⚠️  Unhealthy positions found:');
    unhealthyPositions.forEach(({ symbol, status }) => {
      console.log(`     ${symbol}: ${(status.bufferPercent * 100).toFixed(2)}% buffer - Action: ${status.recommendedAction}`);
    });
  } else {
    console.log('   ✅ All perpetual positions healthy');
  }

  // 12. Test blacklisting
  console.log('\n1️⃣2️⃣  Testing token blacklist...');
  riskEngine.blacklistToken('SHIB', 'High volatility meme token');
  
  const blacklistedOrder: Order = {
    symbol: 'SHIB/USD',
    side: 'buy',
    type: 'limit',
    quantity: 1000000,
    price: 0.00001,
    timestamp: Date.now(),
    status: 'pending',
    id: 'test-order-3',
  };
  
  const blacklistCheck = riskEngine.validateOrder(blacklistedOrder, 'GridStrategy', 1);
  console.log(`   Blacklisted token order: ${blacklistCheck.approved ? '✅ Approved' : '❌ Blocked'}`);
  if (!blacklistCheck.approved) {
    console.log(`   Reason: ${blacklistCheck.reason}`);
  }

  // 13. Reset circuit breaker (manual intervention)
  console.log('\n1️⃣3️⃣  Manually resetting circuit breaker...');
  riskEngine.resetCircuitBreaker();
  console.log('   ✅ Circuit breaker reset (trading resumed)\n');

  // 14. Cleanup
  console.log('1️⃣4️⃣  Cleaning up...');
  riskEngine.destroy();
  console.log('   ✅ Risk Engine destroyed\n');

  console.log('✅ Example completed successfully!');
  console.log('\n📝 Key Takeaways:');
  console.log('   - Kelly criterion optimizes position sizing based on win rate');
  console.log('   - VaR and CVaR provide real-time risk measurement');
  console.log('   - Circuit breaker stops trading at 15% daily drawdown');
  console.log('   - Exposure limits prevent over-concentration');
  console.log('   - Liquidation buffer monitors perp positions');
  console.log('   - Volatility monitor triggers automatic de-leveraging');
  console.log('   - Blacklists prevent trading specific tokens/strategies');
}

// Run example
main().catch(console.error);
