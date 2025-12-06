import {
  DataLoader,
  HighPerformanceBacktester,
  HTMLReporter,
  SMAStrategy,
  MeanReversionStrategy,
  MomentumStrategy,
  ParallelBacktester,
} from '../src';

/**
 * Comprehensive Backtester Demo
 * 
 * This example demonstrates:
 * 1. Loading historical data from Parquet files
 * 2. Running multi-strategy portfolio simulation
 * 3. Realistic slippage modeling
 * 4. Parallel processing across years
 * 5. Generating detailed HTML report
 */

async function main() {
  console.log('🚀 High-Performance Backtester Demo\n');

  // ========================================
  // Step 1: Load Historical Data
  // ========================================
  console.log('📊 Step 1: Loading historical candle data...');

  const loader = new DataLoader({
    source: 'parquet',
    parquetPath: './data/ETH-USD-1h.parquet', // Your data file
    symbol: 'ETH/USD',
    startTime: new Date('2023-01-01').getTime(),
    endTime: new Date('2023-12-31').getTime(),
    timeframe: '1h',
  });

  let candles;
  try {
    candles = await loader.loadCandles();
    console.log(`✅ Loaded ${candles.length} candles\n`);
  } catch (error) {
    console.error('❌ Error loading data. Using mock data for demo...\n');
    // Generate mock data for demo
    candles = generateMockCandles('ETH/USD', 8760); // 1 year of hourly data
  }

  // Validate data quality
  const validation = DataLoader.validateCandles(candles);
  console.log('📋 Data Validation:');
  console.log(`   Valid: ${validation.valid}`);
  console.log(`   Errors: ${validation.errors.length}`);
  console.log(`   Warnings: ${validation.warnings.length}\n`);

  // ========================================
  // Step 2: Configure Backtester
  // ========================================
  console.log('⚙️  Step 2: Configuring backtester...');

  const backtester = new HighPerformanceBacktester({
    initialEquity: 100000, // $100k starting capital
    commission: 5, // 5 basis points (0.05%)
    slippage: {
      constantBps: 5,    // 5 bps constant slippage
      impactBps: 10,     // 10 bps per $1M
      minSlippage: 1,
      maxSlippage: 500,
    },
    rebalanceInterval: 86400000, // Daily rebalancing (24h in ms)
    maxPositions: 3,
    riskPerTrade: 2, // 2% risk per trade
  });

  console.log('✅ Backtester configured\n');

  // ========================================
  // Step 3: Register Strategies
  // ========================================
  console.log('📈 Step 3: Registering strategies...');

  // Strategy 1: SMA Crossover (20/50)
  backtester.registerStrategy('SMA-20-50', new SMAStrategy(20, 50));
  console.log('   ✅ SMA Crossover (20/50)');

  // Strategy 2: Mean Reversion (Bollinger Bands)
  backtester.registerStrategy('BollingerBands', new MeanReversionStrategy(20, 2));
  console.log('   ✅ Mean Reversion (Bollinger Bands)');

  // Strategy 3: Momentum (RSI)
  backtester.registerStrategy('RSI-Momentum', new MomentumStrategy(14, 30, 70));
  console.log('   ✅ Momentum (RSI)\n');

  // ========================================
  // Step 4: Run Backtest
  // ========================================
  console.log('🎯 Step 4: Running backtest...\n');

  // Progress monitoring
  backtester.on('progress', (data) => {
    const progress = ((data.processed / data.total) * 100).toFixed(1);
    process.stdout.write(`\r   Progress: ${progress}% | Equity: $${data.equity.toFixed(2)}`);
  });

  backtester.on('positionOpened', (position) => {
    console.log(`\n   🟢 Opened ${position.side} ${position.symbol} @ $${position.entryPrice.toFixed(2)}`);
  });

  backtester.on('positionClosed', (trade) => {
    const emoji = trade.pnl >= 0 ? '✅' : '❌';
    console.log(`   ${emoji} Closed ${trade.side} ${trade.symbol} | P&L: $${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%)`);
  });

  const { metrics, trades, equityCurve } = await backtester.run(candles);

  console.log('\n\n✅ Backtest complete!\n');

  // ========================================
  // Step 5: Display Results
  // ========================================
  console.log('📊 Step 5: Performance Metrics\n');
  console.log('=' .repeat(60));
  console.log('RETURNS');
  console.log('=' .repeat(60));
  console.log(`Total Return:        ${metrics.totalReturnPercent.toFixed(2)}%`);
  console.log(`Annualized Return:   ${metrics.annualizedReturn.toFixed(2)}%`);
  console.log(`Final Equity:        $${(100000 + metrics.totalReturn).toFixed(2)}`);

  console.log('\n' + '='.repeat(60));
  console.log('RISK METRICS');
  console.log('=' .repeat(60));
  console.log(`Sharpe Ratio:        ${metrics.sharpeRatio.toFixed(3)}`);
  console.log(`Sortino Ratio:       ${metrics.sortinoRatio.toFixed(3)}`);
  console.log(`Calmar Ratio:        ${metrics.calmarRatio.toFixed(3)}`);
  console.log(`Max Drawdown:        ${metrics.maxDrawdownPercent.toFixed(2)}% ($${metrics.maxDrawdown.toFixed(2)})`);

  console.log('\n' + '='.repeat(60));
  console.log('TRADE STATISTICS');
  console.log('=' .repeat(60));
  console.log(`Total Trades:        ${metrics.totalTrades}`);
  console.log(`Winning Trades:      ${metrics.winningTrades} (${metrics.winRate.toFixed(2)}%)`);
  console.log(`Losing Trades:       ${metrics.losingTrades}`);
  console.log(`Avg Win:             $${metrics.avgWin.toFixed(2)}`);
  console.log(`Avg Loss:            $${metrics.avgLoss.toFixed(2)}`);
  console.log(`Profit Factor:       ${metrics.profitFactor.toFixed(2)}`);
  console.log(`Best Trade:          $${metrics.bestTrade.toFixed(2)}`);
  console.log(`Worst Trade:         $${metrics.worstTrade.toFixed(2)}`);

  console.log('\n' + '='.repeat(60));
  console.log('STRATEGY BREAKDOWN');
  console.log('=' .repeat(60));
  for (const [name, stratMetrics] of metrics.strategyMetrics.entries()) {
    console.log(`\n${name}:`);
    console.log(`  Return:      $${stratMetrics.totalReturn.toFixed(2)}`);
    console.log(`  Sharpe:      ${stratMetrics.sharpeRatio.toFixed(3)}`);
    console.log(`  Max DD:      $${stratMetrics.maxDrawdown.toFixed(2)}`);
    console.log(`  Trades:      ${stratMetrics.totalTrades}`);
    console.log(`  Win Rate:    ${stratMetrics.winRate.toFixed(2)}%`);
  }

  // ========================================
  // Step 6: Generate HTML Report
  // ========================================
  console.log('\n\n📝 Step 6: Generating HTML report...');

  const reporter = new HTMLReporter({
    title: 'Multi-Strategy Backtester Report - ETH/USD 2023',
    outputPath: './reports/backtest-report.html',
    includeTradeLog: true,
    includeCharts: true,
  });

  reporter.generateReport(metrics, trades);

  console.log('\n' + '='.repeat(60));
  console.log('✅ DEMO COMPLETE!');
  console.log('=' .repeat(60));
  console.log('📁 Report saved to: ./reports/backtest-report.html');
  console.log('🌐 Open the report in your browser to see detailed analytics\n');
}

