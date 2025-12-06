import { Address, Hash, TransactionRequest } from 'viem';

// Token representation
export interface Token {
  address: Address;
  symbol: string;
  decimals: number;
  chainId: number;
  name?: string;
  logoURI?: string;
}

// Token amount with value
export interface TokenAmount {
  token: Token;
  amount: bigint;
  amountFormatted?: string;
}

// Route hop for multi-hop swaps
export interface RouteHop {
  protocol: string; // "uniswap-v2" | "uniswap-v3" | "sushiswap" | "curve" etc.
  poolAddress: Address;
  tokenIn: Token;
  tokenOut: Token;
  fee?: number; // For V3 pools (3000 = 0.3%)
  percentage?: number; // For split routes
}

// Normalized quote from any exchange
export interface Quote {
  inputAmount: TokenAmount;
  outputAmount: TokenAmount;
  minimumReceived: TokenAmount;
  priceImpact: number; // Percentage (0-100)
  feeBps: number; // Fee in basis points (100 = 1%)
  gasEstimate: bigint;
  routes: RouteHop[][];
  exchangeId: string; // "uniswap-v3", "0x", "cowswap" etc.
  validUntil?: number; // Unix timestamp
  allowanceTarget?: Address; // Address to approve tokens to
  data?: any; // Protocol-specific data
}

// Options for building transactions
export interface BuildTransactionOptions {
  slippage: number; // Percentage (0.5 = 0.5%)
  deadline?: number; // Unix timestamp
  recipient?: Address;
  permit2?: {
    signature: Hash;
    deadline: bigint;
    nonce: bigint;
  };
  referrer?: Address;
  feeBps?: number; // Additional fee for integrator
}

// Options for executing swaps
export interface ExecuteSwapOptions {
  flashbots?: boolean; // Use Flashbots Protect RPC
  edenNetwork?: boolean; // Use Eden Network for MEV protection
  cowSwapOrder?: boolean; // Submit as CoW Protocol signed order
  privateTx?: boolean; // Use private mempool (Flashbots/Eden/etc)
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
  gasLimit?: bigint;
  waitForConfirmation?: boolean;
}

// Cross-chain swap specific options
export interface CrossChainSwapOptions extends BuildTransactionOptions {
  destinationChainId: number;
  destinationRecipient?: Address;
  bridge: 'across' | 'hop' | 'synapse';
  maxSlippage?: number; // Max slippage for destination swap
}

// MEV protection result
export interface MEVProtectionResult {
  bundleHash?: Hash;
  txHash?: Hash;
  privateRpc?: string;
  protected: boolean;
  blockNumber?: bigint;
}

// CoW Protocol order
export interface CowSwapOrder {
  sellToken: Address;
  buyToken: Address;
  sellAmount: bigint;
  buyAmount: bigint;
  validTo: number;
  appData: Hash;
  feeAmount: bigint;
  kind: 'sell' | 'buy';
  partiallyFillable: boolean;
  sellTokenBalance: 'erc20' | 'external';
  buyTokenBalance: 'erc20' | 'internal';
  signature?: Hash;
  signingScheme?: 'eip712' | 'ethsign' | 'eip1271';
}

// Main exchange adapter interface
export interface IExchangeAdapter {
  readonly name: string;
  readonly supportedChains: number[];

  /**
   * Get a quote for swapping tokens
   */
  getQuote(
    input: TokenAmount,
    output: Token,
    slippage: number,
    options?: Partial<BuildTransactionOptions>
  ): Promise<Quote>;

  /**
   * Build a transaction from a quote
   */
  buildTransaction(
    quote: Quote,
    options: BuildTransactionOptions
  ): Promise<TransactionRequest>;

  /**
   * Execute a swap with optional MEV protection
   */
  executeSwap(
    quote: Quote,
    options: ExecuteSwapOptions
  ): Promise<MEVProtectionResult>;

  /**
   * Get approval transaction if needed
   */
  getApprovalTransaction(
    token: Token,
    amount: bigint,
    spender?: Address
  ): Promise<TransactionRequest | null>;

  /**
   * Check if token approval is needed
   */
  needsApproval(token: Token, amount: bigint, owner: Address): Promise<boolean>;
}

// Cross-chain adapter interface
export interface ICrossChainAdapter extends IExchangeAdapter {
  /**
   * Get quote for cross-chain swap
   */
  getCrossChainQuote(
    input: TokenAmount,
    output: Token,
    options: CrossChainSwapOptions
  ): Promise<Quote>;

  /**
   * Build cross-chain transaction
   */
  buildCrossChainTransaction(
    quote: Quote,
    options: CrossChainSwapOptions
  ): Promise<TransactionRequest>;
}

// Aggregator-specific types
export interface AggregatorSource {
  name: string;
  proportion: number; // 0-100
  hops?: RouteHop[];
}

export interface AggregatedQuote extends Quote {
  sources: AggregatorSource[];
  to?: Address;
  calldata?: Hash;
}
