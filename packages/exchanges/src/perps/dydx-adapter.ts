import { createPublicClient, http, defineChain } from 'viem';
import { BasePerpAdapter, PerpPosition, PerpOrderParams, PerpMarketInfo } from '../perp-adapter.js';
import WebSocket from 'ws';

// Define dYdX V4 custom chain (Cosmos-based)
export const dydxChain = defineChain({
  id: 999999,
  name: 'dYdX Chain',
  network: 'dydx',
  nativeCurrency: {
    decimals: 18,
    name: 'dYdX',
    symbol: 'DYDX',
  },
  rpcUrls: {
    default: {
      http: ['https://dydx-ops-rpc.kingnodes.com'],
      webSocket: ['wss://dydx-ops-rpc.kingnodes.com/websocket'],
    },
    public: {
      http: ['https://dydx-ops-rpc.kingnodes.com'],
      webSocket: ['wss://dydx-ops-rpc.kingnodes/websocket'],
    },
  },
  blockExplorers: {
    default: { name: 'Mintscan', url: 'https://www.mintscan.io/dydx' },
  },
});

interface DYDXConfig {
  apiUrl: string;
  wsUrl: string;
  mnemonic?: string;
}

interface DYDXOrder {
  clientId: string;
  type: 'MARKET' | 'LIMIT';
  side: 'BUY' | 'SELL';
  size: string;
  price?: string;
  timeInForce: 'GTT' | 'IOC' | 'FOK';
  postOnly?: boolean;
  reduceOnly?: boolean;
}

export class DYDXAdapter extends BasePerpAdapter {
  private config: DYDXConfig;
  private ws?: WebSocket;
  private publicClient: any;
  private accountAddress?: string;
  private positionSubscriptions: Set<string> = new Set();
  private marketSubscriptions: Set<string> = new Set();

  constructor(config: DYDXConfig) {
    super();
    this.config = config;
    this.publicClient = createPublicClient({
      chain: dydxChain,
      transport: http(config.apiUrl),
    });
  }

  async connect(): Promise<void> {
    await super.connect();
    this.connectWebSocket();
  }

  async disconnect(): Promise<void> {
    this.disconnectWebSocket();
    await super.disconnect();
  }

  async openPosition(params: PerpOrderParams): Promise<PerpPosition> {
    if (!this.accountAddress) {
      throw new Error('Account not configured');
    }

    const market = this.getMarketId(params.symbol);
    const clientId = Date.now().toString();
    
    const order: DYDXOrder = {
      clientId,
      type: 'MARKET',
      side: params.side === 'long' ? 'BUY' : 'SELL',
      size: params.size.toString(),
      timeInForce: 'IOC',
      postOnly: false,
    };

    const response = await fetch(`${this.config.apiUrl}/v4/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order,
        subaccountNumber: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to open position: ${await response.text()}`);
    }

    const result = await response.json() as any;
    const markPrice = await this.getMarkPrice(params.symbol);
    const leverage = params.leverage || 10;

    const position: PerpPosition = {
      id: result.id || clientId,
      symbol: params.symbol,
      side: params.side,
      size: params.size,
      entryPrice: markPrice,
      markPrice,
      leverage,
      collateral: params.size / leverage,
      unrealizedPnl: 0,
      liquidationPrice: this.calculateLiquidationPrice(markPrice, params.side, leverage),
      fundingRate: await this.getFundingRate(params.symbol),
      timestamp: Date.now(),
    };

