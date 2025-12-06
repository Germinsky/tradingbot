import { Worker } from 'worker_threads';
import * as path from 'path';
import { Candle, DataLoader } from './data-loader';
import { PerformanceMetrics, Trade, EquityPoint } from './metrics-calculator';

export interface WorkerTask {
  year: number;
  candles: Candle[];
  config: any;
}

export interface WorkerResult {
  year: number;
  trades: Trade[];
  equityCurve: EquityPoint[];
  finalEquity: number;
  error?: string;
}

export class ParallelBacktester {
  private workerPath: string;
  private maxWorkers: number;

  constructor(workerPath?: string, maxWorkers?: number) {
    this.workerPath = workerPath || path.join(__dirname, 'backtest-worker.js');
    this.maxWorkers = maxWorkers || require('os').cpus().length;
  }

  /**
   * Run backtest in parallel across years
   */
  async runParallel(
    candles: Candle[],
    config: any
  ): Promise<{
    trades: Trade[];
    equityCurve: EquityPoint[];
    yearResults: Map<number, WorkerResult>;
  }> {
    // Split candles by year
    const yearMap = DataLoader.splitByYear(candles);
    const years = Array.from(yearMap.keys()).sort();

    console.log(`🚀 Starting parallel backtest across ${years.length} years using ${this.maxWorkers} workers`);

    // Create tasks
    const tasks: WorkerTask[] = years.map(year => ({
      year,
      candles: yearMap.get(year)!,
      config,
    }));

    // Process in batches to limit concurrent workers
    const results: WorkerResult[] = [];
    for (let i = 0; i < tasks.length; i += this.maxWorkers) {
      const batch = tasks.slice(i, i + this.maxWorkers);
      const batchResults = await Promise.all(
        batch.map(task => this.runWorker(task))
      );
      results.push(...batchResults);
      
      console.log(`✅ Completed ${Math.min(i + this.maxWorkers, tasks.length)}/${tasks.length} years`);
    }

    // Check for errors
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('⚠️  Some years failed:', errors);
    }

    // Merge results
    const { trades, equityCurve, yearResults } = this.mergeResults(results, config.initialEquity);

    console.log(`✅ Parallel backtest complete: ${trades.length} trades, ${years.length} years`);

    return { trades, equityCurve, yearResults };
  }

  private runWorker(task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, {
        workerData: task,
      });

      worker.on('message', (result: WorkerResult) => {
        resolve(result);
      });

      worker.on('error', (error) => {
        resolve({
          year: task.year,
          trades: [],
          equityCurve: [],
          finalEquity: task.config.initialEquity,
          error: error.message,
        });
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          resolve({
            year: task.year,
            trades: [],
            equityCurve: [],
            finalEquity: task.config.initialEquity,
            error: `Worker exited with code ${code}`,
          });
        }
      });
    });
  }

  private mergeResults(
    results: WorkerResult[],
    initialEquity: number
  ): {
    trades: Trade[];
    equityCurve: EquityPoint[];
    yearResults: Map<number, WorkerResult>;
  } {
    // Sort by year
    results.sort((a, b) => a.year - b.year);

    const allTrades: Trade[] = [];
    const allEquityPoints: EquityPoint[] = [];
    const yearResults = new Map<number, WorkerResult>();

    let carryOverEquity = initialEquity;
    let highWaterMark = initialEquity;

    for (const result of results) {
      yearResults.set(result.year, result);

      // Adjust trades and equity points for carry-over equity
      const equityAdjustment = carryOverEquity - initialEquity;

      // Add adjusted trades
      for (const trade of result.trades) {
        allTrades.push(trade);
      }

      // Add adjusted equity points
      for (const point of result.equityCurve) {
        const adjustedEquity = point.equity + equityAdjustment;
        highWaterMark = Math.max(highWaterMark, adjustedEquity);
        const drawdown = highWaterMark - adjustedEquity;

        allEquityPoints.push({
          timestamp: point.timestamp,
          equity: adjustedEquity,
          highWaterMark,
          drawdown,
        });
      }

      // Update carry-over for next year
      carryOverEquity = result.finalEquity + equityAdjustment;
    }

    return {
      trades: allTrades,
      equityCurve: allEquityPoints,
      yearResults,
    };
  }

  /**
   * Run sequential backtest (single-threaded)
   */
  async runSequential(
    candles: Candle[],
    backtestFn: (candles: Candle[]) => Promise<{
      trades: Trade[];
      equityCurve: EquityPoint[];
    }>
  ): Promise<{
    trades: Trade[];
    equityCurve: EquityPoint[];
  }> {
    console.log('🔄 Running sequential backtest...');
    const result = await backtestFn(candles);
    console.log(`✅ Sequential backtest complete: ${result.trades.length} trades`);
    return result;
  }
}
