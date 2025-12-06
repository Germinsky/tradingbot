/**
 * Gas Price Oracle Service
 * Provides real-time gas price estimates from Blocknative and EigenPhi
 */

import { logger } from '@trading-bot/core';
import axios from 'axios';

export interface GasPrices {
  rapid: bigint;      // ~15 seconds
  fast: bigint;       // ~1 minute
  standard: bigint;   // ~5 minutes
  slow: bigint;       // ~10 minutes
  baseFee?: bigint;
  priorityFee?: bigint;
  timestamp: number;
}

export interface GasOracleConfig {
  blocknativeApiKey?: string;
  eigenphiApiKey?: string;
  updateInterval?: number;
  chainId: number;
}

export class GasOracle {
  private blocknativeApiKey?: string;
  private eigenphiApiKey?: string;
  private updateInterval: number;
  private chainId: number;
  private cachedPrices: Map<number, GasPrices> = new Map();
  private updateTimer?: NodeJS.Timeout;

  constructor(config: GasOracleConfig) {
    this.blocknativeApiKey = config.blocknativeApiKey || process.env.BLOCKNATIVE_API_KEY;
    this.eigenphiApiKey = config.eigenphiApiKey || process.env.EIGENPHI_API_KEY;
    this.updateInterval = config.updateInterval || 15000; // 15 seconds
    this.chainId = config.chainId;
  }

  /**
   * Start automatic gas price updates
   */
  start(): void {
    logger.info(`Starting gas oracle for chain ${this.chainId}`);
    this.updatePrices(); // Initial fetch
    this.updateTimer = setInterval(() => this.updatePrices(), this.updateInterval);
  }

  /**
   * Stop automatic updates
   */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
      logger.info(`Stopped gas oracle for chain ${this.chainId}`);
    }
  }

  /**
   * Get current gas prices
   */
  async getGasPrices(): Promise<GasPrices> {
    const cached = this.cachedPrices.get(this.chainId);
    
    // Return cached if less than 30 seconds old
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached;
    }

    // Fetch fresh prices
    await this.updatePrices();
    return this.cachedPrices.get(this.chainId) || this.getDefaultPrices();
  }

  /**
   * Update gas prices from oracles
   */
  private async updatePrices(): Promise<void> {
    try {
      const prices = await Promise.race([
        this.fetchFromBlocknative(),
        this.fetchFromEigenPhi(),
        this.fetchFromEtherscan()
      ]);

      if (prices) {
        this.cachedPrices.set(this.chainId, prices);
        logger.debug(`Updated gas prices for chain ${this.chainId}:`, {
          rapid: prices.rapid.toString(),
          fast: prices.fast.toString(),
          standard: prices.standard.toString()
        });
      }
    } catch (error) {
      logger.warn(`Failed to update gas prices: ${error}`);
    }
  }

  /**
   * Fetch from Blocknative Gas Platform
   */
  private async fetchFromBlocknative(): Promise<GasPrices | null> {
    if (!this.blocknativeApiKey) {
      return null;
    }

    try {
      const response = await axios.get(
        `https://api.blocknative.com/gasprices/blockprices`,
        {
          headers: {
            'Authorization': this.blocknativeApiKey
          },
          params: {
            chainid: this.chainId
          },
          timeout: 5000
        }
      );

      const data = response.data.blockPrices[0];
      const estimatedPrices = data.estimatedPrices;

      return {
        rapid: BigInt(Math.ceil(estimatedPrices[0].maxFeePerGas * 1e9)),
        fast: BigInt(Math.ceil(estimatedPrices[1].maxFeePerGas * 1e9)),
        standard: BigInt(Math.ceil(estimatedPrices[2].maxFeePerGas * 1e9)),
        slow: BigInt(Math.ceil(estimatedPrices[3].maxFeePerGas * 1e9)),
        baseFee: BigInt(Math.ceil(data.baseFeePerGas * 1e9)),
        priorityFee: BigInt(Math.ceil(estimatedPrices[1].maxPriorityFeePerGas * 1e9)),
        timestamp: Date.now()
      };
    } catch (error) {
      logger.debug(`Blocknative fetch failed: ${error}`);
      return null;
    }
  }

  /**
   * Fetch from EigenPhi
   */
  private async fetchFromEigenPhi(): Promise<GasPrices | null> {
    if (!this.eigenphiApiKey) {
      return null;
    }

    try {
      const response = await axios.get(
        `https://api.eigenphi.io/api/v1/gas_price`,
        {
          headers: {
            'X-API-KEY': this.eigenphiApiKey
          },
          params: {
            chain_id: this.chainId
          },
          timeout: 5000
        }
      );

      const data = response.data.data;

      return {
        rapid: BigInt(data.rapid),
        fast: BigInt(data.fast),
        standard: BigInt(data.standard),
        slow: BigInt(data.slow),
        timestamp: Date.now()
      };
    } catch (error) {
      logger.debug(`EigenPhi fetch failed: ${error}`);
      return null;
    }
  }

  /**
   * Fallback: Fetch from Etherscan
   */
  private async fetchFromEtherscan(): Promise<GasPrices | null> {
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return null;
    }

    try {
      const endpoint = this.getEtherscanEndpoint();
      const response = await axios.get(`${endpoint}/api`, {
        params: {
          module: 'gastracker',
          action: 'gasoracle',
          apikey: apiKey
        },
        timeout: 5000
      });

      const data = response.data.result;

      return {
        rapid: BigInt(data.FastGasPrice) * BigInt(1e9),
        fast: BigInt(data.ProposeGasPrice) * BigInt(1e9),
        standard: BigInt(data.SafeGasPrice) * BigInt(1e9),
        slow: BigInt(data.SafeGasPrice) * BigInt(8e8), // 80% of safe
        timestamp: Date.now()
      };
    } catch (error) {
      logger.debug(`Etherscan fetch failed: ${error}`);
      return null;
    }
  }

  /**
   * Get Etherscan endpoint for chain
   */
  private getEtherscanEndpoint(): string {
    const endpoints: Record<number, string> = {
      1: 'https://api.etherscan.io',
      42161: 'https://api.arbiscan.io',
      8453: 'https://api.basescan.org',
      10: 'https://api-optimistic.etherscan.io',
      137: 'https://api.polygonscan.com'
    };
    return endpoints[this.chainId] || endpoints[1];
  }

  /**
   * Get default prices if oracles fail
   */
  private getDefaultPrices(): GasPrices {
    // Fallback to reasonable defaults (in wei)
    const basePrice = this.chainId === 1 ? BigInt(30e9) : BigInt(1e9);
    
    return {
      rapid: basePrice * BigInt(2),
      fast: basePrice * BigInt(15) / BigInt(10),
      standard: basePrice,
      slow: basePrice * BigInt(8) / BigInt(10),
      timestamp: Date.now()
    };
  }

  /**
   * Estimate transaction cost
   */
  async estimateCost(gasLimit: bigint, speed: 'rapid' | 'fast' | 'standard' | 'slow' = 'fast'): Promise<bigint> {
    const prices = await this.getGasPrices();
    return gasLimit * prices[speed];
  }
}
