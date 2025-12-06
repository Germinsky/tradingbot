import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { TradingBot } from './bot.js';
import { logger } from '@trading-bot/core';

export class ApiServer {
  private app: Express;
  private bot: TradingBot;
  private port: number;

  constructor(bot: TradingBot, port: number = 3001) {
    this.app = express();
    this.bot = bot;
    this.port = port;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Get bot status
    this.app.get('/api/status', (req: Request, res: Response) => {
      const state = this.bot.getState();
      res.json({
        success: true,
        data: state
      });
    });

    // Start bot
    this.app.post('/api/start', async (req: Request, res: Response) => {
      try {
        await this.bot.start();
        res.json({
          success: true,
          message: 'Bot started successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start bot'
        });
      }
    });

    // Stop bot
    this.app.post('/api/stop', async (req: Request, res: Response) => {
      try {
        await this.bot.stop();
        res.json({
          success: true,
          message: 'Bot stopped successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop bot'
        });
      }
    });

    // Get positions
    this.app.get('/api/positions', (req: Request, res: Response) => {
      const state = this.bot.getState();
      res.json({
        success: true,
        data: state.positions
      });
    });

    // Get orders
    this.app.get('/api/orders', (req: Request, res: Response) => {
      const state = this.bot.getState();
      res.json({
        success: true,
        data: state.orders
      });
    });

    // Submit manual order
    this.app.post('/api/orders', async (req: Request, res: Response) => {
      try {
        const { symbol, side, quantity, price, type } = req.body;
        
        if (!symbol || !side || !quantity) {
          res.status(400).json({
            success: false,
            error: 'Missing required fields'
          });
          return;
        }

        const order = await this.bot.submitManualOrder({
          symbol,
          side,
          quantity: parseFloat(quantity),
          price: price ? parseFloat(price) : undefined,
          type: type || 'market'
        });

        res.json({
          success: true,
          data: order
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to submit order'
        });
      }
    });

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });
  }

  private setupWebSocket(): void {
    // Listen to bot events and broadcast to WebSocket clients
    this.bot.on('stateUpdate', (state) => {
      // WebSocket broadcasting will be handled by the HTTP polling for now
      // Can be upgraded to Socket.IO later
    });

    this.bot.on('order', (order) => {
      logger.info('Order event received', order);
    });

    this.bot.on('position', (position) => {
      logger.info('Position event received', position);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        logger.info(`API server listening on port ${this.port}`);
        resolve();
      });
    });
  }
}
