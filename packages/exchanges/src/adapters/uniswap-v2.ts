import {
  Address,
  PublicClient,
  WalletClient,
  parseAbi,
  encodeFunctionData,
  TransactionRequest,
} from 'viem';
import { BaseAdapter } from './base-adapter';
import {
  Token,
  TokenAmount,
  Quote,
  BuildTransactionOptions,
  RouteHop,
} from '../types';
import { logger } from '../utils/logger';

const UNISWAP_V2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[])',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])',
]);

const UNISWAP_V2_FACTORY_ABI = parseAbi([
  'function getPair(address tokenA, address tokenB) view returns (address)',
]);

const UNISWAP_V2_PAIR_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]);

export class UniswapV2Adapter extends BaseAdapter {
  readonly name: string;
  readonly supportedChains = [1, 56, 137, 42161, 10, 8453]; // ETH, BSC, Polygon, Arbitrum, Optimism, Base

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    private routerAddress: Address,
    private factoryAddress: Address,
    name: string = 'Uniswap V2'
  ) {
    super(publicClient, walletClient);
    this.name = name;
  }

  async getQuote(
    input: TokenAmount,
    output: Token,
    slippage: number,
    __options?: Partial<BuildTransactionOptions>
  ): Promise<Quote> {
    try {
      logger.debug(`Getting ${this.name} quote`, { input, output });

      const path = [input.token.address, output.address];

      // Get amounts out from router
      const amounts = await this.publicClient.readContract({
        address: this.routerAddress,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [input.amount, path],
      });

      const outputAmount = amounts[amounts.length - 1];

      // Get pool address for route info
      const pairAddress = await this.publicClient.readContract({
        address: this.factoryAddress,
        abi: UNISWAP_V2_FACTORY_ABI,
        functionName: 'getPair',
        args: [input.token.address, output.address],
      });

      // Calculate price impact
      const reserves = await this.getReserves(pairAddress);
      const priceImpact = this.calculateV2PriceImpact(
        input.amount,
        outputAmount,
        reserves
      );

      // Estimate gas
      const gasEstimate = BigInt(150000); // Standard V2 swap gas

      const minimumReceived = this.calculateMinimumReceived(outputAmount, slippage);

      const route: RouteHop[] = [
        {
          protocol: this.name.toLowerCase().replace(/\s/g, '-'),
          poolAddress: pairAddress,
          tokenIn: input.token,
          tokenOut: output,
          percentage: 100,
        },
      ];

      return {
        inputAmount: input,
        outputAmount: {
          token: output,
          amount: outputAmount,
        },
        minimumReceived: {
          token: output,
          amount: minimumReceived,
        },
        priceImpact,
        feeBps: 30, // 0.3% for V2
        gasEstimate,
        routes: [route],
        exchangeId: this.name.toLowerCase().replace(/\s/g, '-'),
        validUntil: Math.floor(Date.now() / 1000) + 1200,
        allowanceTarget: this.routerAddress,
      };
    } catch (error) {
      logger.error(`Failed to get ${this.name} quote`, error);
      throw error;
    }
  }

  async buildTransaction(
    quote: Quote,
    options: BuildTransactionOptions
  ): Promise<TransactionRequest> {
    const deadline = options.deadline || Math.floor(Date.now() / 1000) + 1200;
    const recipient = options.recipient || this.walletClient.account?.address;

    if (!recipient) throw new Error('No recipient address');

    const path = [
      quote.inputAmount.token.address,
      quote.outputAmount.token.address,
    ];

    const data = encodeFunctionData({
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [
        quote.inputAmount.amount,
        quote.minimumReceived.amount,
        path,
        recipient,
        BigInt(deadline),
      ],
    });

    return {
      to: this.routerAddress,
      data,
      value: BigInt(0),
    };
  }

  public async getAllowanceTarget(): Promise<Address> {
    return this.routerAddress;
  }

  private async getReserves(pairAddress: Address): Promise<{
    reserve0: bigint;
    reserve1: bigint;
  }> {
    const result = await this.publicClient.readContract({
      address: pairAddress,
      abi: UNISWAP_V2_PAIR_ABI,
      functionName: 'getReserves',
    });

    return {
      reserve0: result[0],
      reserve1: result[1],
    };
  }

  private calculateV2PriceImpact(
    amountIn: bigint,
    amountOut: bigint,
    reserves: { reserve0: bigint; reserve1: bigint }
  ): number {
    // Calculate price impact using constant product formula
    // impact = (amountOut / reserveOut) / (amountIn / reserveIn)
    const { reserve0, reserve1 } = reserves;

    if (reserve0 === BigInt(0) || reserve1 === BigInt(0)) return 0;

    const priceWithoutSlippage = (reserve1 * BigInt(1e18)) / reserve0;
    const priceWithSlippage = (amountOut * BigInt(1e18)) / amountIn;
    const impact =
      ((priceWithoutSlippage - priceWithSlippage) * BigInt(10000)) /
      priceWithoutSlippage;

    return Number(impact) / 100; // Convert to percentage
  }
}

// Factory functions for different V2 forks
export function createUniswapV2Adapter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number
): UniswapV2Adapter {
  const routers: Record<number, { router: Address; factory: Address }> = {
    1: {
      // Ethereum Mainnet
      router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    },
    8453: {
      // Base
      router: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
      factory: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6',
    },
  };

  const config = routers[chainId];
  if (!config) throw new Error(`Unsupported chain ${chainId}`);

  return new UniswapV2Adapter(
    publicClient,
    walletClient,
    config.router,
    config.factory,
    'Uniswap V2'
  );
}

export function createSushiSwapAdapter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number
): UniswapV2Adapter {
  const routers: Record<number, { router: Address; factory: Address }> = {
    1: {
      router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
      factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
    },
    // Add more chains as needed
  };

  const config = routers[chainId];
  if (!config) throw new Error(`Unsupported chain ${chainId}`);

  return new UniswapV2Adapter(
    publicClient,
    walletClient,
    config.router,
    config.factory,
    'SushiSwap'
  );
}

export function createPancakeSwapAdapter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number
): UniswapV2Adapter {
  const routers: Record<number, { router: Address; factory: Address }> = {
    56: {
      // BSC
      router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    },
  };

  const config = routers[chainId];
  if (!config) throw new Error(`Unsupported chain ${chainId}`);

  return new UniswapV2Adapter(
    publicClient,
    walletClient,
    config.router,
    config.factory,
    'PancakeSwap'
  );
}
