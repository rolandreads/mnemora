export interface BirthdayRecord {
  firstName: string;
  lastName?: string;
  birthday: Date;
  year?: number;
}

export interface Logger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: Error | unknown, ...args: unknown[]): void;
  fatal(message: string, error?: Error | unknown, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

export class QRAuthenticationRequiredError extends Error {
  public readonly qrCode: string;

  constructor(qrCode: string, message = 'WhatsApp QR code authentication required.') {
    super(message);
    this.name = 'QRAuthenticationRequiredError';
    this.qrCode = qrCode;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QRAuthenticationRequiredError);
    }
  }
}
