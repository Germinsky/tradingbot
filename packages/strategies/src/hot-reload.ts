import { watch, FSWatcher } from 'chokidar';
import { logger } from '@trading-bot/core';
import { pathToFileURL } from 'url';
import { HotReloadConfig, ITradingStrategy, StrategyConfig } from './types.js';

/**
 * Hot-reload manager for trading strategies
 * 
 * Watches strategy files and reloads them on changes without stopping the system.
 * Uses dynamic import() to load updated strategy code.
 */
export class StrategyHotReloader {
  private watcher: FSWatcher | null = null;
  private config: HotReloadConfig;
  private reloadTimer: NodeJS.Timeout | null = null;
  private loadedModules: Map<string, { timestamp: number; url: string }> = new Map();
  
  constructor(config: HotReloadConfig) {
    this.config = config;
  }
  
  /**
   * Start watching strategy files for changes
   */
  async start(
    strategyPath: string,
    onReload: (newStrategy: ITradingStrategy) => Promise<void>
  ): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Hot-reload is disabled');
      return;
    }
    
    logger.info(`Starting hot-reload watcher for: ${strategyPath}`);
    
    this.watcher = watch(this.config.watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.config.debounceMs,
        pollInterval: 100,
      },
    });
    
    this.watcher.on('change', async (changedPath) => {
      logger.info(`Detected change in: ${changedPath}`);
      
      // Debounce rapid changes
      if (this.reloadTimer) {
        clearTimeout(this.reloadTimer);
      }
      
      this.reloadTimer = setTimeout(async () => {
        try {
          await this.reloadStrategy(strategyPath, onReload);
        } catch (error) {
          logger.error('Failed to reload strategy:', error);
        }
      }, this.config.debounceMs);
    });
    
    this.watcher.on('error', (error) => {
      logger.error('Hot-reload watcher error:', error);
    });
  }
  
  /**
   * Stop watching for changes
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info('Hot-reload watcher stopped');
    }
    
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }
  
  /**
   * Reload a strategy module
   */
  private async reloadStrategy(
    strategyPath: string,
    onReload: (newStrategy: ITradingStrategy) => Promise<void>
  ): Promise<void> {
    logger.info(`Reloading strategy from: ${strategyPath}`);
    
    try {
      // Create a new URL with timestamp to bypass cache
      const timestamp = Date.now();
      const moduleUrl = `${pathToFileURL(strategyPath).href}?t=${timestamp}`;
      
      // Dynamic import with cache-busting
      const module = await import(moduleUrl);
      
      // Store loaded module info
      this.loadedModules.set(strategyPath, { timestamp, url: moduleUrl });
      
      // Validate the module exports a strategy
      if (!module.default && !module.Strategy) {
        throw new Error('Strategy module must export a default or Strategy class');
      }
      
      const StrategyClass = module.default || module.Strategy;
      
      // The strategy will be instantiated by the caller
      logger.info(`Successfully reloaded strategy: ${StrategyClass.name}`);
      
      // Notify caller to handle strategy swap
      // Note: The actual instantiation and state transfer is handled by the caller
      if (typeof onReload === 'function') {
        await onReload(StrategyClass);
      }
      
    } catch (error) {
      logger.error(`Failed to reload strategy from ${strategyPath}:`, error);
      throw error;
    }
  }
  
  /**
   * Load a strategy dynamically
   */
  static async loadStrategy(
    strategyPath: string,
    config: StrategyConfig
  ): Promise<ITradingStrategy> {
    try {
      // Use dynamic import
      const timestamp = Date.now();
      const moduleUrl = `${pathToFileURL(strategyPath).href}?t=${timestamp}`;
      
      logger.info(`Loading strategy from: ${moduleUrl}`);
      
      const module = await import(moduleUrl);
      
      if (!module.default && !module.Strategy) {
        throw new Error('Strategy module must export a default or Strategy class');
      }
      
      const StrategyClass = module.default || module.Strategy;
      const strategy = new StrategyClass(config);
      
      logger.info(`Loaded strategy: ${strategy.name} v${strategy.version}`);
      
      return strategy;
    } catch (error) {
      logger.error(`Failed to load strategy from ${strategyPath}:`, error);
      throw error;
    }
  }
  
  /**
   * Get info about loaded modules
   */
  getLoadedModules(): Map<string, { timestamp: number; url: string }> {
    return new Map(this.loadedModules);
  }
}

/**
 * Strategy loader with hot-reload support
 */
export class StrategyLoader {
  private hotReloader: StrategyHotReloader | null = null;
  private currentStrategy: ITradingStrategy | null = null;
  private strategyConfig: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.strategyConfig = config;
    
    if (config.enableHotReload) {
      const hotReloadConfig: HotReloadConfig = {
        enabled: true,
        watchPaths: ['./dist/**/*.js'], // Watch compiled JS files
        debounceMs: 500,
      };
      
      this.hotReloader = new StrategyHotReloader(hotReloadConfig);
    }
  }
  
  /**
   * Load and initialize a strategy
   */
  async loadStrategy(strategyPath: string): Promise<ITradingStrategy> {
    // Load the strategy
    this.currentStrategy = await StrategyHotReloader.loadStrategy(
      strategyPath,
      this.strategyConfig
    );
    
    // Initialize it
    await this.currentStrategy.initialize();
    
    // Start hot-reload watching if enabled
    if (this.hotReloader) {
      await this.hotReloader.start(strategyPath, async (NewStrategyClass: any) => {
        await this.handleStrategyReload(NewStrategyClass);
      });
    }
    
    return this.currentStrategy;
  }
  
  /**
   * Handle strategy reload
   */
  private async handleStrategyReload(NewStrategyClass: any): Promise<void> {
    if (!this.currentStrategy) return;
    
    logger.info('Performing hot-reload of strategy...');
    
    try {
      // Preserve current state
      const currentStats = this.currentStrategy.getStats();
      const listeners = this.currentStrategy.eventNames();
      const listenerCallbacks = new Map();
      
      listeners.forEach((event) => {
        listenerCallbacks.set(event, this.currentStrategy!.listeners(event));
      });
      
      // Shutdown old strategy
      await this.currentStrategy.shutdown();
      
      // Create new strategy instance
      const newStrategy = new NewStrategyClass(this.strategyConfig);
      
      // Restore event listeners
      listenerCallbacks.forEach((callbacks, event) => {
        callbacks.forEach((callback: any) => {
          newStrategy.on(event, callback);
        });
      });
      
      // Initialize new strategy
      await newStrategy.initialize();
      
      // Swap strategies
      this.currentStrategy = newStrategy;
      
      logger.info('Hot-reload completed successfully', {
        preservedStats: currentStats,
        restoredListeners: listeners,
      });
      
    } catch (error) {
      logger.error('Failed to complete hot-reload:', error);
      throw error;
    }
  }
  
  /**
   * Stop the strategy and hot-reload watcher
   */
  async stop(): Promise<void> {
    if (this.hotReloader) {
      await this.hotReloader.stop();
    }
    
    if (this.currentStrategy) {
      await this.currentStrategy.shutdown();
      this.currentStrategy = null;
    }
  }
  
  /**
   * Get the current strategy instance
   */
  getCurrentStrategy(): ITradingStrategy | null {
    return this.currentStrategy;
  }
}
