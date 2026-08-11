/**
 * Connectivity probe for DATABASE_URL.
 *
 * Run before migrating against a new instance: it distinguishes the failure modes
 * that look identical in a Prisma stack trace — DNS, a security group dropping the
 * packet, bad credentials, TLS rejection, and a missing schema.
 *
 * Usage: npm run db:check
 */
import "dotenv/config";

import { Client } from "pg";

import { resolveDatabaseUrl } from "../src/lib/db/connection-string";

class CheckError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/** Maps the pg / libpq error code to the operational cause it almost always means. */
const HINTS: Record<string, string> = {
  ENOTFOUND: "Hostname does not resolve. Check the RDS endpoint address.",
  ETIMEDOUT:
    "Connection timed out — almost always the security group. Allow your current public IP on tcp/5432 and confirm the instance is publicly accessible.",
  ECONNREFUSED: "Nothing is listening on that port. Check the port and that the instance is available.",
  "28P01": "Password authentication failed. Check the username and password.",
  "28000": "The server rejected the connection — check pg_hba rules and whether TLS is required.",
  "3D000": "That database does not exist on the server. Check the database name in the URL path.",
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new CheckError("DATABASE_URL is not set.", "Copy .env.example to .env and fill it in.");
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new CheckError("DATABASE_URL is not a valid connection URL.");
  }

  const sslmode = url.searchParams.get("sslmode");
  const isRds = url.hostname.endsWith(".rds.amazonaws.com");
  const caCertPath = process.env.DATABASE_CA_CERT_PATH || undefined;

  console.log(`Host     ${url.hostname}:${url.port || 5432}`);
  console.log(`Database ${url.pathname.replace(/^\//, "") || "(none)"}`);
  console.log(`User     ${url.username || "(none)"}`);
  console.log(`sslmode  ${sslmode ?? "(unset)"}`);
  console.log(`CA cert  ${caCertPath ?? "(unset — no certificate verification)"}`);

  if (isRds && (!sslmode || sslmode === "disable")) {
    throw new CheckError(
      "RDS requires TLS but sslmode is unset or disabled.",
      "Append ?sslmode=require to DATABASE_URL.",
    );
  }

  if (isRds && !caCertPath) {
    throw new CheckError(
      "DATABASE_CA_CERT_PATH is not set, so the RDS certificate cannot be verified.",
      "Run `npm run db:ca` and set DATABASE_CA_CERT_PATH=certs/rds-global-bundle.pem in .env.",
    );
  }

  // Connect exactly as the app does, so a TLS problem surfaces here and not at runtime.
  const client = new Client({
    connectionString: resolveDatabaseUrl(databaseUrl, caCertPath),
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();

    const { rows } = await client.query<{ version: string; now: Date }>(
      "select version() as version, now() as now",
    );
    const { rows: tables } = await client.query<{ count: string }>(
      "select count(*)::text as count from information_schema.tables where table_schema = 'public'",
    );

    console.log("\n✓ Connected");
    console.log(`  ${rows[0].version.split(",")[0]}`);
    console.log(`  server time: ${rows[0].now.toISOString()}`);
    console.log(`  tables in public schema: ${tables[0].count}`);

    if (tables[0].count === "0") {
      console.log("\n  Schema is empty — run: npm run db:deploy");
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = error instanceof Error ? error.message : String(error);
    throw new CheckError(message, code ? HINTS[code] : undefined);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ ${message}`);
  if (error instanceof CheckError && error.hint) console.error(`  ${error.hint}`);
  process.exitCode = 1;
});
