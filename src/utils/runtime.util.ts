import { randomUUID } from 'crypto';

class CorrelationContext {
  private static storage = new Map<string, string>();

  static getCorrelationId(): string | undefined {
    return this.storage.get('correlationId');
  }

  static setCorrelationId(id: string): void {
    this.storage.set('correlationId', id);
  }

  static generateCorrelationId(): string {
    return randomUUID();
  }

  static initializeCorrelationId(): string {
    const existing = this.getCorrelationId();
    if (existing) {
      return existing;
    }

    const newId = this.generateCorrelationId();
    this.setCorrelationId(newId);
    return newId;
  }
}

export function getCorrelationId(): string | undefined {
  return CorrelationContext.getCorrelationId();
}

export function setCorrelationId(id: string): void {
  CorrelationContext.setCorrelationId(id);
}

export function initializeCorrelationId(): string {
  return CorrelationContext.initializeCorrelationId();
}
