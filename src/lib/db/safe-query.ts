import "server-only";

import { describeError, logger } from "@/lib/logger";

/**
 * Runs a read query for a Server Component, converting an infrastructure failure
 * into a rendered error state instead of a crashed page.
 *
 * The scaffold is expected to run before anyone has provisioned PostgreSQL, so an
 * unreachable database must degrade to a visible message rather than an unhandled
 * exception. Only reads should use this — a failed write must surface to the caller.
 */
export async function safeQuery<T>(
  label: string,
  query: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    return { ok: true, data: await query() };
  } catch (error) {
    logger.error("Page query failed", { label, ...describeError(error) });
    return { ok: false };
  }
}

/** Message shown when a page cannot reach the database. Deliberately free of infrastructure detail. */
export const DATABASE_UNAVAILABLE_MESSAGE =
  "Could not reach the database. Check that DATABASE_URL points at a running PostgreSQL instance and that migrations have been applied.";
