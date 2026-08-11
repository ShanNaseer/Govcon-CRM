import { type NextRequest, NextResponse } from "next/server";

import { downloadUrlRequestSchema } from "@/features/storage/storage.schemas";
import * as storageService from "@/features/storage/storage.service";
import { jsonOk, parseJsonBody, withRouteErrorHandling } from "@/lib/api/response";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/storage/download-url
 *
 * Returns a short-lived presigned GET URL. The requested key must fall within
 * the prefix owned by the referenced record, so an arbitrary key cannot be
 * signed by editing the request body.
 */
export const POST = withRouteErrorHandling(
  "POST /api/storage/download-url",
  async (request: NextRequest): Promise<NextResponse> => {
    const session = await requireSession();
    const input = downloadUrlRequestSchema.parse(await parseJsonBody(request));

    return jsonOk(await storageService.createDownloadUrl(session, input));
  },
);
