import { EventEmitter } from 'events';

export class Logger {
  private static instance: Logger;
  private emitter: EventEmitter;
  private level: 'debug' | 'info' | 'warn' | 'error';

  private constructor(level: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.emitter = new EventEmitter();
    this.level = level;
  }

  static getInstance(level?: 'debug' | 'info' | 'warn' | 'error'): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(level);
    }
    return Logger.instance;
  }

  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.level = level;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: unknown): void {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(meta !== undefined && meta !== null ? { meta } : {}),
    };

    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, meta || '');
    this.emitter.emit('log', logEntry);
  }

  debug(message: string, meta?: unknown): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log('error', message, meta);
  }

  on(event: 'log', listener: (entry: unknown) => void): void {
    this.emitter.on(event, listener);
  }
}

export const logger = Logger.getInstance();
