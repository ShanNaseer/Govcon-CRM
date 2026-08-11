import { type NextRequest, NextResponse } from "next/server";

import { createClientSchema, listClientsQuerySchema } from "@/features/clients/client.schemas";
import * as clientService from "@/features/clients/client.service";
import { jsonOk, parseJsonBody, withRouteErrorHandling } from "@/lib/api/response";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/clients — paginated, filterable client list.
 *
 * Route Handler -> Zod -> Service -> Repository -> Prisma. No query logic here.
 */
export const GET = withRouteErrorHandling(
  "GET /api/clients",
  async (request: NextRequest): Promise<NextResponse> => {
    await requireSession();

    const query = listClientsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    return jsonOk(await clientService.listClients(query));
  },
);

/** POST /api/clients — creates a client together with its normalized profile collections. */
export const POST = withRouteErrorHandling(
  "POST /api/clients",
  async (request: NextRequest): Promise<NextResponse> => {
    await requireSession();

    const input = createClientSchema.parse(await parseJsonBody(request));

    return jsonOk(await clientService.createClient(input), 201);
  },
);
