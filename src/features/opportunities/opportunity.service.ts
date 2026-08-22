import "server-only";

import type {
  OpportunityDetailRow,
  OpportunitySummaryRow,
} from "@/features/opportunities/opportunity.repository";
import * as repository from "@/features/opportunities/opportunity.repository";
import type {
  CreateOpportunityInput,
  ListOpportunitiesQuery,
  OpportunityPriority,
  OpportunityReviewState,
  OpportunitySort,
  UpdateOpportunityStatusInput,
} from "@/features/opportunities/opportunity.schemas";
import type {
  OpportunityInboxStats,
  DashboardDeadlineDto,
  DashboardDeadlinesDto,
  DashboardOpportunityDto,
  OpportunityDashboardStats,
  OpportunityDetailDto,
  OpportunityListResult,
  OpportunitySummaryDto,
  PipelineStageDto,
} from "@/features/opportunities/opportunity.types";
import { OpportunityStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/**
 * Business logic for the Opportunity domain, and the authorization choke point
 * for it — see the note in client.service.ts for why the check lives here rather
 * than in the dashboard layout.
 */

/** Overall score at or above which a match counts as "strong" on the dashboard. */
export const STRONG_MATCH_THRESHOLD = 75;

/** Deadline window used by the "closing soon" figure. */
export const CLOSING_SOON_DAYS = 14;

function decimalToString(value: { toFixed(digits: number): string } | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function dateToIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function bestScore(scores: Array<number | null>): number | null {
  const present = scores.filter((score): score is number => score !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

/**
 * Urgency band for the inbox card, using the design's thresholds: a strong fit
 * closing soon is high, a decent fit closing within the month is medium.
 *
 * An unscored opportunity is never high or medium — without a fit score there is
 * no basis for the claim, and the design's own rule requires one.
 */
export function derivePriority(
  fitScore: number | null,
  deadline: Date | null,
  now: Date,
): OpportunityPriority {
  if (fitScore === null || deadline === null) return "low";

  const days = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);

  if (fitScore >= 80 && days <= 14) return "high";
  if (fitScore >= 70 && days <= 30) return "medium";
  return "low";
}

/** Rank used when ordering by priority. */
const PRIORITY_RANK: Record<OpportunityPriority, number> = { high: 0, medium: 1, low: 2 };

/** An opportunity is "new" for a week after it was posted. */
const NEW_FOR_DAYS = 7;

/** NEW is the untouched state; every later status means somebody has looked. */
function deriveReviewState(status: OpportunityStatus): OpportunityReviewState {
  return status === OpportunityStatus.NEW ? "unreviewed" : "reviewed";
}

function toSummaryDto(row: OpportunitySummaryRow, now: Date): OpportunitySummaryDto {
  const primary = row.naicsCodes.find((naics) => naics.isPrimary) ?? row.naicsCodes[0];
  const bestMatchScore = bestScore(row.matches.map((match) => match.overallScore));

  return {
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    title: row.title,
    solicitationNumber: row.solicitationNumber,
    agency: row.agency,
    setAside: row.setAside,
    postedDate: dateToIso(row.postedDate),
    responseDeadline: dateToIso(row.responseDeadline),
    status: row.status,
    contractType: row.contractType,
    estimatedValueMin: row.estimatedValueMin === null ? null : String(row.estimatedValueMin),
    estimatedValueMax: row.estimatedValueMax === null ? null : String(row.estimatedValueMax),
    primaryNaicsCode: primary?.code ?? null,
    bestMatchScore,
    matchCount: row.matches.length,
    priority: derivePriority(bestMatchScore, row.responseDeadline, now),
    reviewState: deriveReviewState(row.status),
    isNew:
      row.postedDate !== null &&
      now.getTime() - row.postedDate.getTime() <= NEW_FOR_DAYS * 86_400_000,
  };
}

function toDetailDto(row: OpportunityDetailRow): OpportunityDetailDto {
  return {
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    sourceUrl: row.sourceUrl,
    title: row.title,
    description: row.description,
    solicitationNumber: row.solicitationNumber,
    agency: row.agency,
    subAgency: row.subAgency,
    office: row.office,
    setAside: row.setAside,
    contractType: row.contractType,
    postedDate: dateToIso(row.postedDate),
    responseDeadline: dateToIso(row.responseDeadline),
    estimatedValueMin: decimalToString(row.estimatedValueMin),
    estimatedValueMax: decimalToString(row.estimatedValueMax),
    placeCity: row.placeCity,
    placeState: row.placeState,
    placeCountry: row.placeCountry,
    status: row.status,
    sourceStatus: row.sourceStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),

    bestMatchScore: bestScore(row.matches.map((match) => match.overallScore)),
    matchCount: row.matches.length,

    naicsCodes: row.naicsCodes.map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      isPrimary: item.isPrimary,
    })),
    pscCodes: row.pscCodes.map((item) => ({ id: item.id, code: item.code, title: item.title })),
    attachments: row.attachments.map((item) => ({
      id: item.id,
      fileName: item.fileName,
      contentType: item.contentType,
      fileSize: item.fileSize,
      s3Key: item.s3Key,
      sourceUrl: item.sourceUrl,
      createdAt: item.createdAt.toISOString(),
    })),
    matches: row.matches.map((item) => ({
      id: item.id,
      clientId: item.clientId,
      clientName: item.client.name,
      ruleScore: item.ruleScore,
      semanticScore: item.semanticScore,
      aiScore: item.aiScore,
      overallScore: item.overallScore,
      recommendation: item.recommendation,
      matchReasons: item.matchReasons,
      risks: item.risks,
      status: item.status,
    })),
  };
}

