import { watch } from 'chokidar';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Strategy, logger } from '@trading-bot/core';

export class StrategyLoader {
  private strategies: Map<string, Strategy> = new Map();
  private watchPath: string;

  constructor(watchPath: string) {
    this.watchPath = watchPath;
  }

  async loadStrategy(filePath: string): Promise<Strategy> {
    logger.info(`Loading strategy from ${filePath}`);
    
    // Dynamic import for hot-reloading
    // Note: This is a simplified version. In production, use proper module loading
    const strategyModule = await import(filePath);
    const StrategyClass = strategyModule.default || strategyModule;
    
    if (typeof StrategyClass !== 'function') {
      throw new Error(`Invalid strategy export from ${filePath}`);
    }

    const strategy = new StrategyClass();
    await strategy.initialize();
    
    this.strategies.set(filePath, strategy);
    return strategy;
  }

  async reloadStrategy(filePath: string): Promise<Strategy> {
    logger.info(`Reloading strategy from ${filePath}`);
    
    const oldStrategy = this.strategies.get(filePath);
    if (oldStrategy) {
      await oldStrategy.shutdown();
    }

    // Clear require cache for hot-reload
    delete require.cache[require.resolve(filePath)];
    
    return this.loadStrategy(filePath);
  }

  watchStrategies(onChange: (filePath: string, strategy: Strategy) => void): void {
    logger.info(`Watching strategies in ${this.watchPath}`);

    const watcher = watch(this.watchPath, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('change', async (filePath) => {
      if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        try {
          const strategy = await this.reloadStrategy(filePath);
          onChange(filePath, strategy);
        } catch (error) {
          logger.error(`Failed to reload strategy ${filePath}`, error);
        }
      }
    });
  }

  getStrategy(filePath: string): Strategy | undefined {
    return this.strategies.get(filePath);
  }

  getAllStrategies(): Strategy[] {
    return Array.from(this.strategies.values());
  }
}
