import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits, Address } from 'viem';
import { optimism } from 'viem/chains';
import { BasePerpAdapter, PerpPosition, PerpOrderParams, PerpMarketInfo } from '../perp-adapter.js';

// Perpetual Protocol V2 Contract ABIs
const CLEARING_HOUSE_ABI = parseAbi([
  'function openPosition((address baseToken, bool isBaseToQuote, bool isExactInput, uint256 amount, uint256 oppositeAmountBound, uint256 deadline, uint160 sqrtPriceLimitX96, bytes32 referralCode)) external returns (uint256, uint256)',
  'function closePosition((address baseToken, uint160 sqrtPriceLimitX96, uint256 oppositeAmountBound, uint256 deadline, bytes32 referralCode)) external returns (uint256)',
  'function addLiquidity((address baseToken, uint256 base, uint256 quote, int24 lowerTick, int24 upperTick, uint256 minBase, uint256 minQuote, bool useTakerBalance, uint256 deadline)) external returns (uint256, uint256, uint256)',
  'function removeLiquidity((address baseToken, int24 lowerTick, int24 upperTick, uint128 liquidity, uint256 minBase, uint256 minQuote, uint256 deadline)) external returns (uint256, uint256)',
  'function getAccountValue(address trader) external view returns (int256)',
  'function getTotalPositionSize(address trader, address baseToken) external view returns (int256)',
  'function getTotalPositionValue(address trader, address baseToken) external view returns (int256)',
  'function getOpenNotional(address trader, address baseToken) external view returns (int256)',
]);

const VAULT_ABI = parseAbi([
  'function deposit(address token, uint256 amount) external',
  'function withdraw(address token, uint256 amount) external',
  'function getFreeCollateral(address trader) external view returns (uint256)',
  'function getBalance(address trader) external view returns (int256)',
]);

const EXCHANGE_ABI = parseAbi([
  'function getSqrtMarkTwapX96(address baseToken, uint32 twapInterval) external view returns (uint160)',
  'function getMaxTickCrossedWithinBlock(address baseToken) external view returns (uint24)',
]);

interface PerpProtocolConfig {
  rpcUrl: string;
  clearingHouseAddress: Address;
  vaultAddress: Address;
  exchangeAddress: Address;
  walletPrivateKey?: `0x${string}`;
}

interface PerpProtocolMarket {
  address: Address;
  symbol: string;
}

export class PerpProtocolAdapter extends BasePerpAdapter {
  private publicClient: any;
  private walletClient: any;
  private config: PerpProtocolConfig;
  private markets: Map<string, PerpProtocolMarket> = new Map();
  private positionSubscriptions: Set<string> = new Set();
  private marketSubscriptions: Set<string> = new Set();
  private pollingInterval?: NodeJS.Timeout;

  constructor(config: PerpProtocolConfig) {
    super();
    this.config = config;
    this.publicClient = createPublicClient({
      chain: optimism,
      transport: http(config.rpcUrl),
    });
    
    if (config.walletPrivateKey) {
      this.walletClient = createWalletClient({
        chain: optimism,
        transport: http(config.rpcUrl),
      });
    }

    this.initializeMarkets();
  }

  private initializeMarkets(): void {
    // Perpetual Protocol V2 markets on Optimism
    this.markets.set('ETH/USD', {
      address: '0x8C835DFaA34e2AE61775e80EE29E2c724c6AE2BB',
      symbol: 'ETH/USD',
    });
    this.markets.set('BTC/USD', {
      address: '0x2e8D98fd126a32362F2Bd8aA427E59a1ec63F780',
      symbol: 'BTC/USD',
    });
  }

  async connect(): Promise<void> {
    await super.connect();
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    await super.disconnect();
  }

