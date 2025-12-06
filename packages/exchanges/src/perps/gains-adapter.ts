import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits, Address, Chain } from 'viem';
import { polygon, arbitrum } from 'viem/chains';
import { BasePerpAdapter, PerpPosition, PerpOrderParams, PerpMarketInfo } from '../perp-adapter.js';

// Gains Network gTrade Contract ABIs
const GTRADE_TRADING_ABI = parseAbi([
  'function openTrade((address trader, uint256 pairIndex, uint256 index, uint256 initialPosToken, uint256 positionSizeDai, uint256 openPrice, bool buy, uint256 leverage, uint256 tp, uint256 sl) trade, uint8 orderType, uint256 slippageP) external',
  'function updateTrade(uint256 index, uint256 positionSizeDai, uint256 leverage, uint256 tp, uint256 sl) external',
  'function closeTrade(uint256 index) external',
  'function getTrade(address trader, uint256 index) view returns ((address trader, uint256 pairIndex, uint256 index, uint256 initialPosToken, uint256 positionSizeDai, uint256 openPrice, bool buy, uint256 leverage, uint256 tp, uint256 sl))',
]);

const GTRADE_PRICE_AGGREGATOR_ABI = parseAbi([
  'function linkPriceFeed(uint256 pairIndex) view returns (address)',
  'function getPrice(uint256 pairIndex, uint8 orderType, uint256 positionSizeDai) view returns (uint256)',
  'function getCurrentPrice(uint256 pairIndex) view returns (uint256)',
]);

const GTRADE_FUNDING_FEES_ABI = parseAbi([
  'function getPendingAccFundingFees(uint256 pairIndex) view returns (int256)',
  'function getTradeInitialAccFees(address trader, uint256 pairIndex, uint256 index) view returns (uint256, int256)',
]);

interface GainsConfig {
  chain: Chain;
  tradingAddress: Address;
  priceAggregatorAddress: Address;
  fundingFeesAddress: Address;
  rpcUrl: string;
  walletPrivateKey?: `0x${string}`;
}

export class GainsAdapter extends BasePerpAdapter {
  private publicClient: any;
  private walletClient: any;
  private config: GainsConfig;
  private positionSubscriptions: Set<string> = new Set();
  private marketSubscriptions: Set<string> = new Set();
  private pollingInterval?: NodeJS.Timeout;
  private tradeIndexCounter: number = 0;