function assertConsistentInput(input: CreateOpportunityInput): void {
  const { estimatedValueMin, estimatedValueMax, postedDate, responseDeadline } = input;

  if (
    estimatedValueMin != null &&
    estimatedValueMax != null &&
    Number(estimatedValueMin) > Number(estimatedValueMax)
  ) {
    throw AppError.validation("Minimum estimated value cannot exceed the maximum estimated value", {
      estimatedValueMin: ["Must be less than or equal to the maximum estimated value"],
    });
  }

  if (postedDate && responseDeadline && postedDate > responseDeadline) {
    throw AppError.validation("The response deadline cannot precede the posted date", {
      responseDeadline: ["Must be on or after the posted date"],
    });
  }
}

/**
 * Applies the orders SQL cannot express.
 *
 * Priority and fit score both derive from the best match score, an aggregate over
 * the `OpportunityMatch` relation that Prisma cannot order by. Sorting here orders
 * the fetched page rather than the whole table, which is correct while a page holds
 * everything and approximate once it does not. Denormalizing the best score onto
 * `Opportunity` would move both orders into SQL; that is the fix if this list grows
 * past one page.
 */
function sortInMemory(items: OpportunitySummaryDto[], sort: OpportunitySort): OpportunitySummaryDto[] {
  if (sort === "priority") {
    return [...items].sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (b.bestMatchScore ?? -1) - (a.bestMatchScore ?? -1),
    );
  }

  if (sort === "fit-score") {
    // Unscored records sort last rather than as zero — see MatchScoreBadge.
    return [...items].sort((a, b) => (b.bestMatchScore ?? -1) - (a.bestMatchScore ?? -1));
  }

  return items;
}

export async function listOpportunities(
  query: ListOpportunitiesQuery,
  now: Date = new Date(),
): Promise<OpportunityListResult> {
  await requireSession();

  const { rows, total } = await repository.findManyOpportunities(query, now);

  let items = rows.map((row) => toSummaryDto(row, now));

  // Derived filters, applied after mapping because both are computed values.
  if (query.review) items = items.filter((item) => item.reviewState === query.review);
  if (query.priority) items = items.filter((item) => item.priority === query.priority);

  items = sortInMemory(items, query.sort);

  return {
    items,
    // Reflects the derived filters, so the "showing N of M" line stays truthful.
    total: query.review || query.priority ? items.length : total,
    take: query.take,
    skip: query.skip,
  };
}

/**
 * Counts for the inbox summary row.
 *
 * Computed over the same filtered result the list shows, so the cards and the list
 * below them can never disagree.
 */
export function summarizeInbox(items: OpportunitySummaryDto[], now: Date): OpportunityInboxStats {
  const weekAhead = now.getTime() + 7 * 86_400_000;
  const scores = items
    .map((item) => item.bestMatchScore)
    .filter((score): score is number => score !== null);

  return {
    total: items.length,
    unreviewed: items.filter((item) => item.reviewState === "unreviewed").length,
    highPriority: items.filter((item) => item.priority === "high").length,
    dueThisWeek: items.filter((item) => {
      if (!item.responseDeadline) return false;
      const deadline = new Date(item.responseDeadline).getTime();
      return deadline >= now.getTime() && deadline <= weekAhead;
    }).length,
    averageFitScore:
      scores.length === 0
        ? null
        : Math.round(scores.reduce((total, score) => total + score, 0) / scores.length),
  };
}

