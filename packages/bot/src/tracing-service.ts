/**
 * OpenTelemetry Tracing Service
 * Distributed tracing with Jaeger export
 */

import { logger } from '@trading-bot/core';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

export interface TracingConfig {
  serviceName: string;
  jaegerEndpoint?: string;
  enabled?: boolean;
  sampleRate?: number;
}

export class TracingService {
  private provider: NodeTracerProvider;
  private tracer: any;
  private enabled: boolean;

  constructor(config: TracingConfig) {
    this.enabled = config.enabled !== false;

    if (!this.enabled) {
      logger.info('Tracing disabled');
      return;
    }

    // Initialize provider with resource attributes
    this.provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development'
      })
    });

    // Configure Jaeger exporter
    const jaegerEndpoint = config.jaegerEndpoint || process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces';
    const exporter = new JaegerExporter({
      endpoint: jaegerEndpoint
    });

    // Add batch span processor
    this.provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
      maxQueueSize: 1000,
      maxExportBatchSize: 100,
      scheduledDelayMillis: 5000
    }));

    // Register provider
    this.provider.register();

    // Get tracer
    this.tracer = trace.getTracer(config.serviceName);

    // Register instrumentations for automatic tracing
    registerInstrumentations({
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingPaths: ['/health', '/metrics']
        }),
        new ExpressInstrumentation()
      ]
    });

    logger.info('OpenTelemetry tracing initialized', {
      jaegerEndpoint,
      serviceName: config.serviceName
    });
  }

  /**
   * Create a new span
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span | null {
    if (!this.enabled) {
      return null;
    }

    const span = this.tracer.startSpan(name, {
      attributes: {
        'bot.version': process.env.npm_package_version || '0.1.0',
        ...attributes
      }
    });

    return span;
  }

  /**
   * Execute function with tracing
   */
  async traceAsync<T>(
    name: string,
    fn: (span: Span | null) => Promise<T>,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    if (!this.enabled) {
      return fn(null);
    }

    const span = this.startSpan(name, attributes);
    
    try {
      const result = await fn(span);
      span?.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      span?.recordException(error as Error);
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Trace order execution
   */
  async traceOrder<T>(
    orderId: string,
    symbol: string,
    side: string,
    fn: (span: Span | null) => Promise<T>
  ): Promise<T> {
    return this.traceAsync(
      'order.execute',
      fn,
      {
        'order.id': orderId,
        'order.symbol': symbol,
        'order.side': side
      }
    );
  }

  /**
   * Trace strategy execution
   */
  async traceStrategy<T>(
    strategyName: string,
    chain: string,
    fn: (span: Span | null) => Promise<T>
  ): Promise<T> {
    return this.traceAsync(
      'strategy.execute',
      fn,
      {
        'strategy.name': strategyName,
        'strategy.chain': chain
      }
    );
  }

  /**
   * Trace exchange operation
   */
  async traceExchange<T>(
    exchange: string,
    operation: string,
    fn: (span: Span | null) => Promise<T>
  ): Promise<T> {
    return this.traceAsync(
      `exchange.${operation}`,
      fn,
      {
        'exchange.name': exchange,
        'exchange.operation': operation
      }
    );
  }

  /**
   * Add event to current span
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    if (!this.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    span?.addEvent(name, attributes);
  }

  /**
   * Set attribute on current span
   */
  setAttribute(key: string, value: string | number | boolean): void {
    if (!this.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    span?.setAttribute(key, value);
  }

  /**
   * Record exception on current span
   */
  recordException(error: Error): void {
    if (!this.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    span?.recordException(error);
    span?.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  /**
   * Shutdown tracing provider
   */
  async shutdown(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    logger.info('Shutting down tracing service');
    await this.provider.shutdown();
  }

  /**
   * Create child span
   */
  startChildSpan(
    parentSpan: Span | null,
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): Span | null {
    if (!this.enabled || !parentSpan) {
      return null;
    }

    return this.tracer.startSpan(
      name,
      {
        attributes,
        parent: parentSpan
      }
    );
  }
}
