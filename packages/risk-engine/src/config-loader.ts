import * as yaml from 'js-yaml';
import * as fs from 'fs';
import { RiskEngineConfigSchema, RiskEngineConfig } from './config.schema.js';
import { logger } from '@trading-bot/core';

/**
 * Load and validate risk engine configuration from YAML file
 */
export function loadRiskConfig(configPath: string): RiskEngineConfig {
  try {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const rawConfig = yaml.load(fileContents);

    // Validate with Zod schema
    const config = RiskEngineConfigSchema.parse(rawConfig);

    logger.info('Risk engine configuration loaded successfully', {
      path: configPath,
    });

    return config;
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Failed to load risk engine configuration', {
        path: configPath,
        error: error.message,
      });
      throw new Error(`Failed to load risk config from ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Load configuration from object (for programmatic usage)
 */
export function loadRiskConfigFromObject(config: unknown): RiskEngineConfig {
  try {
    const validated = RiskEngineConfigSchema.parse(config);
    logger.info('Risk engine configuration validated from object');
    return validated;
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Failed to validate risk engine configuration', {
        error: error.message,
      });
      throw new Error(`Invalid risk engine configuration: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get default configuration
 */
export function getDefaultRiskConfig(): RiskEngineConfig {
  return RiskEngineConfigSchema.parse({});
}

/**
 * Save configuration to YAML file
 */
export function saveRiskConfig(config: RiskEngineConfig, outputPath: string): void {
  try {
    const yamlStr = yaml.dump(config, {
      indent: 2,
      lineWidth: 100,
    });

    fs.writeFileSync(outputPath, yamlStr, 'utf8');

    logger.info('Risk engine configuration saved', {
      path: outputPath,
    });
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Failed to save risk engine configuration', {
        path: outputPath,
        error: error.message,
      });
      throw new Error(`Failed to save risk config to ${outputPath}: ${error.message}`);
    }
    throw error;
  }
}
