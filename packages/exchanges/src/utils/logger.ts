// Simple logger utility for exchanges package
// In production, this should use @trading-bot/core logger

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class SimpleLogger {
  private level: LogLevel = 'info';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  debug(message: string, meta?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, meta || '');
    }
  }

  info(message: string, meta?: unknown): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, meta || '');
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, meta || '');
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, error || '');
    }
  }
}

export const logger = new SimpleLogger();