  async openPosition(params: PerpOrderParams): Promise<PerpPosition> {
    if (!this.walletClient) {
      throw new Error('Wallet not configured');
    }

    const market = this.markets.get(params.symbol);
    if (!market) {
      throw new Error(`Market ${params.symbol} not found`);
    }

    const leverage = params.leverage || 10;
    const markPrice = await this.getMarkPrice(params.symbol);
    const slippage = params.slippage || 0.005;

    // Calculate required collateral
    const positionValue = params.size * markPrice;
    const collateral = positionValue / leverage;
    const collateralWei = parseUnits(collateral.toString(), 18);

    // First deposit collateral to vault
    await this.walletClient.writeContract({
      address: this.config.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: ['0x7F5c764cBc14f9669B88837ca1490cCa17c31607', collateralWei], // USDC on Optimism
      value: 0n,
    });

    // Calculate amount in base token units (18 decimals)
    const amount = parseUnits(params.size.toString(), 18);
    const oppositeAmountBound = parseUnits(
      (positionValue * (1 + (params.side === 'long' ? slippage : -slippage))).toString(),
      18
    );

    // Open position
    const hash = await this.walletClient.writeContract({
      address: this.config.clearingHouseAddress,
      abi: CLEARING_HOUSE_ABI,
      functionName: 'openPosition',
      args: [{
        baseToken: market.address,
        isBaseToQuote: params.side === 'short',
        isExactInput: false,
        amount,
        oppositeAmountBound,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 minutes
        sqrtPriceLimitX96: 0n,
        referralCode: '0x0000000000000000000000000000000000000000000000000000000000000000',
      }],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    const positionId = `${await this.walletClient.account.address}-${params.symbol}`;

    const position: PerpPosition = {
      id: positionId,
      symbol: params.symbol,
      side: params.side,
      size: params.size,
      entryPrice: markPrice,
      markPrice,
      leverage,
      collateral,
      unrealizedPnl: 0,
      liquidationPrice: this.calculateLiquidationPrice(markPrice, params.side, leverage),
      fundingRate: await this.getFundingRate(params.symbol),
      timestamp: Date.now(),
    };

    this.emitPositionUpdate(position);
    return position;
  }

  async adjustPosition(positionId: string, params: Partial<PerpOrderParams>): Promise<PerpPosition> {
    if (!this.walletClient) {
      throw new Error('Wallet not configured');
    }

    const position = await this.getPosition(positionId);
    const market = this.markets.get(position.symbol);
    if (!market) {
      throw new Error(`Market ${position.symbol} not found`);
    }

    if (params.size) {
      const sizeDelta = params.size - position.size;
      const isIncrease = sizeDelta > 0;
      const amount = parseUnits(Math.abs(sizeDelta).toString(), 18);

      await this.walletClient.writeContract({
        address: this.config.clearingHouseAddress,
        abi: CLEARING_HOUSE_ABI,
        functionName: 'openPosition',
        args: [{
          baseToken: market.address,
          isBaseToQuote: position.side === 'short' ? !isIncrease : isIncrease,
          isExactInput: false,
          amount,
          oppositeAmountBound: 0n,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
          sqrtPriceLimitX96: 0n,
          referralCode: '0x0000000000000000000000000000000000000000000000000000000000000000',
        }],
      });
    }

    const updatedPosition = await this.fetchPositionData(positionId);
    this.emitPositionUpdate(updatedPosition);
    return updatedPosition;
  }

  async closePosition(positionId: string, size?: number): Promise<void> {
    if (!this.walletClient) {
      throw new Error('Wallet not configured');
    }

    const position = await this.getPosition(positionId);
    const market = this.markets.get(position.symbol);
    if (!market) {
      throw new Error(`Market ${position.symbol} not found`);
    }

    if (size && size < position.size) {
      // Partial close
      const amount = parseUnits(size.toString(), 18);
      await this.walletClient.writeContract({
        address: this.config.clearingHouseAddress,
        abi: CLEARING_HOUSE_ABI,
        functionName: 'openPosition',
        args: [{
          baseToken: market.address,
          isBaseToQuote: position.side === 'long',
          isExactInput: false,
          amount,
          oppositeAmountBound: 0n,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
          sqrtPriceLimitX96: 0n,
          referralCode: '0x0000000000000000000000000000000000000000000000000000000000000000',
        }],
      });
    } else {
      // Full close
      await this.walletClient.writeContract({
        address: this.config.clearingHouseAddress,
        abi: CLEARING_HOUSE_ABI,
        functionName: 'closePosition',
        args: [{
          baseToken: market.address,
          sqrtPriceLimitX96: 0n,
          oppositeAmountBound: 0n,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
          referralCode: '0x0000000000000000000000000000000000000000000000000000000000000000',
        }],
      });
      
      this.positions.delete(positionId);
      this.emit('positionClosed', { positionId, symbol: position.symbol });
    }
  }

  async getMarkPrice(symbol: string): Promise<number> {
    const market = this.markets.get(symbol);
    if (!market) {
      throw new Error(`Market ${symbol} not found`);
    }

    const sqrtPriceX96 = await this.publicClient.readContract({
      address: this.config.exchangeAddress,
      abi: EXCHANGE_ABI,
      functionName: 'getSqrtMarkTwapX96',
      args: [market.address, 15], // 15 second TWAP
    });

    // Convert sqrtPriceX96 to price
    const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
    const price = sqrtPrice ** 2;
    return price;
  }

  async getFundingRate(symbol: string): Promise<number> {
    // Perpetual Protocol uses time-weighted average for funding
    // This is a simplified calculation
    return 0.0001; // 0.01% per hour (placeholder)
  }

  async getMaxLeverage(symbol: string): Promise<number> {
    // Perpetual Protocol V2 supports up to 10x leverage
    return 10;
  }

  async getMarketInfo(symbol: string): Promise<PerpMarketInfo> {
    const markPrice = await this.getMarkPrice(symbol);
    const fundingRate = await this.getFundingRate(symbol);
    const maxLeverage = await this.getMaxLeverage(symbol);

    return {
      symbol,
      markPrice,
      indexPrice: markPrice,
      fundingRate,
      nextFundingTime: Date.now() + 3600000, // Hourly funding
      openInterest: 0,
      maxLeverage,
      minSize: 0.001,
      available: true,
    };
  }

  subscribeToPosition(positionId: string): void {
    this.positionSubscriptions.add(positionId);
  }

  unsubscribeFromPosition(positionId: string): void {
    this.positionSubscriptions.delete(positionId);
  }

  subscribeToMarket(symbol: string): void {
    this.marketSubscriptions.add(symbol);
  }

  unsubscribeFromMarket(symbol: string): void {
    this.marketSubscriptions.delete(symbol);
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.pollUpdates();
    }, 3000);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private async pollUpdates(): Promise<void> {
    for (const positionId of this.positionSubscriptions) {
      try {
        const position = await this.fetchPositionData(positionId);
        this.emitPositionUpdate(position);
      } catch (error) {
        console.error(`Error polling position ${positionId}:`, error);
      }
    }

    for (const symbol of this.marketSubscriptions) {
      try {
        const markPrice = await this.getMarkPrice(symbol);
        this.emitMarketUpdate(symbol, { markPrice });
      } catch (error) {
        console.error(`Error polling market ${symbol}:`, error);
      }
    }
  }

  private async fetchPositionData(positionId: string): Promise<PerpPosition> {
    const [address, symbol] = positionId.split('-');
    const market = this.markets.get(symbol);
    if (!market) {
      throw new Error(`Market ${symbol} not found`);
    }

    const positionSize = await this.publicClient.readContract({
      address: this.config.clearingHouseAddress,
      abi: CLEARING_HOUSE_ABI,
      functionName: 'getTotalPositionSize',
      args: [address as Address, market.address],
    });

    const positionValue = await this.publicClient.readContract({
      address: this.config.clearingHouseAddress,
      abi: CLEARING_HOUSE_ABI,
      functionName: 'getTotalPositionValue',
      args: [address as Address, market.address],
    });

    const openNotional = await this.publicClient.readContract({
      address: this.config.clearingHouseAddress,
      abi: CLEARING_HOUSE_ABI,
      functionName: 'getOpenNotional',
      args: [address as Address, market.address],
    });

    const accountValue = await this.publicClient.readContract({
      address: this.config.clearingHouseAddress,
      abi: CLEARING_HOUSE_ABI,
      functionName: 'getAccountValue',
      args: [address as Address],
    });

    const size = parseFloat(formatUnits(positionSize, 18));
    const value = parseFloat(formatUnits(positionValue, 18));
    const notional = parseFloat(formatUnits(openNotional, 18));
    const equity = parseFloat(formatUnits(accountValue, 18));

    const markPrice = await this.getMarkPrice(symbol);
    const entryPrice = Math.abs(notional / size);
    const pnl = value - notional;
    const leverage = Math.abs(value / equity);

    return {
      id: positionId,
      symbol,
      side: size > 0 ? 'long' : 'short',
      size: Math.abs(size),
      entryPrice,
      markPrice,
      leverage,
      collateral: equity,
      unrealizedPnl: pnl,
      liquidationPrice: this.calculateLiquidationPrice(entryPrice, size > 0 ? 'long' : 'short', leverage),
      fundingRate: await this.getFundingRate(symbol),
      timestamp: Date.now(),
    };
  }

  private calculateLiquidationPrice(entryPrice: number, side: 'long' | 'short', leverage: number): number {
    const maintenanceMargin = 0.0625; // 6.25%
    const priceMove = entryPrice * (1 - maintenanceMargin) / leverage;
    return side === 'long' ? entryPrice - priceMove : entryPrice + priceMove;
  }
}

export function createPerpProtocolAdapter(rpcUrl: string, privateKey?: `0x${string}`): PerpProtocolAdapter {
  return new PerpProtocolAdapter({
    rpcUrl,
    clearingHouseAddress: '0x82ac2CE43e33683c58BE4cDc40975E73aA50f459',
    vaultAddress: '0xAD7b4C162707E0B2b5f6fdDbD3f8538A5fbA0d60',
    exchangeAddress: '0xb33C7a3B9bCaCE7a4D8E91a63E9bFe8D2E0F3A2C',
    walletPrivateKey: privateKey,
  });
}
