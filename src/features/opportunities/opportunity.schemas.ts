import { z } from "zod";

import { OpportunitySourceType, OpportunityStatus } from "@/generated/prisma/enums";

/**
 * Zod schemas for the universal Opportunity model.
 *
 * These describe the *normalized* shape. Provider-specific payloads (SAM.gov,
 * BidNet, state portals) are mapped onto this shape by their connector before
 * they ever reach the service layer — no provider field names appear here.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

const moneySchema = z
  .union([z.number(), z.string()])
  .refine((value) => value !== "" && Number.isFinite(Number(value)), { error: "Must be a valid amount" })
  .refine((value) => Number(value) >= 0, { error: "Must be zero or greater" })
  .transform((value) => Number(value).toFixed(2))
  .nullish();

export const opportunityNaicsSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{2,6}$/, { error: "NAICS code must be 2–6 digits" }),
  title: optionalText(200),
  isPrimary: z.boolean().default(false),
});

export const opportunityPscSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,6}$/, { error: "PSC code must be 2–6 alphanumeric characters" })
    .transform((value) => value.toUpperCase()),
  title: optionalText(200),
});

export const createOpportunitySchema = z.object({
  source: z.enum(OpportunitySourceType),
  externalId: z.string().trim().min(1, { error: "externalId is required" }).max(200),
  sourceUrl: z.url().max(1000).optional(),

  title: z.string().trim().min(1, { error: "Title is required" }).max(500),
  description: optionalText(20_000),
  solicitationNumber: optionalText(120),

  agency: optionalText(250),
  subAgency: optionalText(250),
  office: optionalText(250),

  postedDate: z.coerce.date().nullish(),
  responseDeadline: z.coerce.date().nullish(),

  setAside: optionalText(120),
  contractType: optionalText(120),

  estimatedValueMin: moneySchema,
  estimatedValueMax: moneySchema,

  placeCity: optionalText(120),
  placeState: optionalText(60),
  placeCountry: optionalText(60),

  status: z.enum(OpportunityStatus).default(OpportunityStatus.NEW),
  /** Publication status as reported by the provider — distinct from the workflow status. */
  sourceStatus: optionalText(60),
  /** Provider version identifier, used to skip rewriting unchanged records. */
  sourceVersion: optionalText(200),

  rawData: z.unknown().optional(),

  naicsCodes: z.array(opportunityNaicsSchema).max(20).default([]),
  pscCodes: z.array(opportunityPscSchema).max(20).default([]),
});

/** Only the internal workflow fields are editable from the dashboard. */
export const updateOpportunityStatusSchema = z.object({
  status: z.enum(OpportunityStatus),
});

/** Derived urgency band shown on the inbox cards — see `derivePriority`. */
export const opportunityPriorityValues = ["high", "medium", "low"] as const;

/** Triage state: NEW is unreviewed, anything further along has been looked at. */
export const opportunityReviewValues = ["unreviewed", "reviewed"] as const;

export const opportunitySortValues = ["newest", "priority", "due-date", "fit-score"] as const;

/**
 * Deadline window.
 *
 * `open` is the default for the triage inbox: a solicitation whose response date has
 * passed cannot be bid, so leaving it in the queue is noise. It is a filter rather
 * than a delete — the records stay, and `expired` reaches them.
 *
 * `undated` is a separate option, not folded into `open`, because "no deadline
 * stated" and "deadline in the future" are different facts and only one of them can
 * be acted on with confidence.
 */
export const opportunityDeadlineValues = ["open", "expired", "undated", "all"] as const;

/**
 * Fit-score band.
 *
 * `strong` is the default for the triage inbox. On an unfiltered government feed most
 * solicitations score near zero, and a queue that lists them all is the problem the
 * matching engine exists to solve — so the inbox shows only what cleared the pursue
 * threshold, and the other bands are one click away.
 */
export const opportunityFitValues = ["strong", "review", "any"] as const;

/** Score floor each band imposes. `any` removes the filter entirely. */
export const OPPORTUNITY_FIT_THRESHOLDS: Record<"strong" | "review", number> = {
  strong: 70,
  review: 40,
};

export const listOpportunitiesQuerySchema = z.object({
  search: optionalText(200),
  priority: z.enum(opportunityPriorityValues).optional(),
  review: z.enum(opportunityReviewValues).optional(),
  sort: z.enum(opportunitySortValues).default("due-date"),
  deadline: z.enum(opportunityDeadlineValues).optional(),
  fit: z.enum(opportunityFitValues).optional(),
  source: z.enum(OpportunitySourceType).optional(),
  status: z.enum(OpportunityStatus).optional(),
  agency: optionalText(250),
  naicsCode: optionalText(6),
  setAside: optionalText(120),
  /** Only return opportunities whose deadline is within this many days. */
  deadlineWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  minMatchScore: z.coerce.number().min(0).max(100).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export const opportunityIdSchema = z.string().trim().min(1).max(64);

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityStatusInput = z.infer<typeof updateOpportunityStatusSchema>;
export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;
export type OpportunityPriority = (typeof opportunityPriorityValues)[number];
export type OpportunityReviewState = (typeof opportunityReviewValues)[number];
export type OpportunitySort = (typeof opportunitySortValues)[number];
export type OpportunityDeadlineFilter = (typeof opportunityDeadlineValues)[number];
export type OpportunityFitFilter = (typeof opportunityFitValues)[number];
