import "server-only";

import { z } from "zod";

import {
  IT_FILTER,
  NO_FILTER,
  parsePrefixes,
  type IndustryFilter,
} from "@/features/opportunities/opportunity-filter";

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

/**
 * HigherGov, validated lazily for the same reason as storage: the application must
 * boot and run without an opportunity feed configured. Only the sync endpoint fails,
 * and it fails with a message that says which variable is missing.
 */
const higherGovEnvSchema = z.object({
  HIGHERGOV_API_KEY: z.string().min(1, { error: "HIGHERGOV_API_KEY is required to sync opportunities" }),
  // Overridable so a test or a staging tenant can be pointed elsewhere without a
  // code change. Defaults to the documented production host.
  HIGHERGOV_BASE_URL: z.url().default("https://www.highergov.com"),
  /**
   * Records per page. The API caps this at 100 and defaults to 10; 100 keeps the
   * number of round trips down on a backfill.
   */
  HIGHERGOV_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(100),
  /**
   * Pages per sync run, across every date in the window.
   *
   * A per-run budget, NOT per day. The unfiltered feed captures several thousand
   * records a day — around 68 pages — so a per-day ceiling multiplied by the window
   * into hundreds of sequential requests, which is minutes of work inside one button
   * click.
   *
   * Measured against the live API: a 100-record page takes about 4 seconds to fetch
   * and about 10 seconds to store when the records are new, and under a second when
   * they are already stored at the same version. Three pages is therefore roughly
   * half a minute on a first run and a few seconds on a routine one.
   */
  HIGHERGOV_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(3),
  /**
   * Records per sync run — the binding limit alongside the page budget, because
   * storing costs far more than fetching. Raise it for an unattended backfill through
   * the API route, where a long runtime is nobody's problem.
   */
  HIGHERGOV_MAX_RECORDS: z.coerce.number().int().min(1).max(10_000).default(300),
  /**
   * Optional saved-search id from the HigherGov UI, applied to every sync.
   *
   * THE SETTING THAT MATTERS FOR THIS FEED. Unfiltered it carries every federal,
   * DIBBS, SBIR, grant and state/local solicitation — thousands a day, almost none of
   * them relevant to any one company. A saved search moves NAICS, PSC, agency, value
   * and keyword filtering to the provider, so a sync returns a pipeline instead of a
   * firehose. Left unset, syncing still works; it just imports the newest records
   * indiscriminately.
   */
  HIGHERGOV_SEARCH_ID: z.string().min(1).optional(),
  /**
   * Days of overlap re-covered on every sync, counting today.
   *
   * One means today only, which is the default: routine syncing should cover the
   * current day and no more.
   *
   * Raising it re-covers recent days, which catches two things a today-only run
   * cannot — records captured after the last run finished, and amendments, which are
   * re-captured under a later date. Cheap to store, because `sourceVersion` skips
   * unchanged records without a write; it still costs one fetch per page.
   *
   * Note this is separate from catching up. A gap left by a missed run is always
   * covered, from the stored cursor, whatever this is set to.
   */
  HIGHERGOV_OVERLAP_DAYS: z.coerce.number().int().min(1).max(30).default(1),
});

/**
 * Which imported opportunities are kept.
 *
 * Applied after fetching, because the provider has no NAICS or PSC parameter — see
 * the note in src/features/opportunities/opportunity-filter.ts. Unset means the
 * built-in IT profile; set the prefix variables to target a different industry, or
 * OPPORTUNITY_FILTER_ENABLED=false to store everything.
 */
const opportunityFilterEnvSchema = z.object({
  OPPORTUNITY_FILTER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  OPPORTUNITY_NAICS_PREFIXES: z.string().optional(),
  OPPORTUNITY_PSC_PREFIXES: z.string().optional(),
  OPPORTUNITY_KEEP_UNCLASSIFIED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type StorageEnv = z.infer<typeof storageEnvSchema>;
export type HigherGovEnv = z.infer<typeof higherGovEnvSchema>;

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

let cachedHigherGovEnv: HigherGovEnv | undefined;

export function getHigherGovEnv(): HigherGovEnv {
  if (cachedHigherGovEnv) return cachedHigherGovEnv;

  const parsed = higherGovEnvSchema.safeParse({
    HIGHERGOV_API_KEY: read("HIGHERGOV_API_KEY"),
    HIGHERGOV_BASE_URL: read("HIGHERGOV_BASE_URL"),
    HIGHERGOV_PAGE_SIZE: read("HIGHERGOV_PAGE_SIZE"),
    HIGHERGOV_MAX_PAGES: read("HIGHERGOV_MAX_PAGES"),
    HIGHERGOV_MAX_RECORDS: read("HIGHERGOV_MAX_RECORDS"),
    HIGHERGOV_SEARCH_ID: read("HIGHERGOV_SEARCH_ID"),
    HIGHERGOV_OVERLAP_DAYS: read("HIGHERGOV_OVERLAP_DAYS"),
  });

  if (!parsed.success) {
    throw new Error(`Invalid HigherGov configuration — ${formatIssues(parsed.error)}`);
  }

  cachedHigherGovEnv = parsed.data;
  return cachedHigherGovEnv;
}

let cachedFilter: IndustryFilter | undefined;

/**
 * The industry filter applied to every import.
 *
 * Cached like the other environment readers: it is parsed from process env, which
 * does not change while the process runs.
 */
export function getOpportunityFilter(): IndustryFilter {
  if (cachedFilter) return cachedFilter;

  const parsed = opportunityFilterEnvSchema.safeParse({
    OPPORTUNITY_FILTER_ENABLED: read("OPPORTUNITY_FILTER_ENABLED"),
    OPPORTUNITY_NAICS_PREFIXES: read("OPPORTUNITY_NAICS_PREFIXES"),
    OPPORTUNITY_PSC_PREFIXES: read("OPPORTUNITY_PSC_PREFIXES"),
    OPPORTUNITY_KEEP_UNCLASSIFIED: read("OPPORTUNITY_KEEP_UNCLASSIFIED"),
  });

  if (!parsed.success) {
    throw new Error(`Invalid opportunity filter configuration — ${formatIssues(parsed.error)}`);
  }

  if (!parsed.data.OPPORTUNITY_FILTER_ENABLED) {
    cachedFilter = NO_FILTER;
    return cachedFilter;
  }

  cachedFilter = {
    // Unset falls back to the IT profile; set-but-empty is honoured as "no criteria".
    naicsPrefixes: parsePrefixes(parsed.data.OPPORTUNITY_NAICS_PREFIXES) ?? IT_FILTER.naicsPrefixes,
    pscPrefixes: parsePrefixes(parsed.data.OPPORTUNITY_PSC_PREFIXES) ?? IT_FILTER.pscPrefixes,
    keepUnclassified: parsed.data.OPPORTUNITY_KEEP_UNCLASSIFIED,
  };

  return cachedFilter;
}

/**
 * True when the opportunity feed is configured.
 *
 * Lets the inbox render a "connect a source" state and the settings page report the
 * integration as off, rather than throwing on a page that has nothing to do with it.
 */
export function isHigherGovConfigured(): boolean {
  return Boolean(read("HIGHERGOV_API_KEY"));
}
