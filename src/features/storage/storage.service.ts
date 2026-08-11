import "server-only";

import type { DownloadUrlRequest, UploadUrlRequest } from "@/features/storage/storage.schemas";
import { AppError } from "@/lib/api/errors";
import {
  assertKeyInScope,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  type PresignedDownload,
  type PresignedUpload,
  type StorageScope,
} from "@/lib/aws/s3.service";
import { canAccessClient, type Session } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

/**
 * Authorization layer in front of the S3 service.
 *
 * A presigned URL is a bearer credential for an object, so nothing here trusts
 * the request body. Before any URL is minted:
 *   1. the owning record must exist,
 *   2. the caller must be allowed to access it, and
 *   3. for downloads, the key must fall inside that record's prefix.
 */

/** Confirms the referenced record exists and the session may act on it. */
async function assertOwnerAccessible(
  session: Session,
  scope: StorageScope,
  ownerId: string,
): Promise<void> {
  switch (scope) {
    case "opportunity": {
      const owner = await prisma.opportunity.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!owner) throw AppError.notFound("Opportunity", ownerId);
      return;
    }
    case "clientDocument": {
      const owner = await prisma.client.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!owner) throw AppError.notFound("Client", ownerId);
      if (!canAccessClient(session, ownerId)) {
        throw new AppError("FORBIDDEN", "You do not have access to this client");
      }
      return;
    }
    case "proposal": {
      // Proposals are a future module; refuse rather than sign a key for a
      // record type this application cannot yet verify ownership of.
      throw new AppError("FORBIDDEN", "Proposal storage is not enabled yet");
    }
  }
}

export async function createUploadUrl(
  session: Session,
  request: UploadUrlRequest,
): Promise<PresignedUpload> {
  await assertOwnerAccessible(session, request.scope, request.ownerId);

  return getPresignedUploadUrl({
    scope: request.scope,
    ownerId: request.ownerId,
    fileName: request.fileName,
    contentType: request.contentType,
    contentLength: request.contentLength,
  });
}

export async function createDownloadUrl(
  session: Session,
  request: DownloadUrlRequest,
): Promise<PresignedDownload> {
  await assertOwnerAccessible(session, request.scope, request.ownerId);

  // Rejects a key belonging to a different record even when the caller may
  // legitimately access *some* records.
  assertKeyInScope(request.key, request.scope, request.ownerId);

  return getPresignedDownloadUrl({
    key: request.key,
    downloadFileName: request.downloadFileName,
  });
}
