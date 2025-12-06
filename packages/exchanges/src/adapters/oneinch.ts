import {
  Address,
  PublicClient,
  WalletClient,
  TransactionRequest,
} from 'viem';
import { BaseAdapter } from './base-adapter';
import {
  Token,
  TokenAmount,
  Quote,
  BuildTransactionOptions,
  AggregatedQuote,
} from '../types';
import { logger } from '../utils/logger';

interface OneInchQuoteResponse {
  toAmount: string;
  fromTokenAmount: string;
  protocols: Array<
    Array<
      Array<{
        name: string;
        part: number;
        fromTokenAddress: string;
        toTokenAddress: string;
      }>
    >
  >;
  estimatedGas: number;
}

interface OneInchSwapResponse extends OneInchQuoteResponse {
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: number;
    gasPrice: string;
  };
}

export class OneInchAdapter extends BaseAdapter {
  readonly name = '1inch';
  readonly supportedChains = [1, 56, 137, 42161, 10, 43114];

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    private apiKey: string,
    private apiUrl: string = 'https://api.1inch.dev'
  ) {
    super(publicClient, walletClient);
  }

  async getQuote(
    input: TokenAmount,
    output: Token,
    slippage: number,
    __options?: Partial<BuildTransactionOptions>
  ): Promise<AggregatedQuote> {
    try {
      logger.debug('Getting 1inch quote', { input, output });

      const chainId = await this.publicClient.getChainId();

      const params = new URLSearchParams({
        src: input.token.address,
        dst: output.address,
        amount: input.amount.toString(),
        includeProtocols: 'true',
        includeGas: 'true',
      });

      const response = await fetch(
        `${this.apiUrl}/swap/v6.0/${chainId}/quote?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json() as { description?: string };
        throw new Error(`1inch API error: ${error.description || response.statusText}`);
      }

      const data = await response.json() as OneInchQuoteResponse;

      const outputAmount = BigInt(data.toAmount);
      const minimumReceived = this.calculateMinimumReceived(outputAmount, slippage);

      // Parse protocols into sources
      const sources = this.parseProtocols(data.protocols);

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
        priceImpact: 0.1, // 1inch doesn't provide this directly
        feeBps: 0, // 1inch charges no protocol fees
        gasEstimate: BigInt(data.estimatedGas),
        routes: [[]], // Routes are complex in 1inch
        exchangeId: '1inch',
        validUntil: Math.floor(Date.now() / 1000) + 300,
        allowanceTarget: await this.getAllowanceTarget(),
        sources,
      };
    } catch (error) {
      logger.error('Failed to get 1inch quote', error);
      throw error;
    }
  }

  async buildTransaction(
    quote: Quote,
    options: BuildTransactionOptions
  ): Promise<TransactionRequest> {
    try {
      const chainId = await this.publicClient.getChainId();
      const from = this.walletClient.account?.address;

      if (!from) throw new Error('No wallet connected');

      const params = new URLSearchParams({
        src: quote.inputAmount.token.address,
        dst: quote.outputAmount.token.address,
        amount: quote.inputAmount.amount.toString(),
        from,
        slippage: options.slippage.toString(),
        disableEstimate: 'true',
      });

      if (options.recipient) params.set('receiver', options.recipient);
      if (options.referrer) params.set('referrer', options.referrer);

      const response = await fetch(
        `${this.apiUrl}/swap/v6.0/${chainId}/swap?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json() as { description?: string };
        throw new Error(`1inch swap API error: ${error.description || response.statusText}`);
      }

      const data = await response.json() as OneInchSwapResponse;

      return {
        to: data.tx.to as Address,
        data: data.tx.data as any,
        value: BigInt(data.tx.value),
        gas: BigInt(data.tx.gas),
      };
    } catch (error) {
      logger.error('Failed to build 1inch transaction', error);
      throw error;
    }
  }

  public async getAllowanceTarget(): Promise<Address> {
    const chainId = await this.publicClient.getChainId();

    // 1inch v6 Router addresses
    const routers: Record<number, Address> = {
      1: '0x111111125421cA6dc452d289314280a0f8842A65',
      56: '0x111111125421cA6dc452d289314280a0f8842A65',
      137: '0x111111125421cA6dc452d289314280a0f8842A65',
      42161: '0x111111125421cA6dc452d289314280a0f8842A65',
      10: '0x111111125421cA6dc452d289314280a0f8842A65',
    };

    const router = routers[chainId];
    if (!router) throw new Error(`No 1inch router for chain ${chainId}`);

    return router;
  }

  private parseProtocols(
    protocols: OneInchQuoteResponse['protocols']
  ): Array<{ name: string; proportion: number }> {
    const sourceMap = new Map<string, number>();

    protocols.forEach((route) => {
      route.forEach((hop) => {
        hop.forEach((proto) => {
          const current = sourceMap.get(proto.name) || 0;
          sourceMap.set(proto.name, current + proto.part);
        });
      });
    });

    return Array.from(sourceMap.entries()).map(([name, part]) => ({
      name,
      proportion: part,
    }));
  }
}

export function createOneInchAdapter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  apiKey: string
): OneInchAdapter {
  return new OneInchAdapter(publicClient, walletClient, apiKey);
}
