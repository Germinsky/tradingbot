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

interface ZeroExQuoteResponse {
  sellAmount: string;
  buyAmount: string;
  price: string;
  guaranteedPrice: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  estimatedGas: string;
  gasPrice: string;
  protocolFee: string;
  minimumProtocolFee: string;
  buyTokenAddress: string;
  sellTokenAddress: string;
  sources: Array<{
    name: string;
    proportion: string;
  }>;
  allowanceTarget: string;
}

export class ZeroExAdapter extends BaseAdapter {
  readonly name = '0x Protocol';
  readonly supportedChains = [1, 56, 137, 42161, 10, 43114];

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    private apiKey: string,
    private apiUrl: string = 'https://api.0x.org'
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
      logger.debug('Getting 0x quote', { input, output });

      const chainId = await this.publicClient.getChainId();
      const taker = this.walletClient.account?.address;

      const params = new URLSearchParams({
        sellToken: input.token.address,
        buyToken: output.address,
        sellAmount: input.amount.toString(),
        slippagePercentage: (slippage / 100).toString(),
        ...(taker && { takerAddress: taker }),
      });

      const response = await fetch(
        `${this.apiUrl}/swap/v1/quote?${params.toString()}`,
        {
          headers: {
            '0x-api-key': this.apiKey,
            '0x-chain-id': chainId.toString(),
          },
        }
      );

      if (!response.ok) {
        const error = await response.json() as { reason?: string };
        throw new Error(`0x API error: ${error.reason || response.statusText}`);
      }

      const data = await response.json() as ZeroExQuoteResponse;

      const minimumReceived = this.calculateMinimumReceived(
        BigInt(data.buyAmount),
        slippage
      );

      return {
        inputAmount: input,
        outputAmount: {
          token: output,
          amount: BigInt(data.buyAmount),
        },
        minimumReceived: {
          token: output,
          amount: minimumReceived,
        },
        priceImpact: this.calculatePriceImpactFromGuaranteedPrice(
          data.price,
          data.guaranteedPrice
        ),
        feeBps: Number(data.protocolFee) / Number(data.sellAmount) * 10000,
        gasEstimate: BigInt(data.estimatedGas),
        routes: [[]], // 0x routes are opaque
        exchangeId: '0x',
        validUntil: Math.floor(Date.now() / 1000) + 300, // 5 minutes
        allowanceTarget: data.allowanceTarget as Address,
        sources: data.sources.map((s) => ({
          name: s.name,
          proportion: Number(s.proportion) * 100,
        })),
        to: data.to as Address,
        calldata: data.data as any,
      };
    } catch (error) {
      logger.error('Failed to get 0x quote', error);
      throw error;
    }
  }

  async buildTransaction(
    quote: AggregatedQuote,
    options: BuildTransactionOptions
  ): Promise<TransactionRequest> {
    if (!quote.to || !quote.calldata) {
      throw new Error('Invalid 0x quote: missing transaction data');
    }

    return {
      to: quote.to,
      data: quote.calldata,
      value: BigInt(0), // Handled by 0x
    };
  }

  public async getAllowanceTarget(): Promise<Address> {
    // 0x Exchange Proxy on Ethereum
    const proxies: Record<number, Address> = {
      1: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      56: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      137: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
      42161: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
    };

    const chainId = await this.publicClient.getChainId();
    const proxy = proxies[chainId];

    if (!proxy) throw new Error(`No 0x proxy for chain ${chainId}`);
    return proxy;
  }

  private calculatePriceImpactFromGuaranteedPrice(
    price: string,
    guaranteedPrice: string
  ): number {
    const priceNum = Number(price);
    const guaranteedNum = Number(guaranteedPrice);
    return Math.abs((priceNum - guaranteedNum) / priceNum) * 100;
  }
}

export function createZeroExAdapter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  apiKey: string
): ZeroExAdapter {
  return new ZeroExAdapter(publicClient, walletClient, apiKey);
}
