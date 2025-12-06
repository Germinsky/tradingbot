import { EventEmitter } from 'events';

export interface PerpPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  collateral: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  fundingRate: number;
  timestamp: number;
}

export interface PerpOrderParams {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  leverage?: number;
  slippage?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface PerpMarketInfo {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  openInterest: number;
  maxLeverage: number;
  minSize: number;
  available: boolean;
}

export interface PerpAdapter extends EventEmitter {
  // Core position management
  openPosition(params: PerpOrderParams): Promise<PerpPosition>;
  adjustPosition(positionId: string, params: Partial<PerpOrderParams>): Promise<PerpPosition>;
  closePosition(positionId: string, size?: number): Promise<void>;
  
  // Market data
  getMarkPrice(symbol: string): Promise<number>;
  getFundingRate(symbol: string): Promise<number>;
  getMaxLeverage(symbol: string): Promise<number>;
  getMarketInfo(symbol: string): Promise<PerpMarketInfo>;
  
  // Position queries
  getPosition(positionId: string): Promise<PerpPosition>;
  getPositions(): Promise<PerpPosition[]>;
  
  // Real-time streaming
  subscribeToPosition(positionId: string): void;
  unsubscribeFromPosition(positionId: string): void;
  subscribeToMarket(symbol: string): void;
  unsubscribeFromMarket(symbol: string): void;
  
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export abstract class BasePerpAdapter extends EventEmitter implements PerpAdapter {
  protected connected: boolean = false;
  protected positions: Map<string, PerpPosition> = new Map();
  
  abstract openPosition(params: PerpOrderParams): Promise<PerpPosition>;
  abstract adjustPosition(positionId: string, params: Partial<PerpOrderParams>): Promise<PerpPosition>;
  abstract closePosition(positionId: string, size?: number): Promise<void>;
  abstract getMarkPrice(symbol: string): Promise<number>;
  abstract getFundingRate(symbol: string): Promise<number>;
  abstract getMaxLeverage(symbol: string): Promise<number>;
  abstract getMarketInfo(symbol: string): Promise<PerpMarketInfo>;
  
  async getPosition(positionId: string): Promise<PerpPosition> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }
    return position;
  }
  
  async getPositions(): Promise<PerpPosition[]> {
    return Array.from(this.positions.values());
  }
  
  abstract subscribeToPosition(positionId: string): void;
  abstract unsubscribeFromPosition(positionId: string): void;
  abstract subscribeToMarket(symbol: string): void;
  abstract unsubscribeFromMarket(symbol: string): void;
  
  async connect(): Promise<void> {
    this.connected = true;
    this.emit('connected');
  }
  
  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected');
  }
  
  protected emitPositionUpdate(position: PerpPosition): void {
    this.positions.set(position.id, position);
    this.emit('positionUpdate', position);
  }
  
  protected emitMarketUpdate(symbol: string, data: Partial<PerpMarketInfo>): void {
    this.emit('marketUpdate', { symbol, ...data });
  }
}
