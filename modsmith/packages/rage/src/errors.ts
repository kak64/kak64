/**
 * Error types for the RAGE resource library.
 *
 * @packageDocumentation
 */

/**
 * Thrown whenever a buffer cannot be interpreted as the RAGE structure the
 * caller asked for: bad magic, truncated data, an unsupported structure
 * variant, or a value that is out of range for the format.
 *
 * Readers in this package prefer throwing `RageFormatError` with a specific
 * message over returning partially-decoded / garbage data.
 */
export class RageFormatError extends Error {
  /** Short machine-readable discriminator, e.g. `"BAD_MAGIC"`. */
  readonly code: string;
  /** Byte offset the failure relates to, when known. */
  readonly offset?: number;

  constructor(message: string, options: { code?: string; offset?: number; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "RageFormatError";
    this.code = options.code ?? "RAGE_FORMAT";
    if (options.offset !== undefined) this.offset = options.offset;
  }
}

/**
 * Thrown when an input is structurally valid but uses a feature this library
 * does not (yet) implement — for example a BC7 texture asked to decode to RGBA,
 * or a skinned drawable handed to the static drawable writer.
 */
export class RageUnsupportedError extends RageFormatError {
  constructor(message: string, options: { code?: string; offset?: number; cause?: unknown } = {}) {
    super(message, { ...options, code: options.code ?? "UNSUPPORTED" });
    this.name = "RageUnsupportedError";
  }
}

/** Assert a condition, throwing {@link RageFormatError} when it does not hold. */
export function assertFormat(
  condition: unknown,
  message: string,
  options: { code?: string; offset?: number } = {},
): asserts condition {
  if (!condition) throw new RageFormatError(message, options);
}
