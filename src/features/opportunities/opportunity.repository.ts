import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { OpportunityStatus } from "@/generated/prisma/enums";
import type {
  CreateOpportunityInput,
  ListOpportunitiesQuery,
  UpdateOpportunityStatusInput,
} from "@/features/opportunities/opportunity.schemas";
import { prisma } from "@/lib/db/prisma";

/**
 * Data access for the Opportunity aggregate. The only module that queries Prisma
 * for opportunities.
 */

const opportunityDetailInclude = {
  naicsCodes: { orderBy: [{ isPrimary: "desc" }, { code: "asc" }] },
  pscCodes: { orderBy: { code: "asc" } },
  attachments: { orderBy: { createdAt: "asc" } },
  matches: {
    orderBy: { overallScore: "desc" },
    include: { client: { select: { id: true, name: true } } },
  },
} satisfies Prisma.OpportunityInclude;

const opportunitySummarySelect = {
  id: true,
  source: true,
  externalId: true,
  title: true,
  solicitationNumber: true,
  agency: true,
  setAside: true,
  postedDate: true,
  responseDeadline: true,
  status: true,
  naicsCodes: { select: { code: true, isPrimary: true } },
  matches: { select: { overallScore: true } },
} satisfies Prisma.OpportunitySelect;

export type OpportunityDetailRow = Prisma.OpportunityGetPayload<{ include: typeof opportunityDetailInclude }>;
export type OpportunitySummaryRow = Prisma.OpportunityGetPayload<{ select: typeof opportunitySummarySelect }>;

