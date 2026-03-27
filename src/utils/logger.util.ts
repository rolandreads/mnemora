import pino from 'pino';
import { config } from '../config.js';
import type { Logger } from '../types.js';
import { getCorrelationId } from './runtime.util.js';

enum LogLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
  FATAL = 60,
}

function getRequestContext(): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  const correlationId = getCorrelationId();
  if (correlationId) {
    context.correlationId = correlationId;
  }

  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    context.memoryUsage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    };
  }

  return context;
}

class PinoLogger implements Logger {
  private logger: pino.Logger;

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  private enrichLogData(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      ...getRequestContext(),
    };
  }

  trace(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.trace(data, message);
  }

  debug(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.debug(data, message);
  }

  info(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.info(data, message);
  }

  warn(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.warn(data, message);
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    if (error instanceof Error) {
      this.logger.error({ ...data, err: error }, message);
    } else if (error !== undefined) {
      this.logger.error({ ...data, error }, message);
    } else {
      this.logger.error(data, message);
    }
  }

  fatal(message: string, error?: Error | unknown, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    if (error instanceof Error) {
      this.logger.fatal({ ...data, err: error }, message);
    } else if (error !== undefined) {
      this.logger.fatal({ ...data, error }, message);
    } else {
      this.logger.fatal(data, message);
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    const enrichedBindings = {
      ...bindings,
      ...getRequestContext(),
    };
    return new PinoLogger(this.logger.child(enrichedBindings));
  }

  async flush(): Promise<void> {
    return Promise.resolve();
  }
}

function createLogger(options?: { level?: LogLevel | string; context?: Record<string, unknown> }): Logger {
  const level = options?.level ?? config.logging.level;

  let levelString: string;
  if (typeof level === 'string') {
    levelString = level;
  } else {
    const levelMap: Record<LogLevel, string> = {
      [LogLevel.TRACE]: 'trace',
      [LogLevel.DEBUG]: 'debug',
      [LogLevel.INFO]: 'info',
      [LogLevel.WARN]: 'warn',
      [LogLevel.ERROR]: 'error',
      [LogLevel.FATAL]: 'fatal',
    };
    levelString = levelMap[level] ?? 'info';
  }

  const pinoOptions: pino.LoggerOptions = {
    level: levelString,
    base: {
      ...getRequestContext(),
      ...(options?.context ?? {}),
    },
  };

  const pinoLogger = pino(pinoOptions);

  return new PinoLogger(pinoLogger);
}

export const logger = createLogger();
