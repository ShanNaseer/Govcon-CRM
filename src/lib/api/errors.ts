import { z } from "zod";

/**
 * Single source of truth for the API error contract.
 *
 * Every error response has the shape:
 *   { "error": { "code": "...", "message": "...", "details": { ... } } }
 *
 * Internal details (stack traces, SQL, connection strings, AWS metadata) are
 * logged server-side and never placed in the response body.
 */

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  STORAGE_ERROR: "STORAGE_ERROR",
  STORAGE_NOT_CONFIGURED: "STORAGE_NOT_CONFIGURED",
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  STORAGE_ERROR: 502,
  STORAGE_NOT_CONFIGURED: 503,
  DATABASE_ERROR: 503,
  INTERNAL_ERROR: 500,
};

/**
 * Error type that services and repositories throw. Route handlers translate it
 * into a response; anything else that escapes becomes a generic 500.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  static notFound(resource: string, id?: string): AppError {
    return new AppError("NOT_FOUND", id ? `${resource} '${id}' was not found` : `${resource} was not found`);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError("CONFLICT", message, details);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError("VALIDATION_ERROR", message, details);
  }

  static unauthorized(message = "Authentication is required"): AppError {
    return new AppError("UNAUTHORIZED", message);
  }

  /**
   * Authenticated, but not allowed. Distinct from `unauthorized` on purpose: a 401
   * tells the client to sign in, while a 403 tells it that signing in again will
   * not help.
   */
  static forbidden(message = "You do not have permission to do that"): AppError {
    return new AppError("FORBIDDEN", message);
  }
}

/** Converts a Zod failure into the `details` payload of a validation error. */
export function zodErrorDetails(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}
