import { type NextRequest, NextResponse } from "next/server";

import { clientIdSchema, updateClientSchema } from "@/features/clients/client.schemas";
import * as clientService from "@/features/clients/client.service";
import { AppError } from "@/lib/api/errors";
import { jsonOk, parseJsonBody, withRouteErrorHandling } from "@/lib/api/response";
import { canAccessClient, requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Validates the path parameter and enforces the per-record authorization hook. */
async function resolveClientId(context: RouteContext<"/api/clients/[clientId]">): Promise<string> {
  const session = await requireSession();
  const { clientId } = await context.params;
  const id = clientIdSchema.parse(clientId);

  if (!canAccessClient(session, id)) {
    throw new AppError("FORBIDDEN", "You do not have access to this client");
  }

  return id;
}

/** GET /api/clients/:clientId */
export const GET = withRouteErrorHandling(
  "GET /api/clients/[clientId]",
  async (_request: NextRequest, context: RouteContext<"/api/clients/[clientId]">): Promise<NextResponse> => {
    const id = await resolveClientId(context);
    return jsonOk(await clientService.getClientById(id));
  },
);

/** PATCH /api/clients/:clientId — partial update; omitted keys are left unchanged. */
export const PATCH = withRouteErrorHandling(
  "PATCH /api/clients/[clientId]",
  async (request: NextRequest, context: RouteContext<"/api/clients/[clientId]">): Promise<NextResponse> => {
    const id = await resolveClientId(context);
    const input = updateClientSchema.parse(await parseJsonBody(request));

    return jsonOk(await clientService.updateClient(id, input));
  },
);

/** DELETE /api/clients/:clientId — cascades to the client's normalized child rows. */
export const DELETE = withRouteErrorHandling(
  "DELETE /api/clients/[clientId]",
  async (_request: NextRequest, context: RouteContext<"/api/clients/[clientId]">): Promise<NextResponse> => {
    const id = await resolveClientId(context);
    await clientService.deleteClient(id);

    return new NextResponse(null, { status: 204 });
  },
);
