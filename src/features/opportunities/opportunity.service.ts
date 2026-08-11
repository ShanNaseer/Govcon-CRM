import "server-only";

import type {
  OpportunityDetailRow,
  OpportunitySummaryRow,
} from "@/features/opportunities/opportunity.repository";
import * as repository from "@/features/opportunities/opportunity.repository";
import type {
  CreateOpportunityInput,
  ListOpportunitiesQuery,
  UpdateOpportunityStatusInput,
} from "@/features/opportunities/opportunity.schemas";
import type {
  OpportunityDashboardStats,
  OpportunityDetailDto,
  OpportunityListResult,
  OpportunitySummaryDto,
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

function toSummaryDto(row: OpportunitySummaryRow): OpportunitySummaryDto {
  const primary = row.naicsCodes.find((naics) => naics.isPrimary) ?? row.naicsCodes[0];

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
    primaryNaicsCode: primary?.code ?? null,
    bestMatchScore: bestScore(row.matches.map((match) => match.overallScore)),
    matchCount: row.matches.length,
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

export async function listOpportunities(
  query: ListOpportunitiesQuery,
  now: Date = new Date(),
): Promise<OpportunityListResult> {
  await requireSession();

  const { rows, total } = await repository.findManyOpportunities(query, now);

  return { items: rows.map(toSummaryDto), total, take: query.take, skip: query.skip };
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

export async function getDashboardStats(now: Date = new Date()): Promise<OpportunityDashboardStats> {
  await requireSession();

  const [byStatus, strongMatchCount, closingSoonCount] = await Promise.all([
    repository.countOpportunitiesByStatus(),
    repository.countStrongMatches(STRONG_MATCH_THRESHOLD),
    repository.countClosingSoon(now, CLOSING_SOON_DAYS),
  ]);

  return {
    newCount: byStatus[OpportunityStatus.NEW] ?? 0,
    strongMatchCount,
    pursuingCount: byStatus[OpportunityStatus.PURSUING] ?? 0,
    submittedCount: byStatus[OpportunityStatus.SUBMITTED] ?? 0,
    closingSoonCount,
  };
}