  constructor(config: GainsConfig) {
    super();
    this.config = config;
    this.publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });
    
    if (config.walletPrivateKey) {
      this.walletClient = createWalletClient({
        chain: config.chain,
        transport: http(config.rpcUrl),
      });
    }
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

    const pairIndex = this.getPairIndex(params.symbol);
    const leverage = params.leverage || 10;
    const positionSizeDai = parseUnits(params.size.toString(), 18);
    const slippageP = parseUnits((params.slippage || 0.01).toString(), 10); // 1% = 1e10
    
    const openPrice = await this.publicClient.readContract({
      address: this.config.priceAggregatorAddress,
      abi: GTRADE_PRICE_AGGREGATOR_ABI,
      functionName: 'getPrice',
      args: [pairIndex, 0, positionSizeDai], // 0 = market order
    });

    const trade = {
      trader: await this.walletClient.account.address,
      pairIndex,
      index: this.tradeIndexCounter++,
      initialPosToken: 0n,
      positionSizeDai: positionSizeDai * BigInt(leverage),
      openPrice,
      buy: params.side === 'long',
      leverage: BigInt(leverage),
      tp: params.takeProfit ? parseUnits(params.takeProfit.toString(), 10) : 0n,
      sl: params.stopLoss ? parseUnits(params.stopLoss.toString(), 10) : 0n,
    };

    const hash = await this.walletClient.writeContract({
      address: this.config.tradingAddress,
      abi: GTRADE_TRADING_ABI,
      functionName: 'openTrade',
      args: [trade, 0, slippageP], // 0 = market order
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    const positionId = `${await this.walletClient.account.address}-${trade.index}`;

    const markPrice = parseFloat(formatUnits(openPrice, 10));
    const position: PerpPosition = {
      id: positionId,
      symbol: params.symbol,
      side: params.side,
      size: params.size,
      entryPrice: markPrice,
      markPrice,
      leverage,
      collateral: params.size,
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
    const [, tradeIndex] = positionId.split('-');
    
    const newSize = params.size || position.size;
    const newLeverage = params.leverage || position.leverage;
    const positionSizeDai = parseUnits(newSize.toString(), 18);
    
    await this.walletClient.writeContract({
      address: this.config.tradingAddress,
      abi: GTRADE_TRADING_ABI,
      functionName: 'updateTrade',
      args: [
        BigInt(tradeIndex),
        positionSizeDai * BigInt(newLeverage),
        BigInt(newLeverage),
        params.takeProfit ? parseUnits(params.takeProfit.toString(), 10) : 0n,
        params.stopLoss ? parseUnits(params.stopLoss.toString(), 10) : 0n,
      ],
    });

    const updatedPosition = await this.fetchPositionData(positionId);
    this.emitPositionUpdate(updatedPosition);
    return updatedPosition;
  }

  async closePosition(positionId: string): Promise<void> {
    if (!this.walletClient) {
      throw new Error('Wallet not configured');
    }

    const position = await this.getPosition(positionId);
    const [, tradeIndex] = positionId.split('-');
    
    await this.walletClient.writeContract({
      address: this.config.tradingAddress,
      abi: GTRADE_TRADING_ABI,
      functionName: 'closeTrade',
      args: [BigInt(tradeIndex)],
    });

    this.positions.delete(positionId);
    this.emit('positionClosed', { positionId, symbol: position.symbol });
  }

  async getMarkPrice(symbol: string): Promise<number> {
    const pairIndex = this.getPairIndex(symbol);
    const price = await this.publicClient.readContract({
      address: this.config.priceAggregatorAddress,
      abi: GTRADE_PRICE_AGGREGATOR_ABI,
      functionName: 'getCurrentPrice',
      args: [pairIndex],
    });

    return parseFloat(formatUnits(price, 10));
  }

  async getFundingRate(symbol: string): Promise<number> {
    const pairIndex = this.getPairIndex(symbol);
    const fundingFees = await this.publicClient.readContract({
      address: this.config.fundingFeesAddress,
      abi: GTRADE_FUNDING_FEES_ABI,
      functionName: 'getPendingAccFundingFees',
      args: [pairIndex],
    });

    // Convert to hourly rate (Gains uses per-second rates)
    return parseFloat(formatUnits(fundingFees, 10)) * 3600;
  }

  async getMaxLeverage(symbol: string): Promise<number> {
    // Gains Network allows up to 150x on some pairs
    const leverageMap: Record<string, number> = {
      'BTC/USD': 150,
      'ETH/USD': 150,
      'default': 100,
    };
    return leverageMap[symbol] || leverageMap['default'];
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
      nextFundingTime: Date.now() + 3600000,
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
        const marketInfo = await this.getMarketInfo(symbol);
        this.emitMarketUpdate(symbol, marketInfo);
      } catch (error) {
        console.error(`Error polling market ${symbol}:`, error);
      }
    }
  }

  private async fetchPositionData(positionId: string): Promise<PerpPosition> {
    const [trader, tradeIndex] = positionId.split('-');
    
    const trade = await this.publicClient.readContract({
      address: this.config.tradingAddress,
      abi: GTRADE_TRADING_ABI,
      functionName: 'getTrade',
      args: [trader as Address, BigInt(tradeIndex)],
    });

    const markPrice = await this.getMarkPrice(this.getSymbolFromPairIndex(trade.pairIndex));
    const entryPrice = parseFloat(formatUnits(trade.openPrice, 10));
    const size = parseFloat(formatUnits(trade.positionSizeDai, 18)) / Number(trade.leverage);
    const leverage = Number(trade.leverage);
    
    // Calculate PnL
    const priceDiff = trade.buy ? (markPrice - entryPrice) : (entryPrice - markPrice);
    const unrealizedPnl = (priceDiff / entryPrice) * size * leverage;

    return {
      id: positionId,
      symbol: this.getSymbolFromPairIndex(trade.pairIndex),
      side: trade.buy ? 'long' : 'short',
      size,
      entryPrice,
      markPrice,
      leverage,
      collateral: size,
      unrealizedPnl,
      liquidationPrice: this.calculateLiquidationPrice(entryPrice, trade.buy ? 'long' : 'short', leverage),
      fundingRate: await this.getFundingRate(this.getSymbolFromPairIndex(trade.pairIndex)),
      timestamp: Date.now(),
    };
  }

  private getPairIndex(symbol: string): bigint {
    const pairs: Record<string, number> = {
      'BTC/USD': 0,
      'ETH/USD': 1,
      'LINK/USD': 2,
      'MATIC/USD': 3,
    };
    return BigInt(pairs[symbol] || 0);
  }

  private getSymbolFromPairIndex(pairIndex: bigint): string {
    const symbols = ['BTC/USD', 'ETH/USD', 'LINK/USD', 'MATIC/USD'];
    return symbols[Number(pairIndex)] || 'BTC/USD';
  }

  private calculateLiquidationPrice(entryPrice: number, side: 'long' | 'short', leverage: number): number {
    const liquidationThreshold = 0.9; // 90% of collateral
    const priceMove = entryPrice * (1 - liquidationThreshold) / leverage;
    return side === 'long' ? entryPrice - priceMove : entryPrice + priceMove;
  }
}

export function createGainsPolygonAdapter(rpcUrl: string, privateKey?: `0x${string}`): GainsAdapter {
  return new GainsAdapter({
    chain: polygon,
    tradingAddress: '0x6e7E2d91D6a5Df5BfB7bD0DC892AA1e8E4F2c5De',
    priceAggregatorAddress: '0xE28E9f46f9E2A0F2D68F3C02821b9E5b4A6b4F7D',
    fundingFeesAddress: '0x4E3B1c1C3e6F5D0C2f1A2B3D4e5F6A7b8c9D0e1F',
    rpcUrl,
    walletPrivateKey: privateKey,
  });
}

export function createGainsArbitrumAdapter(rpcUrl: string, privateKey?: `0x${string}`): GainsAdapter {
  return new GainsAdapter({
    chain: arbitrum,
    tradingAddress: '0x298a695906e16F5faCE8e6916A2d3c6F3B8f1A3D',
    priceAggregatorAddress: '0x7C1F4B8e3c5D2E1F8B3A4c5D6E7F8A9B0c1D2e3F',
    fundingFeesAddress: '0x8D2F5B9A1c3E4F5B6A7c8D9E0f1A2B3c4D5E6F7A',
    rpcUrl,
    walletPrivateKey: privateKey,
  });
}
