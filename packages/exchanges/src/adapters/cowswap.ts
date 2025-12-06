import {
  Address,
  PublicClient,
  WalletClient,
  TransactionRequest,
  Hash,
  keccak256,
  encodeAbiParameters,
} from 'viem';
import { BaseAdapter } from './base-adapter';
import {
  Token,
  TokenAmount,
  Quote,
  BuildTransactionOptions,
  CowSwapOrder,
  ExecuteSwapOptions,
  MEVProtectionResult,
} from '../types';
import { logger } from '../utils/logger';

interface CowSwapQuoteResponse {
  quote: {
    sellToken: string;
    buyToken: string;
    receiver: string;
    sellAmount: string;
    buyAmount: string;
    validTo: number;
    appData: string;
    feeAmount: string;
    kind: string;
    partiallyFillable: boolean;
    sellTokenBalance: string;
    buyTokenBalance: string;
  };
  from: string;
  expirationDateTime: string;
  id: string;
}

export class CowSwapAdapter extends BaseAdapter {
  readonly name = 'CoW Swap';
  readonly supportedChains = [1, 100]; // Ethereum and Gnosis Chain

  private readonly API_URLS: Record<number, string> = {
    1: 'https://api.cow.fi/mainnet',
    100: 'https://api.cow.fi/xdai',
  };

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient
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
      logger.debug('Getting CoW Swap quote', { input, output });

      const chainId = await this.publicClient.getChainId();
      const apiUrl = this.API_URLS[chainId];

      if (!apiUrl) throw new Error(`CoW Swap not supported on chain ${chainId}`);

      const from = this.walletClient.account?.address;
      if (!from) throw new Error('No wallet connected');

      const requestBody = {
        sellToken: input.token.address,
        buyToken: output.address,
        sellAmountBeforeFee: input.amount.toString(),
        from,
        kind: 'sell',
        partiallyFillable: false,
      };

      const response = await fetch(`${apiUrl}/api/v1/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json() as { description?: string };
        throw new Error(`CoW Swap API error: ${error.description || response.statusText}`);
      }

      const data = await response.json() as CowSwapQuoteResponse;

      const buyAmount = BigInt(data.quote.buyAmount);
      const minimumReceived = this.calculateMinimumReceived(buyAmount, slippage);

      return {
        inputAmount: input,
        outputAmount: {
          token: output,
          amount: buyAmount,
        },
        minimumReceived: {
          token: output,
          amount: minimumReceived,
        },
        priceImpact: 0, // CoW Swap provides best execution, no explicit price impact
        feeBps: (Number(data.quote.feeAmount) / Number(input.amount)) * 10000,
        gasEstimate: BigInt(0), // CoW Swap orders are gasless
        routes: [[]], // CoW Swap routes are solver-determined
        exchangeId: 'cowswap',
        validUntil: data.quote.validTo,
        allowanceTarget: await this.getAllowanceTarget(),
        data: {
          quoteId: data.id,
          cowOrder: data.quote,
        },
      };
    } catch (error) {
      logger.error('Failed to get CoW Swap quote', error);
      throw error;
    }
  }

  async buildTransaction(
    quote: Quote,
    options: BuildTransactionOptions
  ): Promise<TransactionRequest> {
    // CoW Swap uses signed orders, not direct transactions
    // This method is kept for interface compliance
    throw new Error(
      'CoW Swap uses signed orders. Use executeSwap with cowSwapOrder: true'
    );
  }

  async executeSwap(
    quote: Quote,
    _options: ExecuteSwapOptions
  ): Promise<MEVProtectionResult> {
    try {
      logger.info('Submitting CoW Swap order');

      const chainId = await this.publicClient.getChainId();
      const apiUrl = this.API_URLS[chainId];

      if (!apiUrl) throw new Error(`CoW Swap not supported on chain ${chainId}`);

      // Build order from quote
      const order: CowSwapOrder = {
        sellToken: quote.inputAmount.token.address,
        buyToken: quote.outputAmount.token.address,
        sellAmount: quote.inputAmount.amount,
        buyAmount: quote.minimumReceived.amount,
        validTo: quote.validUntil || Math.floor(Date.now() / 1000) + 1200,
        appData: this.generateAppData(),
        feeAmount: BigInt(0), // Fee included in quote
        kind: 'sell',
        partiallyFillable: false,
        sellTokenBalance: 'erc20',
        buyTokenBalance: 'erc20',
      };

      // Sign order
      const orderHash = this.hashOrder(order, chainId);
      const account = this.walletClient.account;
      if (!account) throw new Error('No account available');
      
      const signature = await this.walletClient.signMessage({
        account,
        message: { raw: orderHash },
      });

      order.signature = signature;
      order.signingScheme = 'eip712';

      // Submit order to CoW Protocol
      const response = await fetch(`${apiUrl}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(order),
      });

      if (!response.ok) {
        const error = (await response.json()) as { description?: string };
        throw new Error(`Failed to submit CoW order: ${error.description || response.statusText}`);
      }

      const orderUid = await response.text();

      logger.info(`CoW Swap order submitted: ${orderUid}`);

      // CoW orders are MEV-protected by design
      return {
        txHash: orderUid as Hash,
        protected: true,
        privateRpc: 'cowswap',
      };
    } catch (error) {
      logger.error('Failed to execute CoW Swap order', error);
      throw error;
    }
  }

  public async getAllowanceTarget(): Promise<Address> {
    const chainId = await this.publicClient.getChainId();

    // CoW Swap GPv2VaultRelayer addresses
    const vaultRelayers: Record<number, Address> = {
      1: '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110',
      100: '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110',
    };

    const relayer = vaultRelayers[chainId];
    if (!relayer) throw new Error(`No CoW Swap vault relayer for chain ${chainId}`);

    return relayer;
  }

  private generateAppData(): Hash {
    // Generate app data hash for the order
    // This identifies the integration
    const appData = {
      version: '1.0.0',
      appCode: 'trading-bot',
      metadata: {},
    };

    return keccak256(
      encodeAbiParameters(
        [{ type: 'string' }],
        [JSON.stringify(appData)]
      )
    );
  }

  private hashOrder(__order: CowSwapOrder, chainId: number): Hash {
    // Generate EIP-712 order hash
    // This is a simplified version
    const _domain = {
      name: 'Gnosis Protocol',
      version: 'v2',
      chainId,
      verifyingContract: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41' as Address, // Settlement contract
    };

    const _types = {
      Order: [
        { name: 'sellToken', type: 'address' },
        { name: 'buyToken', type: 'address' },
        { name: 'sellAmount', type: 'uint256' },
        { name: 'buyAmount', type: 'uint256' },
        { name: 'validTo', type: 'uint32' },
        { name: 'appData', type: 'bytes32' },
        { name: 'feeAmount', type: 'uint256' },
        { name: 'kind', type: 'bytes32' },
        { name: 'partiallyFillable', type: 'bool' },
        { name: 'sellTokenBalance', type: 'bytes32' },
        { name: 'buyTokenBalance', type: 'bytes32' },
      ],
    };

    // In production, use proper EIP-712 signing
    return keccak256('0x00') as Hash; // Placeholder
  }
}

export function createCowSwapAdapter(
  publicClient: PublicClient,
  walletClient: WalletClient
): CowSwapAdapter {
  return new CowSwapAdapter(publicClient, walletClient);
}
