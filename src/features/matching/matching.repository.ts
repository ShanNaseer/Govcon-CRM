import "server-only";

import { ClientStatus, Prisma } from "@/generated/prisma/client";
import type {
  MatchableClient,
  MatchableOpportunity,
  MatchResult,
} from "@/features/matching/matching.types";
import { prisma } from "@/lib/db/prisma";

/**
 * Data access for the matching pipeline.
 *
 * The rules themselves are pure and never touch the database — this module assembles
 * the projections they read and stores what they produce.
 */

/** Money arrives as Prisma `Decimal`; the rules work in plain numbers. */
function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Clients worth matching against.
 *
 * ARCHIVED and INACTIVE are excluded: scoring hundreds of opportunities against a
 * client nobody is working is pure cost, and the results would clutter every card.
 */
export async function findMatchableClients(): Promise<MatchableClient[]> {
  const rows = await prisma.client.findMany({
    where: { status: { in: [ClientStatus.ACTIVE, ClientStatus.PROSPECT] } },
    include: {
      naicsCodes: { select: { code: true } },
      pscCodes: { select: { code: true } },
      setAsides: { select: { code: true } },
      keywords: { select: { keyword: true, type: true } },
      preferredAgencies: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    naicsCodes: row.naicsCodes.map((entry) => entry.code),
    pscCodes: row.pscCodes.map((entry) => entry.code),
    setAsideCodes: row.setAsides.map((entry) => entry.code),
    positiveKeywords: row.keywords.filter((k) => k.type === "POSITIVE").map((k) => k.keyword),
    negativeKeywords: row.keywords.filter((k) => k.type === "NEGATIVE").map((k) => k.keyword),
    preferredAgencies: row.preferredAgencies.map((entry) => entry.name),
    geographicPreferences: row.geographicPreferences,
    capabilityDescription: row.capabilityDescription,
    minContractValue: toNumber(row.minContractValue),
    maxContractValue: toNumber(row.maxContractValue),
  }));
}

/**
 * Opportunities to score.
 *
 * `openOnly` skips anything past its response date. Scoring an expired solicitation
 * produces a match nobody can act on, and this feed carries hundreds of them.
 */
export async function findMatchableOpportunities(options: {
  openOnly: boolean;
  now: Date;
  take: number;
}): Promise<MatchableOpportunity[]> {
  const rows = await prisma.opportunity.findMany({
    where: options.openOnly ? { responseDeadline: { gt: options.now } } : {},
    select: {
      id: true,
      title: true,
      description: true,
      agency: true,
      setAside: true,
      placeState: true,
      estimatedValueMin: true,
      estimatedValueMax: true,
      naicsCodes: { select: { code: true } },
      pscCodes: { select: { code: true } },
    },
    // Soonest deadline first, so a truncated run scores the most urgent work.
    orderBy: [{ responseDeadline: { sort: "asc", nulls: "last" } }],
    take: options.take,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    agency: row.agency,
    setAside: row.setAside,
    naicsCodes: row.naicsCodes.map((entry) => entry.code),
    pscCodes: row.pscCodes.map((entry) => entry.code),
    placeState: row.placeState,
    estimatedValueMin: toNumber(row.estimatedValueMin),
    estimatedValueMax: toNumber(row.estimatedValueMax),
  }));
}

/**
 * Stores a batch of results.
 *
 * Set-shaped, not one upsert per pair, and NOT an interactive transaction — the same
 * two constraints the opportunity sync ran into. `DATABASE_URL` points at a pooler
 * that will not grant a session for a long interactive transaction, and at roughly
 * 300ms a round trip a per-row upsert over hundreds of pairs takes minutes.
 *
 * Existing rows are deleted and reinserted rather than updated: a match is a derived
 * value with no history worth preserving, so replacing the client's whole result set
 * is both simpler and cheaper than diffing it.
 */
export async function replaceMatchesForClient(
  clientId: string,
  results: MatchResult[],
): Promise<number> {
  await prisma.opportunityMatch.deleteMany({ where: { clientId } });

  if (results.length === 0) return 0;

  const { count } = await prisma.opportunityMatch.createMany({
    data: results.map((result) => ({
      clientId: result.clientId,
      opportunityId: result.opportunityId,
      ruleScore: result.ruleScore,
      semanticScore: result.semanticScore,
      aiScore: result.aiScore,
      overallScore: result.overallScore,
      recommendation: result.recommendation,
      matchReasons: result.matchReasons,
      risks: result.risks,
    })),
    skipDuplicates: true,
  });

  return count;
}
