import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits, Address } from 'viem';
import { optimism } from 'viem/chains';
import { BasePerpAdapter, PerpPosition, PerpOrderParams, PerpMarketInfo } from '../perp-adapter.js';
import WebSocket from 'ws';

// Kwenta (Synthetix Perps V2) Contract ABIs
const PERP_MARKET_ABI = parseAbi([
  'function submitOffchainDelayedOrder(int256 sizeDelta, uint256 desiredTimeDelta) external',
  'function submitOffchainDelayedOrderWithTracking(int256 sizeDelta, uint256 desiredTimeDelta, bytes32 trackingCode) external',
  'function closePosition(uint256 desiredTimeDelta) external',
  'function positions(address account) view returns ((uint64 id, uint64 lastFundingIndex, uint128 margin, uint128 lastPrice, int128 size))',
  'function assetPrice() view returns (uint256, bool)',
  'function currentFundingRate() view returns (int256)',
  'function marketKey() view returns (bytes32)',
]);

const PERP_SETTINGS_ABI = parseAbi([
  'function maxLeverage(bytes32 marketKey) view returns (uint256)',
  'function minInitialMargin() view returns (uint256)',
  'function liquidationFeeRatio() view returns (uint256)',
]);

interface KwentaConfig {
  rpcUrl: string;
  settingsAddress: Address;
  walletPrivateKey?: `0x${string}`;
}

interface KwentaMarket {
  address: Address;
  key: string;
  symbol: string;
}

export class KwentaAdapter extends BasePerpAdapter {
  private publicClient: any;
  private walletClient: any;
  private config: KwentaConfig;
  private ws?: WebSocket;
  private markets: Map<string, KwentaMarket> = new Map();
  private positionSubscriptions: Set<string> = new Set();
  private marketSubscriptions: Set<string> = new Set();
  private pollingInterval?: NodeJS.Timeout;

  constructor(config: KwentaConfig) {
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
    // Kwenta supported markets on Optimism
    this.markets.set('ETH/USD', {
      address: '0x2B3bb4c683BFc5239B029131EEf3B1d214478d93',
      key: 'sETHPERP',
      symbol: 'ETH/USD',
    });
    this.markets.set('BTC/USD', {
      address: '0x59b007E9ea8F89b069c43F8f45834d30853e3699',
      key: 'sBTCPERP',
      symbol: 'BTC/USD',
    });
    this.markets.set('LINK/USD', {
      address: '0x31A1659Ca00F617E86Dc765B6494Afe70a5A9c1A',
      key: 'sLINKPERP',
      symbol: 'LINK/USD',
    });
    this.markets.set('SOL/USD', {
      address: '0x0EA09D97b4084d859328ec4bF8eBCF9ecCA26F1D',
      key: 'sSOLPERP',
      symbol: 'SOL/USD',
    });
  }

