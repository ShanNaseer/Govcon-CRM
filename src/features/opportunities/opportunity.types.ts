import type {
  MatchRecommendation,
  MatchStatus,
  OpportunitySourceType,
  OpportunityStatus,
} from "@/generated/prisma/enums";

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
  primaryNaicsCode: string | null;
  /** Highest overall score across all clients — the list's "match score" column. */
  bestMatchScore: number | null;
  matchCount: number;
};

export type OpportunityDetailDto = Omit<OpportunitySummaryDto, "primaryNaicsCode"> & {
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