function buildListWhere(query: ListOpportunitiesQuery, now: Date): Prisma.OpportunityWhereInput {
  const filters: Prisma.OpportunityWhereInput[] = [];

  if (query.source) filters.push({ source: query.source });
  if (query.status) filters.push({ status: query.status });
  if (query.agency) filters.push({ agency: { contains: query.agency, mode: "insensitive" } });
  if (query.setAside) filters.push({ setAside: { contains: query.setAside, mode: "insensitive" } });
  if (query.naicsCode) filters.push({ naicsCodes: { some: { code: { startsWith: query.naicsCode } } } });

  if (query.deadlineWithinDays !== undefined) {
    const cutoff = new Date(now.getTime() + query.deadlineWithinDays * 86_400_000);
    filters.push({ responseDeadline: { gte: now, lte: cutoff } });
  }

  if (query.minMatchScore !== undefined) {
    filters.push({ matches: { some: { overallScore: { gte: query.minMatchScore } } } });
  }

  if (query.search) {
    filters.push({
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { solicitationNumber: { contains: query.search, mode: "insensitive" } },
        { agency: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }

  return filters.length > 0 ? { AND: filters } : {};
}

export async function findManyOpportunities(
  query: ListOpportunitiesQuery,
  now: Date,
): Promise<{ rows: OpportunitySummaryRow[]; total: number }> {
  const where = buildListWhere(query, now);

  const [rows, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      select: opportunitySummarySelect,
      // Nulls last so undated records do not crowd out live solicitations.
      orderBy: [{ responseDeadline: { sort: "asc", nulls: "last" } }, { postedDate: "desc" }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.opportunity.count({ where }),
  ]);

  return { rows, total };
}

export async function findOpportunityById(id: string): Promise<OpportunityDetailRow | null> {
  return prisma.opportunity.findUnique({ where: { id }, include: opportunityDetailInclude });
}

export async function findOpportunityByExternalId(
  source: CreateOpportunityInput["source"],
  externalId: string,
): Promise<{ id: string } | null> {
  return prisma.opportunity.findUnique({
    where: { source_externalId: { source, externalId } },
    select: { id: true },
  });
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<OpportunityDetailRow> {
  return prisma.opportunity.create({
    data: {
      source: input.source,
      externalId: input.externalId,
      sourceUrl: input.sourceUrl,
      title: input.title,
      description: input.description,
      solicitationNumber: input.solicitationNumber,
      agency: input.agency,
      subAgency: input.subAgency,
      office: input.office,
      postedDate: input.postedDate ?? null,
      responseDeadline: input.responseDeadline ?? null,
      setAside: input.setAside,
      contractType: input.contractType,
      estimatedValueMin: input.estimatedValueMin ?? null,
      estimatedValueMax: input.estimatedValueMax ?? null,
      placeCity: input.placeCity,
      placeState: input.placeState,
      placeCountry: input.placeCountry,
      status: input.status,
      sourceStatus: input.sourceStatus,
      rawData: (input.rawData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      naicsCodes: { create: input.naicsCodes },
      pscCodes: { create: input.pscCodes },
    },
    include: opportunityDetailInclude,
  });
}

export async function updateOpportunityStatus(
  id: string,
  input: UpdateOpportunityStatusInput,
): Promise<OpportunityDetailRow> {
  return prisma.opportunity.update({
    where: { id },
    data: { status: input.status },
    include: opportunityDetailInclude,
  });
}

export async function countOpportunitiesByStatus(): Promise<Record<string, number>> {
  const grouped = await prisma.opportunity.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
}

/** Opportunities with at least one high-scoring match, used by the dashboard cards. */
export async function countStrongMatches(threshold: number): Promise<number> {
  return prisma.opportunity.count({
    where: { matches: { some: { overallScore: { gte: threshold } } } },
  });
}

export async function countClosingSoon(now: Date, withinDays: number): Promise<number> {
  return prisma.opportunity.count({
    where: {
      responseDeadline: { gte: now, lte: new Date(now.getTime() + withinDays * 86_400_000) },
      status: { notIn: [OpportunityStatus.PASSED, OpportunityStatus.LOST, OpportunityStatus.WON] },
    },
  });
}

/**
 * Per-status contract value and weighted value, for the dashboard's pipeline panel.
 *
 * Raw SQL because the figure is `COALESCE(max, min)` — an expression Prisma's
 * `groupBy` cannot aggregate — and because summing in JavaScript would mean
 * loading every row to add up four numbers.
 *
 * Sums are cast to text: `numeric` arrives as a driver-specific type, and text
 * keeps full precision on the way to the Decimal-aware formatter.
 */
export type StatusAggregateRow = {
  status: OpportunityStatus;
  count: number;
  /** Σ COALESCE(estimatedValueMax, estimatedValueMin) — unpriced rows contribute 0. */
  value: string;
  /** Σ value × probabilityOfWin/100 — an unassessed probability contributes 0. */
  weightedValue: string;
  /** Rows carrying a usable value, so the UI can say how complete the figure is. */
  pricedCount: number;
};

export async function aggregateByStatus(): Promise<StatusAggregateRow[]> {
  return prisma.$queryRaw<StatusAggregateRow[]>(Prisma.sql`
    SELECT
      "status",
      COUNT(*)::int AS "count",
      COALESCE(SUM(COALESCE("estimatedValueMax", "estimatedValueMin")), 0)::text AS "value",
      COALESCE(
        SUM(
          COALESCE("estimatedValueMax", "estimatedValueMin")
            * COALESCE("probabilityOfWin", 0) / 100.0
        ),
        0
      )::text AS "weightedValue",
      COUNT(COALESCE("estimatedValueMax", "estimatedValueMin"))::int AS "pricedCount"
    FROM "Opportunity"
    GROUP BY "status"
  `);
}

/** Most recently awarded opportunities, for the dashboard's awards panel. */
export async function findRecentAwards(take: number) {
  return prisma.opportunity.findMany({
    where: { status: OpportunityStatus.WON },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, title: true, agency: true, estimatedValueMax: true, estimatedValueMin: true },
  });
}

/**
 * Submitted bids likely to be awarded: a decision expected inside `withinDays` and
 * an assessed probability at or above `minProbability`.
 */
export async function findAwardForecast(
  now: Date,
  withinDays: number,
  minProbability: number,
  take: number,
) {
  return prisma.opportunity.findMany({
    where: {
      status: OpportunityStatus.SUBMITTED,
      probabilityOfWin: { gte: minProbability },
      responseDeadline: { lte: new Date(now.getTime() + withinDays * 86_400_000) },
    },
    orderBy: { probabilityOfWin: "desc" },
    take,
    select: {
      id: true,
      title: true,
      agency: true,
      probabilityOfWin: true,
      estimatedValueMax: true,
      estimatedValueMin: true,
    },
  });
}

/**
 * Open opportunities with a deadline, ordered soonest first, for the deadline panel.
 * Bucketing into overdue / this week / upcoming happens in the service, where the
 * clock is already injected.
 */
export async function findOpenDeadlines(take: number) {
  return prisma.opportunity.findMany({
    where: {
      responseDeadline: { not: null },
      status: {
        notIn: [OpportunityStatus.PASSED, OpportunityStatus.LOST, OpportunityStatus.WON],
      },
    },
    orderBy: { responseDeadline: "asc" },
    take,
    select: { id: true, title: true, agency: true, responseDeadline: true, status: true },
  });
}