    this.emitPositionUpdate(position);
    return position;
  }

  async adjustPosition(positionId: string, params: Partial<PerpOrderParams>): Promise<PerpPosition> {
    const position = await this.getPosition(positionId);
    
    if (params.size && params.size !== position.size) {
      const sizeDelta = params.size - position.size;
      const side = sizeDelta > 0 ? (position.side === 'long' ? 'BUY' : 'SELL') : (position.side === 'long' ? 'SELL' : 'BUY');
      
      const order: DYDXOrder = {
        clientId: Date.now().toString(),
        type: 'MARKET',
        side,
        size: Math.abs(sizeDelta).toString(),
        timeInForce: 'IOC',
        reduceOnly: false,
      };

      await fetch(`${this.config.apiUrl}/v4/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, subaccountNumber: 0 }),
      });
    }

    const updatedPosition = await this.fetchPositionData(position.symbol);
    this.emitPositionUpdate(updatedPosition);
    return updatedPosition;
  }

  async closePosition(positionId: string, size?: number): Promise<void> {
    const position = await this.getPosition(positionId);
    const closeSize = size || position.size;
    const side = position.side === 'long' ? 'SELL' : 'BUY';
    
    const order: DYDXOrder = {
      clientId: Date.now().toString(),
      type: 'MARKET',
      side,
      size: closeSize.toString(),
      timeInForce: 'IOC',
      reduceOnly: true,
    };

    await fetch(`${this.config.apiUrl}/v4/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order, subaccountNumber: 0 }),
    });

    if (!size || size >= position.size) {
      this.positions.delete(positionId);
      this.emit('positionClosed', { positionId, symbol: position.symbol });
    }
  }

  async getMarkPrice(symbol: string): Promise<number> {
    const market = this.getMarketId(symbol);
    const response = await fetch(`${this.config.apiUrl}/v4/perpetualMarkets/${market}`);
    const data = await response.json() as any;
    return parseFloat(data.market?.oraclePrice || '0');
  }

  async getFundingRate(symbol: string): Promise<number> {
    const market = this.getMarketId(symbol);
    const response = await fetch(`${this.config.apiUrl}/v4/perpetualMarkets/${market}/historicalFunding`);
    const data = await response.json() as any;
    const latest = data.historicalFunding?.[0];
    return latest ? parseFloat(latest.rate) : 0;
  }

  async getMaxLeverage(symbol: string): Promise<number> {
    const market = this.getMarketId(symbol);
    const response = await fetch(`${this.config.apiUrl}/v4/perpetualMarkets/${market}`);
    const data = await response.json() as any;
    return parseFloat(data.market?.maxMarketLeverage || '20');
  }

  async getMarketInfo(symbol: string): Promise<PerpMarketInfo> {
    const market = this.getMarketId(symbol);
    const response = await fetch(`${this.config.apiUrl}/v4/perpetualMarkets/${market}`);
    const data = await response.json() as any;
    const marketData = data.market;

    return {
      symbol,
      markPrice: parseFloat(marketData.oraclePrice),
      indexPrice: parseFloat(marketData.indexPrice),
      fundingRate: await this.getFundingRate(symbol),
      nextFundingTime: new Date(marketData.nextFundingAt).getTime(),
      openInterest: parseFloat(marketData.openInterest),
      maxLeverage: parseFloat(marketData.maxMarketLeverage),
      minSize: parseFloat(marketData.minOrderSize),
      available: marketData.status === 'ACTIVE',
    };
  }

  subscribeToPosition(positionId: string): void {
    this.positionSubscriptions.add(positionId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'v4_subaccounts',
        id: positionId,
      }));
    }
  }

  unsubscribeFromPosition(positionId: string): void {
    this.positionSubscriptions.delete(positionId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'v4_subaccounts',
        id: positionId,
      }));
    }
  }

  subscribeToMarket(symbol: string): void {
    this.marketSubscriptions.add(symbol);
    if (this.ws?.readyState === WebSocket.OPEN) {
      const market = this.getMarketId(symbol);
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'v4_markets',
        id: market,
      }));
    }
  }

  unsubscribeFromMarket(symbol: string): void {
    this.marketSubscriptions.delete(symbol);
    if (this.ws?.readyState === WebSocket.OPEN) {
      const market = this.getMarketId(symbol);
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'v4_markets',
        id: market,
      }));
    }
  }

  private connectWebSocket(): void {
    this.ws = new WebSocket(this.config.wsUrl);

    this.ws.on('open', () => {
      console.log('dYdX WebSocket connected');
      // Resubscribe to all active subscriptions
      this.positionSubscriptions.forEach(id => this.subscribeToPosition(id));
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
      console.error('dYdX WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('dYdX WebSocket closed, reconnecting...');
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
    if (message.type === 'channel_data') {
      if (message.channel === 'v4_subaccounts') {
        this.handlePositionUpdate(message.contents);
      } else if (message.channel === 'v4_markets') {
        this.handleMarketUpdate(message.contents);
      }
    }
  }

  private async handlePositionUpdate(data: any): Promise<void> {
    try {
      const position = data.positions?.[0];
      if (position) {
        const symbol = this.getSymbolFromMarketId(position.market);
        const markPrice = await this.getMarkPrice(symbol);
        const size = parseFloat(position.size);
        const entryPrice = parseFloat(position.entryPrice);
        const unrealizedPnl = parseFloat(position.unrealizedPnl);
        
        const perpPosition: PerpPosition = {
          id: position.id,
          symbol,
          side: size > 0 ? 'long' : 'short',
          size: Math.abs(size),
          entryPrice,
          markPrice,
          leverage: Math.abs(size * markPrice / parseFloat(position.equity)),
          collateral: parseFloat(position.equity),
          unrealizedPnl,
          liquidationPrice: parseFloat(position.liquidationPrice),
          fundingRate: await this.getFundingRate(symbol),
          timestamp: Date.now(),
        };
        
        this.emitPositionUpdate(perpPosition);
      }
    } catch (error) {
      console.error('Error handling position update:', error);
    }
  }

  private handleMarketUpdate(data: any): void {
    try {
      const market = data.markets?.[0];
      if (market) {
        const symbol = this.getSymbolFromMarketId(market.id);
        this.emitMarketUpdate(symbol, {
          markPrice: parseFloat(market.oraclePrice),
          indexPrice: parseFloat(market.indexPrice),
          fundingRate: parseFloat(market.fundingRate),
        });
      }
    } catch (error) {
      console.error('Error handling market update:', error);
    }
  }

  private async fetchPositionData(symbol: string): Promise<PerpPosition> {
    if (!this.accountAddress) {
      throw new Error('Account not configured');
    }

    const response = await fetch(
      `${this.config.apiUrl}/v4/addresses/${this.accountAddress}/subaccountNumber/0`
    );
    const data = await response.json() as any;
    const positionData = data.subaccount?.openPerpetualPositions?.[this.getMarketId(symbol)];

    if (!positionData) {
      throw new Error(`No position found for ${symbol}`);
    }

    const size = parseFloat(positionData.size);
    const markPrice = await this.getMarkPrice(symbol);
    
    return {
      id: `${this.accountAddress}-${symbol}`,
      symbol,
      side: size > 0 ? 'long' : 'short',
      size: Math.abs(size),
      entryPrice: parseFloat(positionData.entryPrice),
      markPrice,
      leverage: Math.abs(size * markPrice / parseFloat(positionData.equity)),
      collateral: parseFloat(positionData.equity),
      unrealizedPnl: parseFloat(positionData.unrealizedPnl),
      liquidationPrice: parseFloat(positionData.liquidationPrice),
      fundingRate: await this.getFundingRate(symbol),
      timestamp: Date.now(),
    };
  }

  private getMarketId(symbol: string): string {
    const markets: Record<string, string> = {
      'BTC/USD': 'BTC-USD',
      'ETH/USD': 'ETH-USD',
      'SOL/USD': 'SOL-USD',
      'AVAX/USD': 'AVAX-USD',
    };
    return markets[symbol] || 'BTC-USD';
  }

  private getSymbolFromMarketId(marketId: string): string {
    return marketId.replace('-', '/');
  }

  private calculateLiquidationPrice(entryPrice: number, side: 'long' | 'short', leverage: number): number {
    const maintenanceMargin = 0.03; // 3%
    const priceMove = entryPrice * (1 - maintenanceMargin) / leverage;
    return side === 'long' ? entryPrice - priceMove : entryPrice + priceMove;
  }
}

export function createDYDXAdapter(apiUrl: string = 'https://indexer.dydx.trade', mnemonic?: string): DYDXAdapter {
  return new DYDXAdapter({
    apiUrl,
    wsUrl: 'wss://indexer.dydx.trade/v4/ws',
    mnemonic,
  });
}
