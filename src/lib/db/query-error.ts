/**
 * Classification of a failed database read into a message worth showing.
 *
 * Kept out of safe-query.ts, which carries the `server-only` guard: this is pure
 * string analysis with no request or connection state, and separating it means the
 * classification can be exercised directly.
 *
 * Why it exists: reporting every failure as "could not reach the database" sends
 * people to check networking and credentials when the usual cause after a schema
 * change is a generated client that predates it — which looks nothing like an
 * outage and is fixed by restarting, not by touching infrastructure.
 */

/** Message shown when the database genuinely cannot be reached. */
export const DATABASE_UNAVAILABLE_MESSAGE =
  "Could not reach the database. Check that DATABASE_URL points at a running PostgreSQL instance and that migrations have been applied.";

/**
 * Shown when the query was rejected before it reached the server — almost always a
 * Prisma Client generated against an older schema than the code expects.
 */
const STALE_CLIENT_MESSAGE =
  "The application's database client is out of date with the schema. Regenerate it and restart the server.";

const STALE_CLIENT_HINT_DEV = " Run `npm run dev:fresh`.";

const GENERIC_QUERY_MESSAGE =
  "Something went wrong loading this data. The details are in the server log.";

/** Prisma error codes that mean "the connection itself failed". */
const CONNECTION_ERROR_CODES = new Set([
  "P1000", // authentication failed
  "P1001", // cannot reach database server
  "P1002", // connection timed out
  "P1008", // operation timed out
  "P1010", // access denied
  "P1017", // server closed the connection
]);

/** Node/libpq socket-level failures, which arrive without a Prisma code. */
const CONNECTION_ERROR_PATTERNS = [
  "econnrefused",
  "etimedout",
  "enotfound",
  "econnreset",
  "connection terminated",
  "timeout expired",
  "operation has timed out",
];

export function classifyQueryError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = (error as { code?: string })?.code;

  if (code && CONNECTION_ERROR_CODES.has(code)) return DATABASE_UNAVAILABLE_MESSAGE;
  if (CONNECTION_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
    return DATABASE_UNAVAILABLE_MESSAGE;
  }

  /*
   * A validation error, or a missing model delegate, means the client was built
   * from a different schema than this code — the database was never contacted.
   * `Cannot read properties of undefined` catches the delegate case, which is what
   * a brand-new model looks like to a client generated before the migration.
   */
  const looksStale =
    name === "PrismaClientValidationError" ||
    message.includes("unknown argument") ||
    message.includes("unknown field") ||
    (message.includes("cannot read properties of undefined") && message.includes("reading"));

  if (looksStale) {
    return process.env.NODE_ENV === "production"
      ? STALE_CLIENT_MESSAGE
      : STALE_CLIENT_MESSAGE + STALE_CLIENT_HINT_DEV;
  }

  // A missing relation means migrations have not been applied to this database.
  if (message.includes("does not exist") && message.includes("relation")) {
    return "This database is missing tables the application expects. Apply migrations with `npm run db:deploy`.";
  }

  return GENERIC_QUERY_MESSAGE;
}
