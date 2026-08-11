import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

import { getStorageEnv } from "@/lib/env";

/**
 * Single shared S3 client.
 *
 * Credentials are resolved by the AWS SDK's default provider chain (IAM role,
 * SSO profile, EC2/ECS metadata) unless explicit keys are present in the
 * environment — the local-development escape hatch. Nothing here is ever bundled
 * for the browser: the `server-only` import makes that a build error.
 */

const globalForS3 = globalThis as unknown as {
  s3Client: S3Client | undefined;
};

function createS3Client(): S3Client {
  const env = getStorageEnv();

  const hasExplicitCredentials = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);

  return new S3Client({
    region: env.AWS_REGION,
    ...(hasExplicitCredentials
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID as string,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
          },
        }
      : {}),
  });
}

export function getS3Client(): S3Client {
  if (!globalForS3.s3Client) {
    globalForS3.s3Client = createS3Client();
  }
  return globalForS3.s3Client;
}

export function getBucketName(): string {
  return getStorageEnv().AWS_S3_BUCKET;
}

export function getPresignedUrlTtlSeconds(): number {
  return getStorageEnv().S3_PRESIGNED_URL_TTL_SECONDS;
}
