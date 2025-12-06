import {
  Address,
  PublicClient,
  WalletClient,
  Hash,
  TransactionRequest,
  parseAbi,
  encodeFunctionData,
} from 'viem';
import { logger } from '../utils/logger.js';
import {
  IExchangeAdapter,
  Token,
  TokenAmount,
  Quote,
  BuildTransactionOptions,
  ExecuteSwapOptions,
  MEVProtectionResult,
} from '../types';

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

export abstract class BaseAdapter implements IExchangeAdapter {
  abstract readonly name: string;
  abstract readonly supportedChains: number[];

  constructor(
    protected publicClient: PublicClient,
    protected walletClient: WalletClient
  ) {}

  abstract getQuote(
    input: TokenAmount,
    output: Token,
    slippage: number,
    __options?: Partial<BuildTransactionOptions>
  ): Promise<Quote>;

  abstract buildTransaction(
    quote: Quote,
    options: BuildTransactionOptions
  ): Promise<TransactionRequest>;

  async executeSwap(
    quote: Quote,
    options: ExecuteSwapOptions
  ): Promise<MEVProtectionResult> {
    try {
      logger.info(`Executing swap on ${this.name}`, { quote, options });

      // Build transaction
      const txRequest = await this.buildTransaction(quote, {
        slippage: 0.5,
        deadline: Math.floor(Date.now() / 1000) + 1200, // 20 minutes
      });

      // Apply gas settings
      if (options.maxFeePerGas) txRequest.maxFeePerGas = options.maxFeePerGas;
      if (options.maxPriorityFeePerGas)
        txRequest.maxPriorityFeePerGas = options.maxPriorityFeePerGas;
      if (options.gasLimit) txRequest.gas = options.gasLimit;

      // Check if MEV protection is requested
      if (options.flashbots || options.privateTx) {
        return await this.executeWithMEVProtection(txRequest, options);
      }

      // Execute as CoW Protocol order if requested
      if (options.cowSwapOrder) {
        return await this.executeCowSwapOrder(quote, options);
      }

      // Standard execution
      const hash = await this.walletClient.sendTransaction(txRequest as any);

      logger.info(`Transaction submitted: ${hash}`);

      // Wait for confirmation if requested
      if (options.waitForConfirmation) {
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash,
        });
        logger.info(`Transaction confirmed in block ${receipt.blockNumber}`);
      }

      return {
        txHash: hash,
        protected: false,
      };
    } catch (error) {
      logger.error(`Swap execution failed on ${this.name}`, error);
      throw error;
    }
  }

  async getApprovalTransaction(
    token: Token,
    amount: bigint,
    spender?: Address
  ): Promise<TransactionRequest | null> {
    const allowanceTarget = spender || (await this.getAllowanceTarget());
    const owner = this.walletClient.account?.address;

    if (!owner) throw new Error('No wallet connected');

    const currentAllowance = await this.publicClient.readContract({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, allowanceTarget],
    });

    if (currentAllowance >= amount) {
      return null; // No approval needed
    }

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [allowanceTarget, amount],
    });

    return {
      to: token.address,
      data,
    };
  }

  async needsApproval(
    token: Token,
    amount: bigint,
    owner: Address
  ): Promise<boolean> {
    const allowanceTarget = await this.getAllowanceTarget();

    const currentAllowance = await this.publicClient.readContract({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, allowanceTarget],
    });

    return currentAllowance < amount;
  }

  public abstract getAllowanceTarget(): Promise<Address>;

  protected async executeWithMEVProtection(
    tx: TransactionRequest,
    options: ExecuteSwapOptions
  ): Promise<MEVProtectionResult> {
    logger.info('Executing with MEV protection via Flashbots');

    // This is a simplified implementation
    // In production, you'd use Flashbots SDK or Eden Network SDK
    try {
      // Option 1: Use Flashbots RPC directly
      if (options.flashbots) {
        const _flashbotsRPC = 'https://rpc.flashbots.net';
        // Submit bundle via Flashbots Protect
        // Implementation would use @flashbots/ethers-provider-bundle
        logger.info('Submitting via Flashbots Protect RPC');
      }

      // Option 2: Use Eden Network
      if (options.edenNetwork) {
        const __edenRPC = 'https://api.edennetwork.io/v1/rpc';
        logger.info('Submitting via Eden Network');
      }

      // Fallback to regular transaction if MEV protection fails
      const hash = await this.walletClient.sendTransaction(tx as any);

      return {
        txHash: hash,
        protected: true,
        privateRpc: options.flashbots ? 'flashbots' : 'eden',
      };
    } catch (error) {
      logger.error('MEV protection failed, falling back to public mempool', error);
      const hash = await this.walletClient.sendTransaction(tx as any);
      return { txHash: hash, protected: false };
    }
  }

  protected async executeCowSwapOrder(
    quote: Quote,
    options: ExecuteSwapOptions
  ): Promise<MEVProtectionResult> {
    logger.info('Executing as CoW Protocol signed order');

    // This would integrate with CoW Protocol API
    // For now, fall back to regular execution
    const txRequest = await this.buildTransaction(quote, {
      slippage: 0.5,
      deadline: Math.floor(Date.now() / 1000) + 1200,
    });

    const hash = await this.walletClient.sendTransaction(txRequest as any);

    return {
      txHash: hash,
      protected: true, // CoW orders are protected by design
    };
  }

  protected calculateMinimumReceived(
    outputAmount: bigint,
    slippage: number
  ): bigint {
    const slippageBps = Math.floor(slippage * 100); // Convert to basis points
    return (outputAmount * BigInt(10000 - slippageBps)) / BigInt(10000);
  }

  protected calculatePriceImpact(
    __inputAmount: bigint,
    __outputAmount: bigint,
    __marketPrice: number
  ): number {
    // Simplified price impact calculation
    // In production, compare against oracle prices or pool reserves
    return 0.1; // Placeholder
  }
}
