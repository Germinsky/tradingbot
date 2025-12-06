import { create } from 'zustand';

export interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price?: number;
  status: 'pending' | 'filled' | 'cancelled';
  timestamp: number;
}

export interface BotState {
  running: boolean;
  equity: number;
  positions: Position[];
  orders: Order[];
  equityHistory: { timestamp: number; equity: number }[];
}

interface TradingStore {
  botState: BotState;
  darkMode: boolean;
  setBotState: (state: BotState) => void;
  addOrder: (order: Order) => void;
  updatePosition: (position: Position) => void;
  addEquityPoint: (point: { timestamp: number; equity: number }) => void;
  toggleDarkMode: () => void;
}

export const useTradingStore = create<TradingStore>((set) => ({
  botState: {
    running: false,
    equity: 10000,
    positions: [],
    orders: [],
    equityHistory: [{ timestamp: Date.now(), equity: 10000 }],
  },
  darkMode: true,
  setBotState: (state) => set({ 
    botState: {
      ...state,
      equityHistory: state.equityHistory || [{ timestamp: Date.now(), equity: state.equity || 10000 }],
    }
  }),
  addOrder: (order) =>
    set((prev) => ({
      botState: { ...prev.botState, orders: [...prev.botState.orders, order] },
    })),
  updatePosition: (position) =>
    set((prev) => {
      const existingIndex = prev.botState.positions.findIndex((p) => p.symbol === position.symbol);
      const positions =
        existingIndex >= 0
          ? prev.botState.positions.map((p, i) => (i === existingIndex ? position : p))
          : [...prev.botState.positions, position];
      return { botState: { ...prev.botState, positions } };
    }),
  addEquityPoint: (point) =>
    set((prev) => ({
      botState: {
        ...prev.botState,
        equityHistory: [...prev.botState.equityHistory, point],
        equity: point.equity,
      },
    })),
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
}));
