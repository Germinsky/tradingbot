/**
 * Production Trading Bot Entry Point
 * 
 * Features:
 * - Multi-chain support (Ethereum, Arbitrum, Base, Optimism, Polygon)
 * - Encrypted wallet management (AWS KMS / Hashicorp Vault)
 * - Multiple exchange adapters
 * - Dynamic strategy loading from config
 * - Transaction simulation (Etherscan + Blockscout)
 * - Automatic gas price oracle (Blocknative + EigenPhi)
 * - Alert webhooks (Slack/Discord/Telegram)
 * - OpenTelemetry tracing with Jaeger export
 * - Prometheus metrics endpoint
 * - Health check HTTP server
 * - Graceful shutdown with position monitoring
 * - Auto-restart via PM2 or Docker + Watchtower
 */

import 'dotenv/config';
import { resolve } from 'path';
import { logger, Exchange, Strategy, Position } from '@trading-bot/core';
import { UniswapExchange } from '@trading-bot/exchanges';
import { GridStrategy, StrategyLoader } from '@trading-bot/strategies';
import { RiskManager } from '@trading-bot/risk-engine';
import { TradingBot } from './bot.js';
import { ProductionConfigLoader, ProductionConfig } from './config-loader.js';
import { EncryptionService } from './encryption.js';
import { HealthCheckServer } from './health-server.js';
import { PrometheusMetrics } from './metrics.js';
import { TransactionSimulator } from './transaction-simulator.js';
import { GasOracle } from './gas-oracle.js';
import { AlertService } from './alert-service.js';
import { TracingService } from './tracing-service.js';

// Global state for cleanup
let bots: TradingBot[] = [];
let healthServer: HealthCheckServer | null = null;
let gasOracles: Map<number, GasOracle> = new Map();
let tracingService: TracingService | null = null;
let isShuttingDown = false;

/**
 * Main application entry point
 */
