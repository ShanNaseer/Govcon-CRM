import type {
  MatchRecommendation,
  MatchStatus,
  OpportunitySourceType,
  OpportunityStatus,
} from "@/generated/prisma/enums";
import type {
  OpportunityPriority,
  OpportunityReviewState,
} from "@/features/opportunities/opportunity.schemas";

/**
 * Transport types for the Opportunity domain. Dates are ISO strings and money is
 * an exact decimal string, so these cross the JSON and Server/Client boundaries
 * without loss. See the note in client.types.ts.
 */

export type OpportunityNaicsCodeDto = {
  id: string;
  code: string;
  title: string | null;
  isPrimary: boolean;
};

export type OpportunityPscCodeDto = {
  id: string;
  code: string;
  title: string | null;
};

export type OpportunityAttachmentDto = {
  id: string;
  fileName: string;
  contentType: string | null;
  fileSize: number | null;
  /** The S3 key is exposed so the UI can request a presigned download for it. */
  s3Key: string;
  sourceUrl: string | null;
  createdAt: string;
};

/** Match information for one client, embedded in an opportunity view. */
export type OpportunityMatchDto = {
  id: string;
  clientId: string;
  clientName: string;
  ruleScore: number | null;
  semanticScore: number | null;
  aiScore: number | null;
  overallScore: number | null;
  recommendation: MatchRecommendation | null;
  matchReasons: string[];
  risks: string[];
  status: MatchStatus;
};

export type OpportunitySummaryDto = {
  id: string;
  source: OpportunitySourceType;
  externalId: string;
  title: string;
  solicitationNumber: string | null;
  agency: string | null;
  setAside: string | null;
  postedDate: string | null;
  responseDeadline: string | null;
  status: OpportunityStatus;
  contractType: string | null;
  estimatedValueMin: string | null;
  estimatedValueMax: string | null;
  primaryNaicsCode: string | null;
  /** Highest overall score across all clients — the list's "fit score". */
  bestMatchScore: number | null;
  matchCount: number;
  /** Verdict from the best-scoring client match, or null when nothing is scored. */
  recommendation: MatchRecommendation | null;
  /**
   * Why it matched, from the best-scoring client. Truncated at the source rather
   * than in the card: the full list can run to a dozen entries and the rest would
   * only be serialized into the page to be thrown away.
   */
  topMatchReasons: string[];
  /** Urgency band derived from fit score and days remaining. */
  priority: OpportunityPriority;
  /** Whether the record has been triaged. NEW means it has not. */
  reviewState: OpportunityReviewState;
  /** Posted within the last week — drives the NEW flag on the card. */
  isNew: boolean;
  /**
   * Who has this in their queue. Null means unclaimed, which is what puts the
   * record in the shared inbox.
   */
  assignedToId: string | null;
  /** Their display name, for the card's owner chip. Null when unclaimed. */
  assignedToName: string | null;
  /** ISO 8601 of when it was claimed, or null. */
  assignedAt: string | null;
};

/** Counts backing the opportunities inbox summary row. */
export type OpportunityInboxStats = {
  total: number;
  unreviewed: number;
  highPriority: number;
  dueThisWeek: number;
  /**
   * True when more records matched than the stats query will read, so every figure
   * above is a floor rather than an exact count. Surfaced rather than hidden — a
   * silently wrong total is worse than an approximate one that says so.
   */
  capped: boolean;
  /** Mean fit score across scored records, rounded. Null when nothing is scored. */
  averageFitScore: number | null;
};

/**
 * The detail view carries the full relations, so it omits the summary's derived
 * conveniences: `primaryNaicsCode` (it has the whole `naicsCodes` list) and the
 * inbox-card fields, which belong to the triage list rather than the record.
 */
export type OpportunityDetailDto = Omit<
  OpportunitySummaryDto,
  "primaryNaicsCode" | "priority" | "reviewState" | "isNew"
> & {
  description: string | null;
  sourceUrl: string | null;
  subAgency: string | null;
  office: string | null;
  contractType: string | null;
  estimatedValueMin: string | null;
  estimatedValueMax: string | null;
  placeCity: string | null;
  placeState: string | null;
  placeCountry: string | null;
  sourceStatus: string | null;
  createdAt: string;
  updatedAt: string;

  naicsCodes: OpportunityNaicsCodeDto[];
  pscCodes: OpportunityPscCodeDto[];
  attachments: OpportunityAttachmentDto[];
  matches: OpportunityMatchDto[];
};

export type OpportunityListResult = {
  items: OpportunitySummaryDto[];
  total: number;
  take: number;
  skip: number;
};

/** Counts backing the dashboard summary cards. */
export type OpportunityDashboardStats = {
  newCount: number;
  strongMatchCount: number;
  pursuingCount: number;
  submittedCount: number;
  closingSoonCount: number;
  /**
   * Count per workflow status, with every member present (absent groups are zero)
   * so the dashboard's distribution panel can render a complete pipeline without
   * treating "no rows" as a gap.
   */
  byStatus: Record<OpportunityStatus, number>;

  /** Σ contract value of open opportunities, as a decimal string. */
  pipelineValue: string;
  /** Σ value × probability of win, as a decimal string. */
  weightedValue: string;
  /** Pipeline value divided by the number of open opportunities. */
  averageDealSize: string;
  /** Open opportunities — everything except won, lost and passed. */
  activeCount: number;
  /**
   * Open opportunities that carry a usable contract value. Lower than
   * `activeCount` means `pipelineValue` understates the real pipeline, which the
   * dashboard says out loud rather than presenting the sum as complete.
   */
  pricedCount: number;
  wonCount: number;
  lostCount: number;
  /** Won as a percentage of decided. Null when nothing has been decided yet. */
  winRate: number | null;

  stages: PipelineStageDto[];
  recentAwards: DashboardOpportunityDto[];
  awardForecast: DashboardOpportunityDto[];
  deadlines: DashboardDeadlinesDto;
};

/** One phase of the lifecycle pipeline panel. */
export type PipelineStageDto = {
  name: string;
  /** Σ contract value for the statuses in this phase, as a decimal string. */
  value: string;
  count: number;
};

export type DashboardOpportunityDto = {
  id: string;
  title: string;
  agency: string | null;
  /** COALESCE(max, min) as a decimal string, or null when unpriced. */
  value: string | null;
  probabilityOfWin: number | null;
};

export type DashboardDeadlineDto = {
  id: string;
  title: string;
  agency: string | null;
  /** ISO 8601. Serialized here so the DTO stays JSON-safe. */
  deadline: string;
  status: OpportunityStatus;
};

/** Deadlines bucketed by urgency, matching the dashboard's three columns. */
export type DashboardDeadlinesDto = {
  overdue: DashboardDeadlineDto[];
  thisWeek: DashboardDeadlineDto[];
  upcoming: DashboardDeadlineDto[];
  overdueTotal: number;
  thisWeekTotal: number;
};
