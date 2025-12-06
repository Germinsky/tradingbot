import { EventEmitter } from 'events';
import { Order, Position } from '@trading-bot/core';
import { RiskManager } from '@trading-bot/risk-engine';

/**
 * OHLCV Candle data structure
 */
export interface Candle {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
}

/**
 * Order execution/fill information
 */
export interface Execution {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  timestamp: number;
  executionId: string;
}

/**
 * Market order parameters
 */
export interface MarketOrder {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

/**
 * Limit order parameters
 */
export interface LimitOrder extends MarketOrder {
  price: number;
  postOnly?: boolean;
}

/**
 * Strategy execution mode
 */
export enum StrategyMode {
  BACKTEST = 'backtest',
  PAPER = 'paper',
  LIVE = 'live',
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  mode: StrategyMode;
  symbols: string[];
  params: Record<string, any>;
  riskConfig?: any;
  enableHotReload?: boolean;
}

/**
 * Strategy statistics
 */
export interface StrategyStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

/**
 * Abstract trading strategy interface
 */
export interface ITradingStrategy extends EventEmitter {
  readonly name: string;
  readonly version: string;
  readonly mode: StrategyMode;
  
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  onCandle(candle: Candle): void;
  onOrderFill(fill: Execution): void;
  onPositionUpdate(position: Position): void;
  
  getStats(): StrategyStats;
  reset(): void;
}

/**
 * Hot-reload configuration
 */
export interface HotReloadConfig {
  enabled: boolean;
  watchPaths: string[];
  debounceMs: number;
}

/**
 * DEX routing quote
 */
export interface DexQuote {
  protocol: '0x' | '1inch' | 'uniswap' | 'curve';
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  outputAmount: string;
  price: number;
  estimatedGas: string;
  route: Array<{
    protocol: string;
    percentage: number;
  }>;
}

/**
 * Perpetual funding rate data
 */
export interface FundingRate {
  symbol: string;
  protocol: string;
  rate: number;
  timestamp: number;
  nextFundingTime: number;
  predictedRate?: number;
}

/**
 * Statistical arbitrage signal
 */
export interface ArbitrageSignal {
  pair: [string, string];
  spread: number;
  zScore: number;
  halfLife: number;
  entryThreshold: number;
  exitThreshold: number;
  confidence: number;
}
