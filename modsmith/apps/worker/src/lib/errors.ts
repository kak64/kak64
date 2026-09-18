/**
 * A processing failure with a stable error code. `infrastructure: true` means the
 * failure was ours (credits are refunded either way, but the flag is surfaced to the user
 * and to admins); `retryable` hints that a retry may succeed.
 */
export class ProcessingError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly infrastructure: boolean;
  constructor(code: string, message: string, opts: { retryable?: boolean; infrastructure?: boolean } = {}) {
    super(message);
    this.name = "ProcessingError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.infrastructure = opts.infrastructure ?? false;
  }
}

export const fail = (code: string, message: string, opts?: { retryable?: boolean; infrastructure?: boolean }) => new ProcessingError(code, message, opts);

export function isProcessingError(e: unknown): e is ProcessingError {
  return e instanceof ProcessingError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "ProcessingError");
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled by user");
    this.name = "CancelledError";
  }
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Job exceeded the ${Math.round(ms / 60000)} minute limit`);
    this.name = "TimeoutError";
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : JSON.stringify(e);
}