export async function getOpportunityById(id: string): Promise<OpportunityDetailDto> {
  await requireSession();

  const row = await repository.findOpportunityById(id);
  if (!row) throw AppError.notFound("Opportunity", id);
  return toDetailDto(row);
}

export async function findOpportunityById(id: string): Promise<OpportunityDetailDto | null> {
  await requireSession();

  const row = await repository.findOpportunityById(id);
  return row ? toDetailDto(row) : null;
}

/**
 * Creates a normalized opportunity.
 *
 * Duplicate (source, externalId) pairs are rejected explicitly rather than
 * relying on the unique constraint alone, so the caller gets a clear message.
 * The eventual ingestion pipeline will upsert here instead of failing.
 */
export async function createOpportunity(input: CreateOpportunityInput): Promise<OpportunityDetailDto> {
  await requireSession();
  assertConsistentInput(input);

  const existing = await repository.findOpportunityByExternalId(input.source, input.externalId);
  if (existing) {
    throw AppError.conflict(`An opportunity from ${input.source} with this external ID already exists`);
  }

  const row = await repository.createOpportunity(input);

  logger.info("Opportunity created", { opportunityId: row.id, source: row.source });
  return toDetailDto(row);
}

export async function updateOpportunityStatus(
  id: string,
  input: UpdateOpportunityStatusInput,
): Promise<OpportunityDetailDto> {
  await requireSession();

  const existing = await repository.findOpportunityById(id);
  if (!existing) throw AppError.notFound("Opportunity", id);

  const row = await repository.updateOpportunityStatus(id, input);

  logger.info("Opportunity status changed", { opportunityId: id, status: input.status });
  return toDetailDto(row);
}

/**
 * Lifecycle phases of the dashboard's pipeline panel.
 *
 * Four buckets over ten workflow statuses, matching the design's Capture →
 * Proposal → Submitted → Awarded progression. Declared here rather than in the
 * page so the phase definition and the value sums cannot drift apart.
 */
const PIPELINE_STAGES: Array<{ name: string; statuses: OpportunityStatus[] }> = [
  {
    name: "Capture",
    statuses: [
      OpportunityStatus.NEW,
      OpportunityStatus.MATCHED,
      OpportunityStatus.REVIEWING,
      OpportunityStatus.INTERESTED,
    ],
  },
  {
    name: "Proposal",
    statuses: [OpportunityStatus.PURSUING, OpportunityStatus.PROPOSAL_IN_PROGRESS],
  },
  { name: "Submitted", statuses: [OpportunityStatus.SUBMITTED] },
  { name: "Awarded", statuses: [OpportunityStatus.WON] },
];

/** Statuses excluded from "open" pipeline figures. */
const CLOSED_STATUSES: OpportunityStatus[] = [
  OpportunityStatus.WON,
  OpportunityStatus.LOST,
  OpportunityStatus.PASSED,
];

/** A submitted bid at or above this probability counts toward the award forecast. */
export const AWARD_FORECAST_THRESHOLD = 60;

/** How far ahead the award forecast looks for an expected decision. */
export const AWARD_FORECAST_DAYS = 90;

/** Rows shown per deadline urgency column, and per awards list. */
const PANEL_LIST_SIZE = 3;

/**
 * Sums decimal strings exactly.
 *
 * Money is `Decimal(14,2)` in the database and crosses this boundary as a string
 * precisely so it never becomes a float. Adding in cents keeps that guarantee:
 * `Number` on the whole amount would reintroduce the rounding the schema avoids.
 */
function sumMoney(values: string[]): string {
  const cents = values.reduce((total, value) => total + Math.round(Number(value) * 100), 0);
  return (cents / 100).toFixed(2);
}

function divideMoney(total: string, divisor: number): string {
  if (divisor <= 0) return "0.00";
  return (Math.round(Number(total) * 100) / divisor / 100).toFixed(2);
}

/** COALESCE(max, min) — the single figure the dashboard treats as contract value. */
function coalesceValue(row: {
  estimatedValueMax: unknown;
  estimatedValueMin: unknown;
}): string | null {
  const candidate = row.estimatedValueMax ?? row.estimatedValueMin;
  return candidate === null || candidate === undefined ? null : String(candidate);
}

function toDashboardDto(row: {
  id: string;
  title: string;
  agency: string | null;
  estimatedValueMax: unknown;
  estimatedValueMin: unknown;
  probabilityOfWin?: number | null;
}): DashboardOpportunityDto {
  return {
    id: row.id,
    title: row.title,
    agency: row.agency,
    value: coalesceValue(row),
    probabilityOfWin: row.probabilityOfWin ?? null,
  };
}

