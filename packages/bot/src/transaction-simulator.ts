/**
 * Transaction Simulation Service
 * Simulates transactions on Etherscan and Blockscout before broadcast
 */

import { logger } from '@trading-bot/core';
import axios from 'axios';

export interface SimulationResult {
  success: boolean;
  gasUsed?: bigint;
  error?: string;
  revertReason?: string;
  stateChanges?: StateChange[];
}

export interface StateChange {
  address: string;
  before: string;
  after: string;
  slot: string;
}

export interface SimulationConfig {
  etherscanApiKey?: string;
  blockscoutUrl?: string;
  timeout?: number;
}

export class TransactionSimulator {
  private etherscanApiKey?: string;
  private blockscoutUrl?: string;
  private timeout: number;

  constructor(config: SimulationConfig) {
    this.etherscanApiKey = config.etherscanApiKey || process.env.ETHERSCAN_API_KEY;
    this.blockscoutUrl = config.blockscoutUrl || process.env.BLOCKSCOUT_URL;
    this.timeout = config.timeout || 10000;
  }

  /**
   * Simulate transaction on both Etherscan and Blockscout
   */
  async simulate(
    chainId: number,
    from: string,
    to: string,
    data: string,
    value: string = '0x0'
  ): Promise<SimulationResult> {
    const results = await Promise.allSettled([
      this.simulateEtherscan(chainId, from, to, data, value),
      this.simulateBlockscout(chainId, from, to, data, value)
    ]);

    // If at least one succeeds, use that result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        return result.value;
      }
    }

    // If both fail, return the first error
    const firstError = results.find(r => r.status === 'fulfilled');
    if (firstError && firstError.status === 'fulfilled') {
      return firstError.value;
    }

    return {
      success: false,
      error: 'All simulation endpoints failed'
    };
  }

  /**
   * Simulate on Etherscan using eth_call
   */
  private async simulateEtherscan(
    chainId: number,
    from: string,
    to: string,
    data: string,
    value: string
  ): Promise<SimulationResult> {
    if (!this.etherscanApiKey) {
      return { success: false, error: 'Etherscan API key not configured' };
    }

    try {
      const endpoint = this.getEtherscanEndpoint(chainId);
      const response = await axios.get(endpoint, {
        params: {
          module: 'proxy',
          action: 'eth_call',
          to,
          data,
          tag: 'latest',
          apikey: this.etherscanApiKey
        },
        timeout: this.timeout
      });

      if (response.data.error) {
        return {
          success: false,
          error: response.data.error.message,
          revertReason: this.extractRevertReason(response.data.error.message)
        };
      }

      logger.debug(`Etherscan simulation successful for chain ${chainId}`);
      return {
        success: true,
        gasUsed: BigInt(response.data.result || '0')
      };
    } catch (error) {
      logger.warn(`Etherscan simulation failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Simulate on Blockscout using eth_call
   */
  private async simulateBlockscout(
    chainId: number,
    from: string,
    to: string,
    data: string,
    value: string
  ): Promise<SimulationResult> {
    if (!this.blockscoutUrl) {
      return { success: false, error: 'Blockscout URL not configured' };
    }

    try {
      const endpoint = this.getBlockscoutEndpoint(chainId);
      const response = await axios.post(
        `${endpoint}/api/eth-rpc`,
        {
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            { from, to, data, value },
            'latest'
          ],
          id: 1
        },
        { timeout: this.timeout }
      );

      if (response.data.error) {
        return {
          success: false,
          error: response.data.error.message,
          revertReason: this.extractRevertReason(response.data.error.message)
        };
      }

      logger.debug(`Blockscout simulation successful for chain ${chainId}`);
      return {
        success: true,
        gasUsed: BigInt(response.data.result?.gas || '0')
      };
    } catch (error) {
      logger.warn(`Blockscout simulation failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get Etherscan endpoint for chain
   */
  private getEtherscanEndpoint(chainId: number): string {
    const endpoints: Record<number, string> = {
      1: 'https://api.etherscan.io/api',
      42161: 'https://api.arbiscan.io/api',
      8453: 'https://api.basescan.org/api',
      10: 'https://api-optimistic.etherscan.io/api',
      137: 'https://api.polygonscan.com/api',
      11155111: 'https://api-sepolia.etherscan.io/api'
    };
    return endpoints[chainId] || endpoints[1];
  }

  /**
   * Get Blockscout endpoint for chain
   */
  private getBlockscoutEndpoint(chainId: number): string {
    const endpoints: Record<number, string> = {
      1: 'https://eth.blockscout.com',
      42161: 'https://arbitrum.blockscout.com',
      8453: 'https://base.blockscout.com',
      10: 'https://optimism.blockscout.com',
      137: 'https://polygon.blockscout.com'
    };
    return endpoints[chainId] || this.blockscoutUrl || '';
  }

  /**
   * Extract revert reason from error message
   */
  private extractRevertReason(message: string): string | undefined {
    const match = message.match(/revert(?:ed)?\s+(.+?)(?:\s|$)/i);
    return match ? match[1] : undefined;
  }

  /**
   * Estimate gas with simulation
   */
  async estimateGas(
    chainId: number,
    from: string,
    to: string,
    data: string,
    value: string = '0x0'
  ): Promise<bigint> {
    const result = await this.simulate(chainId, from, to, data, value);
    
    if (!result.success) {
      throw new Error(`Gas estimation failed: ${result.error}`);
    }

    // Add 20% buffer to simulated gas
    const gasUsed = result.gasUsed || BigInt(21000);
    return (gasUsed * BigInt(120)) / BigInt(100);
  }
}
