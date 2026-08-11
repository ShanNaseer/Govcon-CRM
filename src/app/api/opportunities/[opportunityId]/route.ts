import { type NextRequest, NextResponse } from "next/server";

import {
  opportunityIdSchema,
  updateOpportunityStatusSchema,
} from "@/features/opportunities/opportunity.schemas";
import * as opportunityService from "@/features/opportunities/opportunity.service";
import { jsonOk, parseJsonBody, withRouteErrorHandling } from "@/lib/api/response";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function resolveOpportunityId(
  context: RouteContext<"/api/opportunities/[opportunityId]">,
): Promise<string> {
  await requireSession();
  const { opportunityId } = await context.params;
  return opportunityIdSchema.parse(opportunityId);
}

/** GET /api/opportunities/:opportunityId */
export const GET = withRouteErrorHandling(
  "GET /api/opportunities/[opportunityId]",
  async (
    _request: NextRequest,
    context: RouteContext<"/api/opportunities/[opportunityId]">,
  ): Promise<NextResponse> => {
    const id = await resolveOpportunityId(context);
    return jsonOk(await opportunityService.getOpportunityById(id));
  },
);

/**
 * PATCH /api/opportunities/:opportunityId
 *
 * Only the internal workflow status is mutable from the dashboard. Fields owned
 * by the source system are updated by the ingestion pipeline, never by hand.
 */
export const PATCH = withRouteErrorHandling(
  "PATCH /api/opportunities/[opportunityId]",
  async (
    request: NextRequest,
    context: RouteContext<"/api/opportunities/[opportunityId]">,
  ): Promise<NextResponse> => {
    const id = await resolveOpportunityId(context);
    const input = updateOpportunityStatusSchema.parse(await parseJsonBody(request));

    return jsonOk(await opportunityService.updateOpportunityStatus(id, input));
  },
);
