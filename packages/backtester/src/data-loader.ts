import { ParquetReader } from 'parquetjs';
import { request, gql } from 'graphql-request';
import * as fs from 'fs';
import * as path from 'path';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
}

export interface DataLoaderConfig {
  source: 'parquet' | 'thegraph';
  parquetPath?: string;
  graphEndpoint?: string;
  symbol: string;
  startTime: number;
  endTime: number;
  timeframe: string; // e.g., '1h', '5m', '1d'
}

export class DataLoader {
  private config: DataLoaderConfig;

  constructor(config: DataLoaderConfig) {
    this.config = config;
  }

  async loadCandles(): Promise<Candle[]> {
    if (this.config.source === 'parquet') {
      return this.loadFromParquet();
    } else {
      return this.loadFromTheGraph();
    }
  }

  private async loadFromParquet(): Promise<Candle[]> {
    if (!this.config.parquetPath) {
      throw new Error('Parquet path not specified');
    }

    const filePath = path.resolve(this.config.parquetPath);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Parquet file not found: ${filePath}`);
    }

    const reader = await ParquetReader.openFile(filePath);
    const cursor = reader.getCursor();
    const candles: Candle[] = [];

    let record = null;
    while (record = await cursor.next()) {
      const timestamp = Number(record.timestamp);
      
      // Filter by time range
      if (timestamp >= this.config.startTime && timestamp <= this.config.endTime) {
        candles.push({
          timestamp,
          open: Number(record.open),
          high: Number(record.high),
          low: Number(record.low),
          close: Number(record.close),
          volume: Number(record.volume),
          symbol: this.config.symbol,
        });
      }
    }

    await reader.close();
    
    // Sort by timestamp
    candles.sort((a, b) => a.timestamp - b.timestamp);
    
    return candles;
  }

  private async loadFromTheGraph(): Promise<Candle[]> {
    if (!this.config.graphEndpoint) {
      throw new Error('TheGraph endpoint not specified');
    }

    const query = gql`
      query GetCandles($symbol: String!, $startTime: Int!, $endTime: Int!, $timeframe: String!) {
        candles(
          where: {
            symbol: $symbol
            timestamp_gte: $startTime
            timestamp_lte: $endTime
            timeframe: $timeframe
          }
          orderBy: timestamp
          orderDirection: asc
          first: 10000
        ) {
          timestamp
          open
          high
          low
          close
          volume
          symbol
        }
      }
    `;

    const variables = {
      symbol: this.config.symbol,
      startTime: this.config.startTime,
      endTime: this.config.endTime,
      timeframe: this.config.timeframe,
    };

    try {
      const data = await request<{ candles: Candle[] }>(
        this.config.graphEndpoint,
        query,
        variables
      );

      return data.candles.map(c => ({
        timestamp: Number(c.timestamp),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
        symbol: c.symbol,
      }));
    } catch (error) {
      console.error('Error loading from TheGraph:', error);
      throw error;
    }
  }

  /**
   * Split candles into chunks by year for parallel processing
   */
  static splitByYear(candles: Candle[]): Map<number, Candle[]> {
    const yearMap = new Map<number, Candle[]>();

    for (const candle of candles) {
      const date = new Date(candle.timestamp);
      const year = date.getFullYear();

      if (!yearMap.has(year)) {
        yearMap.set(year, []);
      }
      yearMap.get(year)!.push(candle);
    }

    return yearMap;
  }

  /**
   * Validate candle data quality
   */
  static validateCandles(candles: Candle[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (candles.length === 0) {
      errors.push('No candles loaded');
      return { valid: false, errors, warnings };
    }

    // Check for gaps
    const expectedInterval = this.detectInterval(candles);
    for (let i = 1; i < candles.length; i++) {
      const gap = candles[i].timestamp - candles[i - 1].timestamp;
      if (gap > expectedInterval * 1.5) {
        warnings.push(
          `Gap detected between ${new Date(candles[i - 1].timestamp).toISOString()} and ${new Date(candles[i].timestamp).toISOString()}`
        );
      }
    }

    // Check for invalid prices
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
        errors.push(`Invalid prices at index ${i}, timestamp ${new Date(c.timestamp).toISOString()}`);
      }
      if (c.high < c.low) {
        errors.push(`High < Low at index ${i}, timestamp ${new Date(c.timestamp).toISOString()}`);
      }
      if (c.high < c.open || c.high < c.close) {
        errors.push(`High is not highest at index ${i}, timestamp ${new Date(c.timestamp).toISOString()}`);
      }
      if (c.low > c.open || c.low > c.close) {
        errors.push(`Low is not lowest at index ${i}, timestamp ${new Date(c.timestamp).toISOString()}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static detectInterval(candles: Candle[]): number {
    if (candles.length < 2) return 0;
    
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(10, candles.length); i++) {
      intervals.push(candles[i].timestamp - candles[i - 1].timestamp);
    }
    
    // Return median interval
    intervals.sort((a, b) => a - b);
    return intervals[Math.floor(intervals.length / 2)];
  }
}
