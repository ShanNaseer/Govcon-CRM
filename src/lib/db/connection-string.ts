/**
 * TLS resolution for the runtime connection string.
 *
 * `DATABASE_URL` is kept at `sslmode=require` because it is also consumed by the
 * Prisma CLI's schema engine, which does not understand libpq's `verify-full`.
 *
 * node-postgres does not treat `sslmode=require` the way libpq does: it still
 * validates the certificate chain against Node's trust store, which does not
 * contain the Amazon RDS root CA. Connecting to RDS therefore *requires* the RDS
 * trust bundle — point `DATABASE_CA_CERT_PATH` at it (`npm run db:ca`). With the
 * bundle present the connection is upgraded to `verify-full`, verifying both the
 * chain and the hostname.
 *
 * The rewrite happens in the connection string rather than via node-postgres'
 * `ssl` option because `pg` re-parses `connectionString` over the explicit config,
 * which would silently discard an `ssl` object passed alongside it.
 *
 * A relative CA path is resolved by `pg` against `process.cwd()` — i.e. the
 * project root for both `next` and the Prisma CLI.
 */
export function resolveDatabaseUrl(databaseUrl: string, caCertPath: string | undefined): string {
  if (!caCertPath) return databaseUrl;

  const url = new URL(databaseUrl);

  // An explicit opt-out is honoured — e.g. a local PostgreSQL serving no TLS at all.
  if (url.searchParams.get("sslmode") === "disable") return databaseUrl;

  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("sslrootcert", caCertPath);

  return url.toString();
}
