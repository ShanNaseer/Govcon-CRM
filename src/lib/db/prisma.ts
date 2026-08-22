import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { resolveDatabaseUrl } from "@/lib/db/connection-string";
import { getEnv } from "@/lib/env";

/**
 * Prisma Client singleton.
 *
 * CONSTRUCTED LAZILY, ON FIRST QUERY — not at module load. `next build` imports
 * every route module to collect its configuration, and that import must not need
 * `DATABASE_URL`: build machines legitimately have no database credentials, and an
 * eager `new PrismaClient()` turns that into a failed build rather than a runtime
 * error at the one place that actually needs a connection.
 *
 * Next.js dev-mode hot reload re-evaluates modules on every change; without the
 * global cache each reload would open a new connection pool and eventually exhaust
 * PostgreSQL's connection limit. Production gets a single fresh instance.
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

    /*
     * Fail fast when the database is unreachable. node-postgres otherwise waits on
     * the OS TCP timeout — around 16 seconds — which a serverless request spends
     * hanging before it can report anything. Eight seconds is well beyond a healthy
     * connect (single-digit milliseconds inside the same region) and short enough
     * that a blocked route surfaces the failure instead of stalling.
     */
    connectionTimeoutMillis: 8_000,

    /*
     * Serverless sizing. Every instance keeps its own pool and instances scale
     * independently, so the ceiling that matters is `max` × concurrent instances
     * against PostgreSQL's `max_connections` (roughly 85 on db.t4g.micro). A small
     * per-instance cap plus a short idle timeout keeps a traffic spike from
     * exhausting the server. A connection pooler in front of the database is the
     * real fix at scale; these bounds are what make the direct connection survivable.
     */
    max: 5,
    idleTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const client = createPrismaClient();

  /*
   * Cached on the global in every environment. In development this is what stops
   * hot reload from opening a new pool per edit; in production the module is
   * evaluated once per instance anyway, so it costs nothing and keeps one code path.
   */
  globalForPrisma.prisma = client;

  return client;
}

/**
 * The client, behind a proxy that defers construction to first property access.
 *
 * Call sites are unchanged (`prisma.user.findUnique(...)`); they simply no longer
 * force a connection just by being imported. Methods are bound to the real client
 * so Prisma's internals keep the `this` they expect.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    // The real client is the receiver, so its own getters resolve against itself
    // rather than against this empty proxy target.
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return property in getPrismaClient();
  },
  set(_target, property, value) {
    return Reflect.set(getPrismaClient(), property, value);
  },
});