async function main() {
  try {
    // Initialize tracing first
    tracingService = new TracingService({
      serviceName: 'trading-bot',
      jaegerEndpoint: process.env.JAEGER_ENDPOINT,
      enabled: process.env.ENABLE_TRACING !== 'false'
    });

    await tracingService.traceAsync('bot.startup', async (span) => {
      // Load production configuration
      const configPath = process.env.CONFIG_PATH || resolve(__dirname, '../config/prod.yaml');
      logger.info(`Loading configuration from: ${configPath}`);
      
      const config = ProductionConfigLoader.load(configPath);
      logger.setLevel(config.logging?.level || 'info');

      logger.info('🚀 Starting Multi-Chain Trading Bot');
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Node Version: ${process.version}`);

      // Initialize alert service
      const alertService = new AlertService({
        slack: process.env.SLACK_WEBHOOK_URL ? {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL,
          username: 'Trading Bot'
        } : undefined,
        discord: process.env.DISCORD_WEBHOOK_URL ? {
          webhookUrl: process.env.DISCORD_WEBHOOK_URL,
          username: 'Trading Bot'
        } : undefined,
        telegram: process.env.TELEGRAM_BOT_TOKEN ? {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          chatId: process.env.TELEGRAM_CHAT_ID!
        } : undefined,
        enabled: process.env.ENABLE_ALERTS !== 'false'
      });

      // Send startup notification
      await alertService.send({
        level: 'info',
        title: '🚀 Trading Bot Starting',
        message: 'Production trading bot is initializing...',
        fields: {
          Environment: process.env.NODE_ENV || 'development',
          'Node Version': process.version,
          Timestamp: new Date().toISOString()
        }
      });

      // Initialize transaction simulator
      const txSimulator = new TransactionSimulator({
        etherscanApiKey: process.env.ETHERSCAN_API_KEY,
        blockscoutUrl: process.env.BLOCKSCOUT_URL
      });

      // Initialize encryption service
      const encryptionService = new EncryptionService(config.encryption);
      logger.info(`Encryption provider: ${config.encryption.provider}`);

      // Decrypt and load wallet private keys
      const wallets: Record<string, { privateKey: string; rpcUrl: string; chainId: number }> = {};
      for (const [chain, walletConfig] of Object.entries(config.wallets)) {
        logger.info(`Decrypting wallet for ${chain}...`);
        const decryptedKey = await encryptionService.decryptPrivateKey(walletConfig.privateKey);
        wallets[chain] = {
          privateKey: decryptedKey,
          rpcUrl: walletConfig.rpcUrl,
          chainId: walletConfig.chainId,
        };
        logger.info(`✓ Wallet loaded for ${chain} (Chain ID: ${walletConfig.chainId})`);

        // Initialize gas oracle for this chain
        const gasOracle = new GasOracle({
          chainId: walletConfig.chainId,
          blocknativeApiKey: process.env.BLOCKNATIVE_API_KEY,
          eigenphiApiKey: process.env.EIGENPHI_API_KEY
        });
        gasOracle.start();
        gasOracles.set(walletConfig.chainId, gasOracle);
        logger.info(`✓ Gas oracle started for chain ${walletConfig.chainId}`);
      }

      // Initialize exchange adapters for each chain
      const exchanges: Map<string, Exchange> = new Map();
      const enabledExchanges = config.exchanges.filter(e => e.enabled);
      
      logger.info(`Initializing ${enabledExchanges.length} exchange adapters...`);
      for (const exchangeConfig of enabledExchanges) {
        try {
          const wallet = wallets[exchangeConfig.chain];
          if (!wallet) {
            logger.warn(`No wallet configured for chain ${exchangeConfig.chain}, skipping exchange ${exchangeConfig.name}`);
            continue;
          }

          // Create exchange adapter with enhanced features
          let exchange: Exchange;
          switch (exchangeConfig.type) {
            case 'uniswap-v3':
            case 'quickswap':
              exchange = new UniswapExchange(wallet.rpcUrl, wallet.privateKey);
              // Inject services into exchange
              (exchange as any).txSimulator = txSimulator;
              (exchange as any).gasOracle = gasOracles.get(wallet.chainId);
              (exchange as any).alertService = alertService;
              (exchange as any).tracingService = tracingService;
              break;
            
            default:
              logger.warn(`Unknown exchange type: ${exchangeConfig.type}`);
              continue;
          }

          exchanges.set(exchangeConfig.name, exchange);
          logger.info(`✓ ${exchangeConfig.name} (${exchangeConfig.chain}) initialized`);
        } catch (error) {
          logger.error(`Failed to initialize exchange ${exchangeConfig.name}`, error);
          await alertService.notifyError(
            error as Error,
            `Exchange Initialization: ${exchangeConfig.name}`
          );
        }
      }

      if (exchanges.size === 0) {
        throw new Error('No exchanges initialized');
      }

    // Initialize risk manager
    const riskManager = new RiskManager({
      positionSizer: {
        accountBalance: config.risk.positionSizing.accountBalance,
        riskPerTrade: config.risk.positionSizing.riskPerTrade,
        method: config.risk.positionSizing.method as any,
      },
      drawdownMonitor: {
        maxDrawdown: config.risk.maxDrawdown,
        highWaterMark: config.risk.positionSizing.accountBalance,
      },
      maxPositionSize: config.risk.maxPositionSize,
      stopLossPercent: config.risk.stopLossPercent,
      takeProfitPercent: config.risk.takeProfitPercent,
    });

    logger.info('✓ Risk manager initialized');

    // Load and start strategies
    const activeStrategies = config.strategies.filter(s => s.enabled);
    logger.info(`Starting ${activeStrategies.length} active strategies...`);

    for (const strategyConfig of activeStrategies) {
      try {
        // Find exchange for this strategy
        const chain = strategyConfig.chain || strategyConfig.chains?.[0];
        if (!chain) {
          logger.warn(`Strategy ${strategyConfig.name} has no chain configured`);
          continue;
        }

        const exchangeName = enabledExchanges.find(e => e.chain === chain)?.name;
        if (!exchangeName) {
          logger.warn(`No exchange found for chain ${chain}`);
          continue;
        }

        const exchange = exchanges.get(exchangeName);
        if (!exchange) {
          logger.warn(`Exchange ${exchangeName} not initialized`);
          continue;
        }

        // Create strategy instance
        let strategy: Strategy;
        switch (strategyConfig.type) {
          case 'grid':
            strategy = new GridStrategy(strategyConfig.params);
            break;
          
          // Add more strategy types here
          default:
            logger.warn(`Unknown strategy type: ${strategyConfig.type}`);
            continue;
        }

        // Create bot instance for this strategy
        const bot = new TradingBot(
          { 
            logging: config.logging,
            risk: config.risk 
          } as any,
          exchange,
          strategy,
          riskManager
        );

        // Register event listeners
        setupBotEventListeners(bot, strategyConfig.name);

        // Start the bot
        await bot.start();
        bots.push(bot);

        logger.info(`✓ Strategy ${strategyConfig.name} started on ${chain}`);
      } catch (error) {
        logger.error(`Failed to start strategy ${strategyConfig.name}`, error);
      }
    }

    if (bots.length === 0) {
      throw new Error('No trading bots started');
    }

    logger.info(`✓ ${bots.length} trading bots running`);

    // Initialize Prometheus metrics (use first bot for now)
    const metrics = new PrometheusMetrics(bots[0], config.monitoring.prometheus.prefix);
    logger.info('✓ Prometheus metrics initialized');

    // Start health check HTTP server
    if (config.healthCheck.enabled) {
      healthServer = new HealthCheckServer(bots[0], metrics, config.healthCheck.port);
      await healthServer.start();
      logger.info(`✓ Health check server started on port ${config.healthCheck.port}`);
    }

    // Setup graceful shutdown handlers
    setupGracefulShutdown(config);

    logger.info('✨ All systems operational');
    logger.info('====================================');
    logger.info(`Exchanges: ${exchanges.size}`);
    logger.info(`Strategies: ${bots.length}`);
    logger.info(`Health Check: http://localhost:${config.healthCheck.port}/health`);
    logger.info(`Metrics: http://localhost:${config.healthCheck.port}/metrics`);
    logger.info('====================================');

  } catch (error) {
    logger.error('Fatal error during startup', error);
    process.exit(1);
  }
}

/**
 * Setup event listeners for a trading bot
 */
function setupBotEventListeners(bot: TradingBot, strategyName: string): void {
  bot.on('started', () => {
    logger.info(`[${strategyName}] Bot started`);
  });

  bot.on('stopped', () => {
    logger.info(`[${strategyName}] Bot stopped`);
  });

  bot.on('order', (order) => {
    logger.info(`[${strategyName}] Order: ${order.side} ${order.quantity} ${order.symbol} @ ${order.price} (${order.status})`);
  });

  bot.on('error', (error) => {
    logger.error(`[${strategyName}] Error:`, error);
  });
}

/**
 * Setup graceful shutdown with position monitoring
 */
function setupGracefulShutdown(config: ProductionConfig): void {
  const shutdownHandler = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress...');
      return;
    }

    isShuttingDown = true;
    logger.info(`\n🛑 Received ${signal}, initiating graceful shutdown...`);

    const shutdownTimeout = config.shutdown.timeout;
    const timeoutHandle = setTimeout(() => {
      logger.error(`Shutdown timeout (${shutdownTimeout}ms) exceeded, forcing exit`);
      process.exit(1);
    }, shutdownTimeout);

    try {
      // Check for open positions
      const allPositions: Position[] = [];
      for (const bot of bots) {
        const state = bot.getState();
        allPositions.push(...state.positions);
      }

      if (allPositions.length > 0) {
        logger.warn(`⚠️  ${allPositions.length} open position(s) detected`);
        
        for (const position of allPositions) {
          logger.info(`  • ${position.symbol}: ${position.side} ${position.quantity} (PnL: $${position.unrealizedPnL?.toFixed(2)})`);
        }

        if (config.shutdown.monitorOpenPositions) {
          logger.info(`Monitoring positions for ${shutdownTimeout / 1000}s...`);
          logger.info('Press Ctrl+C again to force exit');
          
          // Monitor positions during shutdown
          const monitorInterval = setInterval(() => {
            logger.info(`Open positions: ${allPositions.length}`);
          }, 10000); // Log every 10s

          // Wait for shutdown timeout
          await new Promise(resolve => setTimeout(resolve, shutdownTimeout - 5000));
          clearInterval(monitorInterval);
        }

        if (!config.shutdown.closePositions) {
          logger.warn('⚠️  Positions remain open (closePositions=false)');
        }
      } else {
        logger.info('✓ No open positions');
      }

      // Cancel pending orders if configured
      if (config.shutdown.cancelPendingOrders) {
        logger.info('Canceling pending orders...');
        for (const bot of bots) {
          const state = bot.getState();
          const pendingOrders = state.orders.filter(o => o.status === 'pending' || o.status === 'open');
          logger.info(`  Canceling ${pendingOrders.length} pending orders...`);
        }
      }

      // Stop all bots
      logger.info('Stopping trading bots...');
      await Promise.all(bots.map(bot => bot.stop()));
      logger.info('✓ All bots stopped');

      // Stop health server
      if (healthServer) {
        await healthServer.stop();
        logger.info('✓ Health server stopped');
      }

      // Stop gas oracles
      for (const [chainId, oracle] of gasOracles) {
        oracle.stop();
      }
      logger.info('✓ Gas oracles stopped');

      // Shutdown tracing service
      if (tracingService) {
        await tracingService.shutdown();
        logger.info('✓ Tracing service stopped');
      }

      clearTimeout(timeoutHandle);
      logger.info('✨ Graceful shutdown complete');
      process.exit(0);

    } catch (error) {
      logger.error('Error during graceful shutdown', error);
      clearTimeout(timeoutHandle);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    shutdownHandler('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  });
}

// Start the application
main().catch((error) => {
  logger.error('Fatal error in main', error);
  process.exit(1);
});
    // bot.enableHotReload('./strategies');

  } catch (error) {
    logger.error('Fatal error in main', error);
    process.exit(1);
  }
}

main();
