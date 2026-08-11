import "server-only";

import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AppError } from "@/lib/api/errors";
import { getBucketName, getPresignedUrlTtlSeconds, getS3Client } from "@/lib/aws/s3-client";
import { isStorageConfigured } from "@/lib/env";
import { describeError, logger } from "@/lib/logger";
import { sanitizeFileName } from "@/lib/utils";

/**
 * Server-only S3 access layer.
 *
 * Security model:
 * - The bucket is private. No ACLs are ever set; access is granted exclusively
 *   through short-lived presigned URLs.
 * - Object keys are *generated* here from a domain scope plus a random UUID. The
 *   caller-supplied file name only contributes a sanitized suffix, so a hostile
 *   name can never escape its prefix or overwrite an existing object.
 * - Keys arriving from a client are re-validated against the scope prefix of the
 *   record the caller is actually operating on (`assertKeyInScope`).
 */

/** Domain scopes that own object-key prefixes. */
export const STORAGE_SCOPES = {
  opportunity: "opportunities",
  clientDocument: "clients",
  proposal: "proposals",
} as const;

export type StorageScope = keyof typeof STORAGE_SCOPES;

/** Only cuid/uuid-shaped ids may become part of a key. */
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Builds the prefix that owns every object for a given record, e.g.
 * `opportunities/<opportunityId>/` or `clients/<clientId>/documents/`.
 */
export function buildScopePrefix(scope: StorageScope, ownerId: string): string {
  if (!OWNER_ID_PATTERN.test(ownerId)) {
    throw AppError.validation("Invalid record identifier for storage operation");
  }

  switch (scope) {
    case "opportunity":
      return `${STORAGE_SCOPES.opportunity}/${ownerId}/`;
    case "clientDocument":
      return `${STORAGE_SCOPES.clientDocument}/${ownerId}/documents/`;
    case "proposal":
      return `${STORAGE_SCOPES.proposal}/${ownerId}/`;
  }
}

/**
 * Generates a collision-free object key. The original file name is never trusted
 * as the key — it is sanitized and appended after a server-generated UUID.
 */
export function buildObjectKey(scope: StorageScope, ownerId: string, fileName: string): string {
  return `${buildScopePrefix(scope, ownerId)}${randomUUID()}-${sanitizeFileName(fileName)}`;
}

/**
 * Rejects any key that does not belong to the requested record. This is the check
 * that stops a caller from presigning `clients/<someone-else>/documents/...` by
 * simply editing the request body.
 */
export function assertKeyInScope(key: string, scope: StorageScope, ownerId: string): void {
  const prefix = buildScopePrefix(scope, ownerId);

  const isWithinScope =
    key.startsWith(prefix) &&
    !key.includes("..") &&
    !key.includes("//") &&
    key.length > prefix.length &&
    key.length <= 1024;

  if (!isWithinScope) {
    logger.warn("Rejected out-of-scope S3 key", { scope, ownerId });
    throw new AppError("FORBIDDEN", "The requested object key is not permitted for this record");
  }
}

function assertConfigured(): void {
  if (!isStorageConfigured()) {
    throw new AppError(
      "STORAGE_NOT_CONFIGURED",
      "File storage is not configured. Set AWS_REGION and AWS_S3_BUCKET.",
    );
  }
}

/** Wraps an SDK call so AWS internals (bucket names, ARNs, request ids) never reach the client. */
async function withStorageErrorHandling<T>(operation: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error("S3 operation failed", { operation, ...describeError(error) });
    throw new AppError("STORAGE_ERROR", "The file storage operation could not be completed");
  }
}

export type PresignedUpload = {
  url: string;
  bucket: string;
  key: string;
  expiresInSeconds: number;
};

/**
 * Presigns a PUT for a newly generated key.
 *
 * `contentType` and `contentLength` are bound into the signature, so the browser
 * cannot upload a different type or a larger body than was authorized.
 */
export async function getPresignedUploadUrl(params: {
  scope: StorageScope;
  ownerId: string;
  fileName: string;
  contentType: string;
  contentLength?: number;
}): Promise<PresignedUpload> {
  assertConfigured();

  const bucket = getBucketName();
  const key = buildObjectKey(params.scope, params.ownerId, params.fileName);
  const expiresIn = getPresignedUrlTtlSeconds();

  const url = await withStorageErrorHandling("getPresignedUploadUrl", () =>
    getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: params.contentType,
        ...(params.contentLength ? { ContentLength: params.contentLength } : {}),
      }),
      { expiresIn },
    ),
  );

  logger.info("Issued presigned upload URL", { scope: params.scope, ownerId: params.ownerId, expiresIn });

  return { url, bucket, key, expiresInSeconds: expiresIn };
}

export type PresignedDownload = {
  url: string;
  expiresInSeconds: number;
};

/** Presigns a GET for an existing key. The key must already be scope-validated by the caller. */
export async function getPresignedDownloadUrl(params: {
  key: string;
  /** Sets Content-Disposition so the browser downloads under the original name. */
  downloadFileName?: string;
}): Promise<PresignedDownload> {
  assertConfigured();

  const expiresIn = getPresignedUrlTtlSeconds();

  const url = await withStorageErrorHandling("getPresignedDownloadUrl", () =>
    getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: params.key,
        ...(params.downloadFileName
          ? {
              ResponseContentDisposition: `attachment; filename="${sanitizeFileName(params.downloadFileName)}"`,
            }
          : {}),
      }),
      { expiresIn },
    ),
  );

  return { url, expiresInSeconds: expiresIn };
}

export async function deleteObject(key: string): Promise<void> {
  assertConfigured();

  await withStorageErrorHandling("deleteObject", () =>
    getS3Client().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key })),
  );

  logger.info("Deleted stored object", { keyLength: key.length });
}

/** Confirms an object exists — used to verify an upload actually completed. */
export async function objectExists(key: string): Promise<boolean> {
  assertConfigured();

  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: getBucketName(), Key: key }));
    return true;
  } catch {
    return false;
  }
}
