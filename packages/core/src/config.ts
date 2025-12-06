import { readFileSync } from 'fs';
import { Config, ConfigSchema } from './types';

export class ConfigLoader {
  static loadFromFile(filePath: string): Config {
    const fileContent = readFileSync(filePath, 'utf-8');
    const rawConfig = JSON.parse(fileContent);
    return ConfigSchema.parse(rawConfig);
  }

  static loadFromEnv(): Partial<Config> {
    return {
      exchange: {
        name: process.env.EXCHANGE_NAME || '',
        apiKey: process.env.EXCHANGE_API_KEY,
        apiSecret: process.env.EXCHANGE_API_SECRET,
        rpcUrl: process.env.RPC_URL,
      },
      strategy: {
        name: process.env.STRATEGY_NAME || '',
        params: process.env.STRATEGY_PARAMS ? JSON.parse(process.env.STRATEGY_PARAMS) : {},
      },
      risk: {
        maxPositionSize: Number(process.env.MAX_POSITION_SIZE || 1000),
        maxDrawdown: Number(process.env.MAX_DRAWDOWN || 0.1),
        stopLossPercent: Number(process.env.STOP_LOSS_PERCENT || 0.02),
        takeProfitPercent: Number(process.env.TAKE_PROFIT_PERCENT || 0.05),
      },
      logging: {
        level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
        outputFile: process.env.LOG_FILE,
      },
    };
  }

  static merge(base: Partial<Config>, override: Partial<Config>): Config {
    const merged = {
      exchange: { ...base.exchange, ...override.exchange },
      strategy: { ...base.strategy, ...override.strategy },
      risk: { ...base.risk, ...override.risk },
      logging: { ...base.logging, ...override.logging },
    };
    return ConfigSchema.parse(merged);
  }
}
