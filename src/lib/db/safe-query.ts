import "server-only";

import { classifyQueryError } from "@/lib/db/query-error";
import { describeError, logger } from "@/lib/logger";

/**
 * Runs a read query for a Server Component, converting an infrastructure failure
 * into a rendered error state instead of a crashed page.
 *
 * The scaffold is expected to run before anyone has provisioned PostgreSQL, so an
 * unreachable database must degrade to a visible message rather than an unhandled
 * exception. Only reads should use this — a failed write must surface to the caller.
 *
 * The returned `message` is classified from the underlying error. That matters:
 * reporting every failure as "could not reach the database" sends people to check
 * networking and credentials when the actual cause is often a stale generated
 * client after a schema change, which looks nothing like an outage.
 */

export { DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/db/query-error";

export type SafeQueryResult<T> = { ok: true; data: T } | { ok: false; message: string };

export async function safeQuery<T>(
  label: string,
  query: () => Promise<T>,
): Promise<SafeQueryResult<T>> {
  try {
    return { ok: true, data: await query() };
  } catch (error) {
    logger.error("Page query failed", { label, ...describeError(error) });
    return { ok: false, message: classifyQueryError(error) };
  }
}
