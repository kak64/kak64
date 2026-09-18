export type ApiSuccess<T> = { success: true; data: T; error: null };
export type ApiError = { success: false; data: null; error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data, error: null });
export const fail = (code: string, message: string, details?: unknown): ApiError => ({
  success: false,
  data: null,
  error: details === undefined ? { code, message } : { code, message, details },
});

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  USERNAME_TAKEN: "USERNAME_TAKEN",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  DISCORD_NOT_CONNECTED: "DISCORD_NOT_CONNECTED",
  INVALID_FILE: "INVALID_FILE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UPLOAD_EXPIRED: "UPLOAD_EXPIRED",
  MALICIOUS_ARCHIVE: "MALICIOUS_ARCHIVE",
  TOOL_DISABLED: "TOOL_DISABLED",
  JOB_NOT_CANCELLABLE: "JOB_NOT_CANCELLABLE",
  PAYMENT_ERROR: "PAYMENT_ERROR",
  WEBHOOK_INVALID: "WEBHOOK_INVALID",
  CSRF: "CSRF",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class ApiFailure extends Error {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}
