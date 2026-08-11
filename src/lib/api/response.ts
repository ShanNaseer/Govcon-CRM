import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { AppError, ERROR_CODES, type ApiErrorBody, type ErrorCode, zodErrorDetails } from "@/lib/api/errors";
import { describeError, logger } from "@/lib/logger";

/** Success response with an optional non-200 status. */
export function jsonOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function jsonError(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

/**
 * Prisma error codes we can translate into a meaningful client-facing response.
 * Everything else is treated as an opaque database failure.
 * @see https://www.prisma.io/docs/reference/api-reference/error-reference
 */
function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case "P2002": {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(", ") : undefined;
      return AppError.conflict(
        fields ? `A record with this ${fields} already exists` : "A record with these values already exists",
      );
    }
    case "P2025":
      return AppError.notFound("Record");
    case "P2003":
      return AppError.validation("A referenced record does not exist");
    default:
      return new AppError("DATABASE_ERROR", "The request could not be completed");
  }
}

/** Maps any thrown value to a safe, logged HTTP response. */
export function handleRouteError(error: unknown, route: string): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    // Client-caused failures are expected; log at warn without a stack.
    logger.warn("Request rejected", { route, code: error.code, message: error.message });
    return jsonError(error.code, error.message, error.status, error.details);
  }

  if (error instanceof z.ZodError) {
    logger.warn("Request validation failed", { route, issues: error.issues.length });
    return jsonError(ERROR_CODES.VALIDATION_ERROR, "Invalid request", 400, zodErrorDetails(error));
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrismaError(error);
    logger.error("Database request failed", { route, prismaCode: error.code, message: mapped.message });
    return jsonError(mapped.code, mapped.message, mapped.status, mapped.details);
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    // The message can contain the connection string — log our own text instead.
    logger.error("Database unavailable", { route, name: (error as Error).name });
    return jsonError(ERROR_CODES.DATABASE_ERROR, "The database is currently unavailable", 503);
  }

  logger.error("Unhandled route error", { route, ...describeError(error) });
  return jsonError(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500);
}

/**
 * Wraps a route handler so no unhandled rejection can leak an internal error.
 * Handlers stay focused on the happy path and throw `AppError` for the rest.
 */
export function withRouteErrorHandling<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleRouteError(error, route);
    }
  };
}

/** Parses a JSON request body, turning malformed JSON into a validation error. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw AppError.validation("Request body must be valid JSON");
  }
}
