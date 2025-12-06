import 'dotenv/config';
import { ConfigLoader, logger } from '@trading-bot/core';
import { UniswapExchange } from '@trading-bot/exchanges';
import { GridStrategy } from '@trading-bot/strategies';
import { RiskManager } from '@trading-bot/risk-engine';
import { TradingBot } from './bot.js';
import { ApiServer } from './api-server.js';

async function main() {
  try {
    // Load configuration
    const config = ConfigLoader.loadFromEnv();
    logger.setLevel(config.logging?.level || 'info');

    logger.info('Starting trading bot application...');

    // Initialize exchange
    const exchange = new UniswapExchange(config.exchange?.rpcUrl || 'https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY');

    // Initialize strategy
    const strategy = new GridStrategy({
      gridSize: 10,
      gridSpacing: 50,
      basePrice: 2000,
      quantity: 0.1,
    });

    // Initialize risk manager
    const riskManager = new RiskManager({
      positionSizer: {
        accountBalance: 10000,
        riskPerTrade: 0.02,
        method: 'fixed',
      },
      drawdownMonitor: {
        maxDrawdown: config.risk?.maxDrawdown || 0.1,
        highWaterMark: 10000,
      },
      maxPositionSize: config.risk?.maxPositionSize || 1000,
      stopLossPercent: config.risk?.stopLossPercent || 0.02,
      takeProfitPercent: config.risk?.takeProfitPercent || 0.05,
    });

    // Create bot
    const bot = new TradingBot(config as any, exchange, strategy, riskManager);

    // Event listeners
    bot.on('started', () => {
      logger.info('Bot started successfully');
    });

    bot.on('stopped', () => {
      logger.info('Bot stopped');
      process.exit(0);
    });

    bot.on('order', (order) => {
      logger.info('Order event:', order);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await bot.stop();
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      await bot.stop();
    });

    // Start bot
    await bot.start();

    // Start API server
    const apiServer = new ApiServer(bot, 3001);
    await apiServer.start();
    logger.info('Trading bot and API server are running');

    // Optional: Enable hot-reload for strategies
    // bot.enableHotReload('./strategies');

  } catch (error) {
    logger.error('Fatal error in main', error);
    process.exit(1);
  }
}

main();
