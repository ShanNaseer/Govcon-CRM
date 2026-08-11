import "server-only";

import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * This module is server-only: importing it from a Client Component is a build
 * error, which prevents credentials from ever reaching the browser bundle.
 *
 * Storage variables are validated lazily (see `getStorageEnv`) so the app and its
 * migrations still boot on a machine that has no S3 bucket configured yet. Only
 * the storage endpoints fail, and they fail with a clear message.
 */

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, { error: "DATABASE_URL is required" }),
  // Optional path to a CA bundle. When set, the application connection verifies the
  // database server's certificate and hostname (see src/lib/db/connection-string.ts).
  DATABASE_CA_CERT_PATH: z.string().min(1).optional(),
  APP_URL: z.url().default("http://localhost:3000"),
});

const storageEnvSchema = z.object({
  AWS_REGION: z.string().min(1, { error: "AWS_REGION is required for storage operations" }),
  AWS_S3_BUCKET: z.string().min(1, { error: "AWS_S3_BUCKET is required for storage operations" }),
  // Explicit keys are optional: when absent the AWS SDK falls back to the default
  // credential provider chain (IAM role, SSO profile, instance metadata).
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_PRESIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type StorageEnv = z.infer<typeof storageEnvSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

/**
 * Reads a value treating the empty string as "not set". `.env.example` ships keys
 * with empty values, which would otherwise pass a naive `process.env.X !== undefined`.
 */
function read(key: string): string | undefined {
  const value = process.env[key];
  return value === undefined || value === "" ? undefined : value;
}

let cachedBaseEnv: BaseEnv | undefined;

export function getEnv(): BaseEnv {
  if (cachedBaseEnv) return cachedBaseEnv;

  const parsed = baseEnvSchema.safeParse({
    NODE_ENV: read("NODE_ENV"),
    DATABASE_URL: read("DATABASE_URL"),
    DATABASE_CA_CERT_PATH: read("DATABASE_CA_CERT_PATH"),
    APP_URL: read("APP_URL"),
  });

  if (!parsed.success) {
    throw new Error(`Invalid server environment configuration — ${formatIssues(parsed.error)}`);
  }

  cachedBaseEnv = parsed.data;
  return cachedBaseEnv;
}

let cachedStorageEnv: StorageEnv | undefined;

export function getStorageEnv(): StorageEnv {
  if (cachedStorageEnv) return cachedStorageEnv;

  const parsed = storageEnvSchema.safeParse({
    AWS_REGION: read("AWS_REGION"),
    AWS_S3_BUCKET: read("AWS_S3_BUCKET"),
    AWS_ACCESS_KEY_ID: read("AWS_ACCESS_KEY_ID"),
    AWS_SECRET_ACCESS_KEY: read("AWS_SECRET_ACCESS_KEY"),
    S3_PRESIGNED_URL_TTL_SECONDS: read("S3_PRESIGNED_URL_TTL_SECONDS"),
  });

  if (!parsed.success) {
    throw new Error(`Invalid storage environment configuration — ${formatIssues(parsed.error)}`);
  }

  cachedStorageEnv = parsed.data;
  return cachedStorageEnv;
}

/** True when S3 is configured. Lets the UI render a "not configured" state instead of throwing. */
export function isStorageConfigured(): boolean {
  return Boolean(read("AWS_REGION") && read("AWS_S3_BUCKET"));
}
