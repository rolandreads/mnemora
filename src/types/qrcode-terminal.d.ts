/**
 * Type definitions for qrcode-terminal
 */

declare module 'qrcode-terminal' {
  export function generate(text: string, options?: { small?: boolean }): void;
}
