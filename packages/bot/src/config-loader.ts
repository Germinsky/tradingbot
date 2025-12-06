import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { logger } from '@trading-bot/core';

export interface WalletConfig {
  privateKey: string;
  rpcUrl: string;
  chainId: number;
}

export interface ExchangeConfig {
  name: string;
  type: string;
  chain: string;
  enabled: boolean;
  contractAddress: string;
}

export interface StrategyConfig {
  name: string;
  type: string;
  enabled: boolean;
  chain?: string;
  chains?: string[];
  symbol: string;
  params: Record<string, any>;
}

export interface ProductionConfig {
  wallets: Record<string, WalletConfig>;
  encryption: {
    provider: 'aws-kms' | 'vault' | 'local';
    awsKms?: {
      region: string;
      keyId: string;
    };
    vault?: {
      address: string;
      token: string;
      namespace?: string;
    };
  };
  exchanges: ExchangeConfig[];
  strategies: StrategyConfig[];
  risk: {
    maxPositionSize: number;
    maxDrawdown: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    maxDailyLoss: number;
    positionSizing: {
      method: string;
      accountBalance: number;
      riskPerTrade: number;
    };
  };
  healthCheck: {
    enabled: boolean;
    port: number;
    endpoints: {
      health: string;
      metrics: string;
      readiness: string;
      liveness: string;
    };
  };
  monitoring: {
    prometheus: {
      enabled: boolean;
      prefix: string;
    };
    metrics: Array<{
      name: string;
      type: string;
      labels?: string[];
      buckets?: number[];
    }>;
  };
  shutdown: {
    timeout: number;
    closePositions: boolean;
    cancelPendingOrders: boolean;
    monitorOpenPositions: boolean;
  };
  logging: {
    level: string;
    format: string;
    outputs: Array<any>;
  };
}

export class ProductionConfigLoader {
  static load(configPath: string): ProductionConfig {
    try {
      logger.info(`Loading configuration from ${configPath}`);
      
      const fileContent = readFileSync(configPath, 'utf-8');
      
      // Replace environment variables
      const processedContent = this.replaceEnvVars(fileContent);
      
      const config = load(processedContent) as ProductionConfig;
      
      // Validate configuration
      this.validate(config);
      
      logger.info('Configuration loaded successfully');
      return config;
    } catch (error) {
      logger.error('Failed to load configuration', error);
      throw error;
    }
  }

  private static replaceEnvVars(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      const value = process.env[varName];
      if (value === undefined) {
        logger.warn(`Environment variable ${varName} is not set`);
        return '';
      }
      return value;
    });
  }

  private static validate(config: ProductionConfig): void {
    if (!config.wallets || Object.keys(config.wallets).length === 0) {
      throw new Error('No wallets configured');
    }

    if (!config.exchanges || config.exchanges.length === 0) {
      throw new Error('No exchanges configured');
    }

    if (!config.strategies || config.strategies.length === 0) {
      throw new Error('No strategies configured');
    }

    const activeStrategies = config.strategies.filter(s => s.enabled);
    if (activeStrategies.length === 0) {
      logger.warn('No active strategies found');
    }

    logger.info(`Configuration validated: ${Object.keys(config.wallets).length} wallets, ${config.exchanges.length} exchanges, ${activeStrategies.length} active strategies`);
  }
}
