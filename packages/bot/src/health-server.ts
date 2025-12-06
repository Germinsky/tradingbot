import express, { Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { logger } from '@trading-bot/core';
import { PrometheusMetrics } from './metrics.js';
import { TradingBot } from './bot.js';

export class HealthCheckServer {
  private app: express.Application;
  private server?: HttpServer;
  private bot: TradingBot;
  private metrics: PrometheusMetrics;
  private port: number;
  private startTime: number;

  constructor(bot: TradingBot, metrics: PrometheusMetrics, port: number = 8080) {
    this.app = express();
    this.bot = bot;
    this.metrics = metrics;
    this.port = port;
    this.startTime = Date.now();

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      const health = {
        status: 'ok',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        timestamp: new Date().toISOString(),
        bot: {
          running: this.bot.isRunning(),
          equity: this.bot.getState().equity,
          positions: this.bot.getState().positions.length,
          orders: this.bot.getState().orders.length,
          errors: this.bot.getState().errors.length,
        },
      };

      res.json(health);
    });

    // Prometheus metrics endpoint
    this.app.get('/metrics', async (req: Request, res: Response) => {
      try {
        const metrics = await this.metrics.getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        logger.error('Failed to generate metrics', error);
        res.status(500).send('Failed to generate metrics');
      }
    });

    // Readiness probe (for Kubernetes)
    this.app.get('/ready', (req: Request, res: Response) => {
      if (this.bot.isRunning()) {
        res.status(200).json({ ready: true });
      } else {
        res.status(503).json({ ready: false, reason: 'Bot not running' });
      }
    });

    // Liveness probe (for Kubernetes)
    this.app.get('/live', (req: Request, res: Response) => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const errors = this.bot.getState().errors;
      
      // Consider unhealthy if too many recent errors
      const recentErrors = errors.slice(-10);
      if (recentErrors.length >= 10) {
        res.status(500).json({
          alive: false,
          reason: 'Too many errors',
          uptime,
        });
        return;
      }

      res.json({
        alive: true,
        uptime,
      });
    });

    // Status endpoint with detailed info
    this.app.get('/status', (req: Request, res: Response) => {
      const state = this.bot.getState();
      
      res.json({
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        running: state.running,
        equity: state.equity,
        positions: state.positions.map(p => ({
          symbol: p.symbol,
          side: p.side,
          quantity: p.quantity,
          entryPrice: p.entryPrice,
          currentPrice: p.currentPrice,
          pnl: p.unrealizedPnL,
        })),
        orders: state.orders.map(o => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          quantity: o.quantity,
          price: o.price,
          status: o.status,
        })),
        errors: state.errors.slice(-5),
      });
    });

    // Shutdown endpoint (protected - should be authenticated in production)
    this.app.post('/shutdown', async (req: Request, res: Response) => {
      logger.info('Shutdown requested via API');
      res.json({ status: 'shutting down' });
      
      // Trigger graceful shutdown
      process.kill(process.pid, 'SIGTERM');
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.app);
        
        this.server.listen(this.port, () => {
          logger.info(`Health check server listening on port ${this.port}`);
          logger.info(`  Health:    http://localhost:${this.port}/health`);
          logger.info(`  Metrics:   http://localhost:${this.port}/metrics`);
          logger.info(`  Readiness: http://localhost:${this.port}/ready`);
          logger.info(`  Liveness:  http://localhost:${this.port}/live`);
          
          // Signal PM2 that we're ready
          if (process.send) {
            process.send('ready');
          }
          
          resolve();
        });

        this.server.on('error', (error) => {
          logger.error('Health check server error', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start health check server', error);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('Health check server stopped');
          resolve();
        });
      });
    }
  }
}