  async connect(): Promise<void> {
    await super.connect();
    this.connectWebSocket();
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.disconnectWebSocket();
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
    const sizeDelta = parseUnits(
      (params.side === 'long' ? params.size : -params.size).toString(),
      18
    );

    // Calculate required margin
    const positionValue = params.size * markPrice;
    const margin = positionValue / leverage;
    const marginWei = parseUnits(margin.toString(), 18);

    // Submit delayed order (Kwenta uses Chainlink oracle for execution)
    const hash = await this.walletClient.writeContract({
      address: market.address,
      abi: PERP_MARKET_ABI,
      functionName: 'submitOffchainDelayedOrderWithTracking',
      args: [sizeDelta, 2n, '0x4b57454e5441000000000000000000000000000000000000000000000000000'], // KWENTA tracking code
      value: marginWei,
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
      collateral: margin,
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
      const sizeDeltaWei = parseUnits(
        (position.side === 'long' ? sizeDelta : -sizeDelta).toString(),
        18
      );

      await this.walletClient.writeContract({
        address: market.address,
        abi: PERP_MARKET_ABI,
        functionName: 'submitOffchainDelayedOrderWithTracking',
        args: [sizeDeltaWei, 2n, '0x4b57454e5441000000000000000000000000000000000000000000000000000'],
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
      const closeSize = parseUnits(
        (position.side === 'long' ? -size : size).toString(),
        18
      );
      await this.walletClient.writeContract({
        address: market.address,
        abi: PERP_MARKET_ABI,
        functionName: 'submitOffchainDelayedOrderWithTracking',
        args: [closeSize, 2n, '0x4b57454e5441000000000000000000000000000000000000000000000000000'],
      });
    } else {
      // Full close
      await this.walletClient.writeContract({
        address: market.address,
        abi: PERP_MARKET_ABI,
        functionName: 'closePosition',
        args: [2n], // 2 seconds desired time delta
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

    const [price, invalid] = await this.publicClient.readContract({
      address: market.address,
      abi: PERP_MARKET_ABI,
      functionName: 'assetPrice',
    });

    if (invalid) {
      throw new Error(`Price feed invalid for ${symbol}`);
    }

    return parseFloat(formatUnits(price, 18));
  }

  async getFundingRate(symbol: string): Promise<number> {
    const market = this.markets.get(symbol);
    if (!market) {
      throw new Error(`Market ${symbol} not found`);
    }

    const fundingRate = await this.publicClient.readContract({
      address: market.address,
      abi: PERP_MARKET_ABI,
      functionName: 'currentFundingRate',
    });

    // Convert from per-second to per-hour
    return parseFloat(formatUnits(fundingRate, 18)) * 3600;
  }

  async getMaxLeverage(symbol: string): Promise<number> {
    const market = this.markets.get(symbol);
    if (!market) {
      throw new Error(`Market ${symbol} not found`);
    }

    const marketKeyBytes = `0x${Buffer.from(market.key).toString('hex').padEnd(64, '0')}` as `0x${string}`;
    const maxLeverage = await this.publicClient.readContract({
      address: this.config.settingsAddress,
      abi: PERP_SETTINGS_ABI,
      functionName: 'maxLeverage',
      args: [marketKeyBytes],
    });

    return parseFloat(formatUnits(maxLeverage, 18));
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
      minSize: 0.01,
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'prices',
        market: symbol,
      }));
    }
  }

  unsubscribeFromMarket(symbol: string): void {
    this.marketSubscriptions.delete(symbol);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'prices',
        market: symbol,
      }));
    }
  }

  private connectWebSocket(): void {
    // Connect to Kwenta's WebSocket for real-time price updates
    this.ws = new WebSocket('wss://api.kwenta.io/v2/ws');

    this.ws.on('open', () => {
      console.log('Kwenta WebSocket connected');
      this.marketSubscriptions.forEach(symbol => this.subscribeToMarket(symbol));
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('Kwenta WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('Kwenta WebSocket closed, reconnecting...');
      setTimeout(() => this.connectWebSocket(), 5000);
    });
  }

  private disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  private handleWebSocketMessage(message: any): void {
    if (message.type === 'price_update') {
      const symbol = message.market;
      this.emitMarketUpdate(symbol, {
        markPrice: parseFloat(message.price),
        indexPrice: parseFloat(message.indexPrice),
      });
    }
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
  }

  private async fetchPositionData(positionId: string): Promise<PerpPosition> {
    const [address, symbol] = positionId.split('-');
    const market = this.markets.get(symbol);
    if (!market) {
      throw new Error(`Market ${symbol} not found`);
    }

    const positionData = await this.publicClient.readContract({
      address: market.address,
      abi: PERP_MARKET_ABI,
      functionName: 'positions',
      args: [address as Address],
    });

    const size = parseFloat(formatUnits(positionData.size, 18));
    const markPrice = await this.getMarkPrice(symbol);
    const entryPrice = parseFloat(formatUnits(positionData.lastPrice, 18));
    const margin = parseFloat(formatUnits(positionData.margin, 18));
    
    const pnl = (markPrice - entryPrice) * Math.abs(size);
    const leverage = (Math.abs(size) * markPrice) / margin;

    return {
      id: positionId,
      symbol,
      side: size > 0 ? 'long' : 'short',
      size: Math.abs(size),
      entryPrice,
      markPrice,
      leverage,
      collateral: margin,
      unrealizedPnl: size > 0 ? pnl : -pnl,
      liquidationPrice: this.calculateLiquidationPrice(entryPrice, size > 0 ? 'long' : 'short', leverage),
      fundingRate: await this.getFundingRate(symbol),
      timestamp: Date.now(),
    };
  }

  private calculateLiquidationPrice(entryPrice: number, side: 'long' | 'short', leverage: number): number {
    const liquidationThreshold = 0.95; // 95% of margin
    const priceMove = entryPrice * (1 - liquidationThreshold) / leverage;
    return side === 'long' ? entryPrice - priceMove : entryPrice + priceMove;
  }
}

export function createKwentaAdapter(rpcUrl: string, privateKey?: `0x${string}`): KwentaAdapter {
  return new KwentaAdapter({
    rpcUrl,
    settingsAddress: '0x649F44CAC3276557D03223Dbf6395Af65b11c11c',
    walletPrivateKey: privateKey,
  });
}
