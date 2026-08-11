import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { isStorageConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Health checks must never be cached or prerendered. */
export const dynamic = "force-dynamic";

type HealthResponse = {
  status: "ok" | "degraded";
  service: "govcon-crm";
  checks: {
    database: "up" | "down";
    storage: "configured" | "not_configured";
  };
};

/**
 * GET /api/health
 *
 * Reports reachability only. Host names, connection strings, bucket names and
 * driver errors are deliberately absent from the response — a failing check
 * yields "down" and the detail goes to the server log.
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  let database: "up" | "down" = "down";

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch {
    // Intentionally not forwarding the driver error to the caller.
    logger.error("Health check: database unreachable");
  }

  const body: HealthResponse = {
    status: database === "up" ? "ok" : "degraded",
    service: "govcon-crm",
    checks: {
      database,
      storage: isStorageConfigured() ? "configured" : "not_configured",
    },
  };

  return NextResponse.json(body, { status: body.status === "ok" ? 200 : 503 });
}