/**
 * Buckets deadlines by urgency relative to `now`.
 *
 * "This week" is the next seven days from the start of today, so an item due later
 * today is this week rather than overdue.
 */
function bucketDeadlines(
  rows: Array<{
    id: string;
    title: string;
    agency: string | null;
    responseDeadline: Date | null;
    status: OpportunityStatus;
  }>,
  now: Date,
): DashboardDeadlinesDto {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAhead = new Date(startOfToday.getTime() + 7 * 86_400_000);

  const overdue: DashboardDeadlineDto[] = [];
  const thisWeek: DashboardDeadlineDto[] = [];
  const upcoming: DashboardDeadlineDto[] = [];

  for (const row of rows) {
    if (!row.responseDeadline) continue;

    const dto: DashboardDeadlineDto = {
      id: row.id,
      title: row.title,
      agency: row.agency,
      deadline: row.responseDeadline.toISOString(),
      status: row.status,
    };

    if (row.responseDeadline < startOfToday) overdue.push(dto);
    else if (row.responseDeadline < weekAhead) thisWeek.push(dto);
    else upcoming.push(dto);
  }

  return {
    overdue: overdue.slice(0, PANEL_LIST_SIZE),
    thisWeek: thisWeek.slice(0, PANEL_LIST_SIZE),
    upcoming: upcoming.slice(0, PANEL_LIST_SIZE),
    overdueTotal: overdue.length,
    thisWeekTotal: thisWeek.length,
  };
}

export async function getDashboardStats(now: Date = new Date()): Promise<OpportunityDashboardStats> {
  await requireSession();

  const [aggregates, strongMatchCount, closingSoonCount, recentAwards, awardForecast, deadlineRows] =
    await Promise.all([
      repository.aggregateByStatus(),
      repository.countStrongMatches(STRONG_MATCH_THRESHOLD),
      repository.countClosingSoon(now, CLOSING_SOON_DAYS),
      repository.findRecentAwards(PANEL_LIST_SIZE),
      repository.findAwardForecast(
        now,
        AWARD_FORECAST_DAYS,
        AWARD_FORECAST_THRESHOLD,
        PANEL_LIST_SIZE,
      ),
      // Deliberately capped: the panel shows three per column, and a pathological
      // backlog must not turn the dashboard into a full table scan.
      repository.findOpenDeadlines(200),
    ]);

  const byStatus = Object.fromEntries(
    Object.values(OpportunityStatus).map((status) => [status, 0]),
  ) as Record<OpportunityStatus, number>;
  const valueByStatus = Object.fromEntries(
    Object.values(OpportunityStatus).map((status) => [status, "0.00"]),
  ) as Record<OpportunityStatus, string>;

  let pipelineValue = "0.00";
  let weightedValue = "0.00";
  let activeCount = 0;
  let pricedCount = 0;

  for (const row of aggregates) {
    byStatus[row.status] = row.count;
    valueByStatus[row.status] = row.value;

    if (!CLOSED_STATUSES.includes(row.status)) {
      pipelineValue = sumMoney([pipelineValue, row.value]);
      weightedValue = sumMoney([weightedValue, row.weightedValue]);
      activeCount += row.count;
      pricedCount += row.pricedCount;
    }
  }

  const wonCount = byStatus[OpportunityStatus.WON];
  const lostCount = byStatus[OpportunityStatus.LOST];
  const decidedCount = wonCount + lostCount;

  const stages: PipelineStageDto[] = PIPELINE_STAGES.map((stage) => ({
    name: stage.name,
    value: sumMoney(stage.statuses.map((status) => valueByStatus[status])),
    count: stage.statuses.reduce((total, status) => total + byStatus[status], 0),
  }));

  return {
    newCount: byStatus[OpportunityStatus.NEW],
    strongMatchCount,
    pursuingCount: byStatus[OpportunityStatus.PURSUING],
    submittedCount: byStatus[OpportunityStatus.SUBMITTED],
    closingSoonCount,
    byStatus,

    pipelineValue,
    weightedValue,
    averageDealSize: divideMoney(pipelineValue, activeCount),
    activeCount,
    pricedCount,
    wonCount,
    lostCount,
    // Null, not zero: nothing decided is not the same as never winning.
    winRate: decidedCount === 0 ? null : (wonCount / decidedCount) * 100,

    stages,
    recentAwards: recentAwards.map(toDashboardDto),
    awardForecast: awardForecast.map(toDashboardDto),
    deadlines: bucketDeadlines(deadlineRows, now),
  };
}
