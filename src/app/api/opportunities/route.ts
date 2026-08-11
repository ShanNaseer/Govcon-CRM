import { type NextRequest, NextResponse } from "next/server";

import {
  createOpportunitySchema,
  listOpportunitiesQuerySchema,
} from "@/features/opportunities/opportunity.schemas";
import * as opportunityService from "@/features/opportunities/opportunity.service";
import { jsonOk, parseJsonBody, withRouteErrorHandling } from "@/lib/api/response";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GET /api/opportunities — paginated, filterable list of normalized opportunities. */
export const GET = withRouteErrorHandling(
  "GET /api/opportunities",
  async (request: NextRequest): Promise<NextResponse> => {
    await requireSession();

    const query = listOpportunitiesQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    return jsonOk(await opportunityService.listOpportunities(query));
  },
);

/**
 * POST /api/opportunities
 *
 * Accepts an already-normalized opportunity. This exists for development and
 * manual testing of the universal model — it is NOT the government-source
 * ingestion path. Provider connectors will normalize upstream and call the
 * service layer directly from a background worker.
 */
export const POST = withRouteErrorHandling(
  "POST /api/opportunities",
  async (request: NextRequest): Promise<NextResponse> => {
    await requireSession();

    const input = createOpportunitySchema.parse(await parseJsonBody(request));

    return jsonOk(await opportunityService.createOpportunity(input), 201);
  },
);
