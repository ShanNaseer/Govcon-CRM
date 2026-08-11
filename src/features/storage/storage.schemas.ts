import { z } from "zod";

/**
 * Input contracts for the presigned-URL endpoints.
 *
 * A request never supplies a raw bucket, and an upload never supplies a key —
 * the server derives both. A download supplies a key, which is then checked
 * against the prefix owned by the referenced record.
 */

/** Domain records that can own stored objects. Mirrors `StorageScope` in the S3 service. */
export const storageScopeSchema = z.enum(["opportunity", "clientDocument", "proposal"]);

/** Content types accepted for upload — solicitation documents and spreadsheets. */
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
] as const;

/** 100 MB. Bound into the presigned signature so a larger body is rejected by S3 itself. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const uploadUrlRequestSchema = z.object({
  scope: storageScopeSchema,
  /** Id of the owning record (opportunity, client, or proposal). */
  ownerId: z.string().trim().min(1).max(64),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES, { error: "Unsupported file type" }),
  contentLength: z.coerce.number().int().positive().max(MAX_UPLOAD_BYTES).optional(),
});

export const downloadUrlRequestSchema = z.object({
  scope: storageScopeSchema,
  ownerId: z.string().trim().min(1).max(64),
  /** Validated against the scope prefix before it is signed. */
  key: z.string().trim().min(1).max(1024),
  downloadFileName: z.string().trim().min(1).max(255).optional(),
});

export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;
export type DownloadUrlRequest = z.infer<typeof downloadUrlRequestSchema>;
