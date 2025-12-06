export interface PnLData {
  timestamp: number;
  realized: number;
  unrealized: number;
  fees: number;
  total: number;
}

export interface Position {
  id: string;
  symbol: string;
  chain: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  pnlPercentage: number;
}

export interface Strategy {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive' | 'error';
  enabled: boolean;
  trades: number;
  winRate: number;
  pnl: number;
  sharpeRatio?: number;
  lastUpdate: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookData {
  symbol: string;
  exchange: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface WebSocketMessage<T = unknown> {
  type: 'pnl_update' | 'position_update' | 'strategy_update' | 'orderbook_update' | 'connection_status';
  data: T;
  timestamp: number;
}

export interface ConnectionState {
  connected: boolean;
  authenticated: boolean;
  reconnecting: boolean;
  error?: string;
}

export interface DashboardStats {
  totalPnL: number;
  dailyPnL: number;
  openPositions: number;
  activeStrategies: number;
  totalTrades: number;
  winRate: number;
}
