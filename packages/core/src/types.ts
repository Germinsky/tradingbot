import { z } from 'zod';

// Market data schemas
export const MarketDataSchema = z.object({
  symbol: z.string(),
  price: z.number().positive(),
  volume: z.number().nonnegative(),
  timestamp: z.number(),
});

export type MarketData = z.infer<typeof MarketDataSchema>;

// Order schemas
export const OrderSideSchema = z.enum(['buy', 'sell']);
export const OrderTypeSchema = z.enum(['market', 'limit', 'stop']);
export const OrderStatusSchema = z.enum(['pending', 'filled', 'cancelled', 'rejected']);

export const OrderSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  quantity: z.number().positive(),
  price: z.number().positive().optional(),
  status: OrderStatusSchema,
  timestamp: z.number(),
});

export type Order = z.infer<typeof OrderSchema>;
export type OrderSide = z.infer<typeof OrderSideSchema>;
export type OrderType = z.infer<typeof OrderTypeSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

// Position schema
export const PositionSchema = z.object({
  symbol: z.string(),
  quantity: z.number(),
  entryPrice: z.number().positive(),
  currentPrice: z.number().positive(),
  unrealizedPnL: z.number(),
  realizedPnL: z.number(),
  timestamp: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

// Strategy interface
export interface Strategy {
  name: string;
  initialize(): Promise<void>;
  onMarketData(data: MarketData): Promise<Order | null>;
  onOrderFilled(order: Order): Promise<void>;
  shutdown(): Promise<void>;
}

// Exchange interface
export interface Exchange {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getMarketData(symbol: string): Promise<MarketData>;
  submitOrder(order: Omit<Order, 'id' | 'status' | 'timestamp'>): Promise<Order>;
  getPosition(symbol: string): Promise<Position | null>;
  subscribeMarketData(symbol: string, callback: (data: MarketData) => void): void;
}

// Config schema
export const ConfigSchema = z.object({
  exchange: z.object({
    name: z.string(),
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    rpcUrl: z.string().url().optional(),
  }),
  strategy: z.object({
    name: z.string(),
    params: z.record(z.unknown()).optional(),
  }),
  risk: z.object({
    maxPositionSize: z.number().positive(),
    maxDrawdown: z.number().positive(),
    stopLossPercent: z.number().positive(),
    takeProfitPercent: z.number().positive(),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    outputFile: z.string().optional(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
