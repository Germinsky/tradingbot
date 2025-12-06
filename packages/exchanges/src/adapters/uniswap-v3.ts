import {
  Address,
  PublicClient,
  WalletClient,
  parseAbi,
  encodeFunctionData,
  TransactionRequest,
  encodeAbiParameters,
} from 'viem';
import { BaseAdapter } from './base-adapter.js';
import {
  Token,
  TokenAmount,
  Quote,
  BuildTransactionOptions,
  RouteHop,
} from '../types';
import { logger } from '../utils/logger.js';

const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) view returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
]);

const SWAP_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) payable returns (uint256 amountOut)',
]);

const POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
]);

export class UniswapV3Adapter extends BaseAdapter {
  readonly name = 'Uniswap V3';
  readonly supportedChains = [1, 56, 137, 42161, 10, 8453, 84532]; // Including Base Sepolia

  // Common V3 fee tiers
  private readonly FEE_TIERS = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    private quoterAddress: Address,
    private swapRouterAddress: Address,
    private factoryAddress: Address
  ) {
    super(publicClient, walletClient);
  }

  async getQuote(
    input: TokenAmount,
    output: Token,
    slippage: number,
    __options?: Partial<BuildTransactionOptions>
  ): Promise<Quote> {
    try {
      logger.debug('Getting Uniswap V3 quote', { input, output });

      // Try multiple fee tiers and find the best quote
      const quotes = await Promise.all(
        this.FEE_TIERS.map((fee) =>
          this.getQuoteForFeeTier(input, output, fee).catch(() => null)
        )
      );

      const validQuotes = quotes.filter((q) => q !== null);
      if (validQuotes.length === 0) {
        throw new Error('No valid quotes found for any fee tier');
      }

      // Select quote with best output amount
      const bestQuote = validQuotes.reduce((best, current) =>
        current!.outputAmount > best!.outputAmount ? current : best
      )!;

      const minimumReceived = this.calculateMinimumReceived(
        bestQuote.outputAmount,
        slippage
      );

      return {
        inputAmount: input,
        outputAmount: {
          token: output,
          amount: bestQuote.outputAmount,
        },
        minimumReceived: {
          token: output,
          amount: minimumReceived,
        },
        priceImpact: bestQuote.priceImpact,
        feeBps: bestQuote.fee / 100, // Convert fee tier to bps
        gasEstimate: bestQuote.gasEstimate,
        routes: [[bestQuote.route]],
        exchangeId: 'uniswap-v3',
        validUntil: Math.floor(Date.now() / 1000) + 1200,
        allowanceTarget: this.swapRouterAddress,
        data: { fee: bestQuote.fee },
      };
    } catch (error) {
      logger.error('Failed to get Uniswap V3 quote', error);
      throw error;
    }
  }

  async buildTransaction(
    quote: Quote,
    options: BuildTransactionOptions
  ): Promise<TransactionRequest> {
    const _deadline = BigInt(
      options.deadline || Math.floor(Date.now() / 1000) + 1200
    );
    const recipient = options.recipient || this.walletClient.account?.address;

    if (!recipient) throw new Error('No recipient address');

    const fee = quote.data?.fee || 3000; // Default to 0.3%

    const data = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn: quote.inputAmount.token.address,
          tokenOut: quote.outputAmount.token.address,
          fee,
          recipient,
          amountIn: quote.inputAmount.amount,
          amountOutMinimum: quote.minimumReceived.amount,
          sqrtPriceLimitX96: BigInt(0), // No price limit
        },
      ],
    });

    return {
      to: this.swapRouterAddress,
      data,
      value: BigInt(0),
    };
  }

  public async getAllowanceTarget(): Promise<Address> {
    return this.swapRouterAddress;
  }

  private async getQuoteForFeeTier(
    input: TokenAmount,
    output: Token,
    fee: number
  ): Promise<{
    outputAmount: bigint;
    priceImpact: number;
    gasEstimate: bigint;
    fee: number;
    route: RouteHop;
  }> {
    const result = await this.publicClient.readContract({
      address: this.quoterAddress,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          tokenIn: input.token.address,
          tokenOut: output.address,
          amountIn: input.amount,
          fee,
          sqrtPriceLimitX96: BigInt(0),
        },
      ],
    });

    const [amountOut, , , gasEstimate] = result;

    // Calculate pool address (deterministic based on tokens and fee)
    const poolAddress = await this.getPoolAddress(
      input.token.address,
      output.address,
      fee
    );

    // Calculate price impact
    const priceImpact = await this.calculateV3PriceImpact(
      poolAddress,
      input.amount,
      amountOut
    );

    const route: RouteHop = {
      protocol: 'uniswap-v3',
      poolAddress,
      tokenIn: input.token,
      tokenOut: output,
      fee,
      percentage: 100,
    };

    return {
      outputAmount: amountOut,
      priceImpact,
      gasEstimate,
      fee,
      route,
    };
  }

  private async getPoolAddress(
    tokenA: Address,
    tokenB: Address,
    _fee: number
  ): Promise<Address> {
    // Compute pool address using CREATE2
    // This is a simplified version - in production use the actual factory
    const _POOL_INIT_CODE_HASH =
      '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54';

    // Sort tokens
    const [_token0, _token1] =
      tokenA.toLowerCase() < tokenB.toLowerCase()
        ? [tokenA, tokenB]
        : [tokenB, tokenA];

    // This is a mock - implement proper CREATE2 address computation
    return '0x0000000000000000000000000000000000000000' as Address;
  }

  private async calculateV3PriceImpact(
    poolAddress: Address,
    _amountIn: bigint,
    _amountOut: bigint
  ): Promise<number> {
    try {
      const [_slot0Result, _liquidity] = await Promise.all([
        this.publicClient.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'slot0',
        }),
        this.publicClient.readContract({
          address: poolAddress,
          abi: POOL_ABI,
          functionName: 'liquidity',
        }),
      ]);

      // Simplified price impact calculation
      // In production, use proper TWAP and tick math
      return 0.1; // Placeholder
    } catch {
      return 0.5; // Default conservative estimate
    }
  }
}

export function createUniswapV3Adapter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number
): UniswapV3Adapter {
  const configs: Record<
    number,
    { quoter: Address; router: Address; factory: Address }
  > = {
    1: {
      // Ethereum
      quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    },
    8453: {
      // Base
      quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      router: '0x2626664c2603336E57B271c5C0b26F421741e481',
      factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    },
    84532: {
      // Base Sepolia
      quoter: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
      router: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
      factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    },
  };

  const config = configs[chainId];
  if (!config) throw new Error(`Unsupported chain ${chainId} for Uniswap V3`);

  return new UniswapV3Adapter(
    publicClient,
    walletClient,
    config.quoter,
    config.router,
    config.factory
  );
}
