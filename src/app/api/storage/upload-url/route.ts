import { type NextRequest, NextResponse } from "next/server";

import { uploadUrlRequestSchema } from "@/features/storage/storage.schemas";
import * as storageService from "@/features/storage/storage.service";
import { jsonOk, parseJsonBody, withRouteErrorHandling } from "@/lib/api/response";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/storage/upload-url
 *
 * Returns a short-lived presigned PUT URL. The object key is generated
 * server-side from the owning record and a UUID — the caller cannot choose it.
 */
export const POST = withRouteErrorHandling(
  "POST /api/storage/upload-url",
  async (request: NextRequest): Promise<NextResponse> => {
    const session = await requireSession();
    const input = uploadUrlRequestSchema.parse(await parseJsonBody(request));

    return jsonOk(await storageService.createUploadUrl(session, input));
  },
);
