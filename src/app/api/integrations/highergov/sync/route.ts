import { type NextRequest, NextResponse } from "next/server";

import { syncHigherGovOpportunities } from "@/features/opportunities/opportunity.sync.service";
import { jsonOk, withRouteErrorHandling } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/highergov/sync
 *
 * The unattended entry point, for a cron job or an external scheduler. The manual
 * equivalent is the Sync now button on the inbox; both call the same service, so
 * there is one implementation of the import and one place its rules live.
 *
 * AUTHENTICATION: none of its own. `syncHigherGovOpportunities` calls
 * `requirePermission("opportunities:write")`, so this route answers to the session
 * cookie exactly like every other endpoint — an unauthenticated POST gets a 401 from
 * the service, not from a check written here that could disagree with it.
 *
 * That does mean a scheduler must present a session cookie. A machine-to-machine
 * token would be the better fit and is deliberately not invented here: adding a
 * second, weaker way to authenticate an endpoint that writes to shared data is not
 * something to do as a side effect of building a connector.
 *
 * NO PARAMETERS ARE NEEDED. The service catches up from the stored cursor, so a
 * scheduler that misses two runs does not silently skip those days — the next run
 * covers them. This is the reason the cursor exists.
 *
 * Query parameters, all optional and all for deliberate backfills:
 *   days=1..30        ignore the cursor and cover this many days back from today
 *   sourceType=sam    comma-separated upstream systems; omit for all
 */
export const POST = withRouteErrorHandling(
  "POST /api/integrations/highergov/sync",
  async (request: NextRequest): Promise<NextResponse> => {
    const params = request.nextUrl.searchParams;

    const rawDays = params.get("days");
    const parsedDays = rawDays === null ? undefined : Number(rawDays);

    const rawSourceTypes = params.get("sourceType");

    const result = await syncHigherGovOpportunities({
      // Undefined means "use the cursor", which is the normal path. An unparseable
      // `days` falls back to it rather than failing the run — a scheduler with a typo
      // should still catch up, and the response reports which dates were covered.
      daysBack: Number.isFinite(parsedDays) ? parsedDays : undefined,
      sourceTypes: rawSourceTypes
        ? rawSourceTypes
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
    });

    return jsonOk(result);
  },
);