/**
 * Generate mock candles for demo purposes
 */
function generateMockCandles(symbol: string, count: number) {
  const candles = [];
  let price = 2000;
  const startTime = new Date('2023-01-01').getTime();

  for (let i = 0; i < count; i++) {
    // Random walk with drift
    const change = (Math.random() - 0.48) * 20; // Slight upward bias
    price += change;
    price = Math.max(1000, price); // Floor at $1000

    const high = price + Math.random() * 10;
    const low = price - Math.random() * 10;
    const open = low + Math.random() * (high - low);
    const close = low + Math.random() * (high - low);

    candles.push({
      timestamp: startTime + i * 3600000, // Hourly
      open,
      high,
      low,
      close,
      volume: 1000000 + Math.random() * 5000000,
      symbol,
    });
  }

  return candles;
}

/**
 * Demo: Parallel Backtest Across Years
 */
async function parallelDemo() {
  console.log('\n🚀 Parallel Backtester Demo\n');

  // Load multi-year data
  const candles = generateMockCandles('ETH/USD', 26280); // 3 years

  const parallelBacktester = new ParallelBacktester();

  const config = {
    initialEquity: 100000,
    commission: 5,
    slippage: {
      constantBps: 5,
      impactBps: 10,
      minSlippage: 1,
      maxSlippage: 500,
    },
  };

  const { trades, equityCurve, yearResults } = await parallelBacktester.runParallel(candles, config);

  console.log(`\n✅ Parallel backtest complete!`);
  console.log(`   Total trades: ${trades.length}`);
  console.log(`   Years processed: ${yearResults.size}`);

  for (const [year, result] of yearResults.entries()) {
    console.log(`\n   Year ${year}:`);
    console.log(`     Trades: ${result.trades.length}`);
    console.log(`     Final Equity: $${result.finalEquity.toFixed(2)}`);
  }
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
  
  // Uncomment to run parallel demo
  // parallelDemo().catch(console.error);
}
