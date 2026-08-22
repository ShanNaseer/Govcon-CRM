import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this repository. Without it Turbopack walks up the
  // filesystem and can adopt an unrelated lockfile from a parent directory.
  turbopack: {
    root: __dirname,
  },

  /**
   * Force the RDS CA bundle into every serverless function's file bundle.
   *
   * `DATABASE_CA_CERT_PATH` is handed to node-postgres as a *string path*, which it
   * reads at connection time (see src/lib/db/connection-string.ts). Next's
   * dependency tracer only follows static imports, so it cannot know the file is
   * needed and would omit it — the deployed function would then fail TLS
   * verification against RDS with a missing-file error, even though the cert is
   * committed to the repository.
   *
   * Keyed on every route because any route may open a database connection.
   */
  outputFileTracingIncludes: {
    "/*": ["./certs/**"],
  },
};

export default nextConfig;
