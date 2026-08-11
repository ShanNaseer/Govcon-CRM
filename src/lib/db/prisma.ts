import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { resolveDatabaseUrl } from "@/lib/db/connection-string";
import { getEnv } from "@/lib/env";

/**
 * Prisma Client singleton.
 *
 * Next.js dev-mode hot reload re-evaluates modules on every change; without the
 * global cache each reload would open a new connection pool and eventually
 * exhaust PostgreSQL's connection limit. Production gets a single fresh instance.
 *
 * Prisma 7 requires an explicit driver adapter for SQL providers.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const env = getEnv();

  const adapter = new PrismaPg({
    connectionString: resolveDatabaseUrl(env.DATABASE_URL, env.DATABASE_CA_CERT_PATH),
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
