import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { OpportunityStatus } from "@/generated/prisma/enums";
import type {
  CreateOpportunityInput,
  ListOpportunitiesQuery,
  UpdateOpportunityStatusInput,
} from "@/features/opportunities/opportunity.schemas";
import { startOfNextBusinessDayUtc } from "@/lib/business-date";
import { prisma } from "@/lib/db/prisma";

/**
 * Data access for the Opportunity aggregate. The only module that queries Prisma
 * for opportunities.
 */

const opportunityDetailInclude = {
  // Name only, for the same reason as the summary select: the DTO reaches the
  // browser, and the owner's email is not the card's business.
  assignedTo: { select: { name: true } },
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
  contractType: true,
  estimatedValueMin: true,
  estimatedValueMax: true,
  assignedToId: true,
  assignedAt: true,
  // Name only. The card shows who holds the record; it has no need for their
  // email, and a DTO that carried one would put it in the RSC payload.
  assignedTo: { select: { name: true } },
  naicsCodes: { select: { code: true, isPrimary: true } },
  /*
   * Ordered so the strongest client match is first: the card shows one verdict, and
   * with several clients it must be the best one rather than an arbitrary one.
   */
  matches: {
    select: { overallScore: true, recommendation: true, matchReasons: true },
    orderBy: { overallScore: "desc" },
  },
} satisfies Prisma.OpportunitySelect;

export type OpportunityDetailRow = Prisma.OpportunityGetPayload<{ include: typeof opportunityDetailInclude }>;
export type OpportunitySummaryRow = Prisma.OpportunityGetPayload<{ select: typeof opportunitySummarySelect }>;

/**
 * Sort order for the list.
 *
 * Only the orders expressible in SQL live here. `priority` and `fit-score` depend
 * on the best match score, which is an aggregate over a relation that Prisma
 * cannot order by — the service sorts those after fetching, so this falls back to
 * the deadline order to keep the fetched window deterministic. See the note on
 * `sortInMemory` in the service.
 */
function buildListOrderBy(
  query: ListOpportunitiesQuery,
): Prisma.OpportunityOrderByWithRelationInput[] {
  if (query.sort === "newest") {
    return [{ postedDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  }

  return [{ responseDeadline: { sort: "asc", nulls: "last" } }, { postedDate: "desc" }];
}

/**
 * Whose queue a listing is about.
 *
 * Resolved by the service, not here: every variant that names a user takes the id
 * as data, so the repository never needs to know who is asking. `undefined` means
 * no ownership restriction at all.
 */
export type AssignmentScope =
  /** Nobody has claimed it — the shared inbox. */
  | { kind: "unclaimed" }
  /** One person's queue. */
  | { kind: "owner"; userId: string }
  /** Claimed, but by anybody other than this user — the team overview. */
  | { kind: "claimedByOthers"; userId: string }
  | undefined;

function assignmentFilter(scope: AssignmentScope): Prisma.OpportunityWhereInput | null {
  if (!scope) return null;

  if (scope.kind === "unclaimed") return { assignedToId: null };
  if (scope.kind === "owner") return { assignedToId: scope.userId };

  // `not: null` as well as `not: userId` — Postgres would drop the NULL rows on the
  // inequality alone, but stating both makes the intent survive a rewrite.
  return { AND: [{ assignedToId: { not: null } }, { assignedToId: { not: scope.userId } }] };
}

function buildListWhere(
  query: ListOpportunitiesQuery,
  now: Date,
  scope: AssignmentScope,
): Prisma.OpportunityWhereInput {
  const filters: Prisma.OpportunityWhereInput[] = [];

  const assignment = assignmentFilter(scope);
  if (assignment) filters.push(assignment);

  /*
   * Deadline window. `now` is passed in rather than read here so a list and its
   * summary counts, computed microseconds apart, cannot disagree about where "today"
   * falls for a solicitation closing in the next instant.
   *
   * "Open" excludes TODAY, not just the past — a solicitation closing today cannot
   * realistically be worked. Which day counts as today is a timezone question, and
   * deliberately not answered with the server's UTC clock: see business-date.ts.
   */
  const tomorrow = startOfNextBusinessDayUtc(now);

  if (query.deadline === "open") filters.push({ responseDeadline: { gte: tomorrow } });
  else if (query.deadline === "expired") filters.push({ responseDeadline: { lt: tomorrow } });
  else if (query.deadline === "undated") filters.push({ responseDeadline: null });

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
  scope: AssignmentScope = undefined,
): Promise<{ rows: OpportunitySummaryRow[]; total: number }> {
  const where = buildListWhere(query, now, scope);

  const [rows, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      select: opportunitySummarySelect,
      // Nulls last so undated records do not crowd out live solicitations.
      orderBy: buildListOrderBy(query),
      take: query.take,
      skip: query.skip,
    }),
    prisma.opportunity.count({ where }),
  ]);

  return { rows, total };
}

/**
 * The minimum needed to compute the inbox summary cards, over EVERY matching record
 * rather than the page on screen.
 *
 * A separate, deliberately narrow query. The cards say "Total Inbox", not "on this
 * page", so computing them from the paginated list made them wrong the moment the
 * inbox outgrew one page — it read 50 when there were 439.
 *
 * Three of the five figures are derived in JavaScript (priority from the best match
 * score and the deadline, review state from the status), which SQL cannot express
 * without duplicating those rules in two places. Selecting three columns for every
 * matching row and reducing them here keeps one definition of each rule. It is bounded
 * by `STATS_ROW_CAP` so the query cannot grow without limit; past that the cards
 * under-report, which `capped` makes visible rather than silent.
 */
const statsSelect = {
  status: true,
  responseDeadline: true,
  matches: { select: { overallScore: true } },
} satisfies Prisma.OpportunitySelect;

export type OpportunityStatsRow = Prisma.OpportunityGetPayload<{ select: typeof statsSelect }>;

/** Ceiling on rows pulled for the summary. Well above a realistic filtered inbox. */
export const STATS_ROW_CAP = 5_000;

export async function findOpportunityStatsRows(
  query: ListOpportunitiesQuery,
  now: Date,
  scope: AssignmentScope = undefined,
): Promise<OpportunityStatsRow[]> {
  return prisma.opportunity.findMany({
    where: buildListWhere(query, now, scope),
    select: statsSelect,
    take: STATS_ROW_CAP,
  });
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

/** What an upsert did, so a sync can report created and updated separately. */
export type UpsertOutcome = "created" | "updated";

export type BatchUpsertResult = {
  created: number;
  updated: number;
  /** Already stored at the same provider version, so not written at all. */
  unchanged: number;
  /** Records that could not be stored. The batch continues past them. */
  failed: number;
};

/**
 * Fields a provider owns, and may therefore overwrite on a re-sync.
 *
 * THE POINT OF THIS FUNCTION IS WHAT IT LEAVES OUT. These never appear here, so an
 * import can never restate them:
 *
 *   status            the team's workflow position. An amended solicitation must not
 *                     jump a record they already marked PASSED back to NEW.
 *   assignedToId      whose queue it is in. A re-sync must not empty someone's queue.
 *   assignedAt
 *   probabilityOfWin  a human's assessment, which no import can restate.
 */
function sourceOwnedFields(input: CreateOpportunityInput) {
  return {
    sourceUrl: input.sourceUrl ?? null,
    title: input.title,
    description: input.description ?? null,
    solicitationNumber: input.solicitationNumber ?? null,
    agency: input.agency ?? null,
    subAgency: input.subAgency ?? null,
    office: input.office ?? null,
    postedDate: input.postedDate ?? null,
    responseDeadline: input.responseDeadline ?? null,
    setAside: input.setAside ?? null,
    contractType: input.contractType ?? null,
    estimatedValueMin: input.estimatedValueMin ?? null,
    estimatedValueMax: input.estimatedValueMax ?? null,
    placeCity: input.placeCity ?? null,
    placeState: input.placeState ?? null,
    placeCountry: input.placeCountry ?? null,
    sourceStatus: input.sourceStatus ?? null,
    sourceVersion: input.sourceVersion ?? null,
    rawData: (input.rawData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };
}

/** Runs `task` over `items` with bounded concurrency, matching the connection pool. */
async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  limit: number,
  task: (item: TItem) => Promise<TResult>,
): Promise<Array<PromiseSettledResult<TResult>>> {
  const results: Array<PromiseSettledResult<TResult>> = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    results.push(...(await Promise.allSettled(chunk.map(task))));
  }

  return results;
}

/**
 * How many writes run at once.
 *
 * Matches `max` in the Prisma adapter's pool. Going wider would queue behind the
 * pool anyway while making a failure harder to attribute.
 */
const WRITE_CONCURRENCY = 5;

/**
 * Inserts or refreshes a batch of opportunities from a provider feed.
 *
 * DELIBERATELY NOT ONE INTERACTIVE TRANSACTION PER RECORD. `DATABASE_URL` points at
 * a connection pooler, which does not hand out the dedicated session an interactive
 * transaction needs — a per-record `$transaction` fails with P2028 ("unable to start
 * a transaction in the given time") under any real load, and costs four or five round
 * trips even when it succeeds. A page of 100 records used to mean 100 transactions.
 *
 * Instead the work is set-shaped: one query to see what already exists, a `createMany`
 * for the new parents, bounded-concurrency updates for the existing ones, and one
 * pass to replace the child codes. That is roughly seven round trips for a page of
 * new records rather than several hundred.
 *
 * The cost of dropping the per-record transaction is that a failure between writing a
 * parent and writing its codes leaves that record with stale codes until the next
 * sync corrects it. That is acceptable and self-healing; refusing to import at all is
 * not.
 *
 * Child codes are replaced rather than merged, so a NAICS the agency removed in an
 * amendment actually disappears.
 */
export async function upsertProviderOpportunities(
  inputs: CreateOpportunityInput[],
): Promise<BatchUpsertResult> {
  if (inputs.length === 0) return { created: 0, updated: 0, unchanged: 0, failed: 0 };

  /*
   * Last occurrence wins if a page somehow repeats a key: two rows with the same
   * `[source, externalId]` in one `createMany` would violate the unique constraint
   * and fail the whole call.
   */
  const byKey = new Map<string, CreateOpportunityInput>();
  for (const input of inputs) byKey.set(`${input.source}\u0000${input.externalId}`, input);
  const records = [...byKey.values()];


  const existing = await prisma.opportunity.findMany({
    where: {
      OR: records.map((record) => ({ source: record.source, externalId: record.externalId })),
    },
    select: { id: true, source: true, externalId: true, sourceVersion: true },
  });

  /** `source` and `externalId` joined by NUL, which cannot occur in either value. */
  const key = (record: { source: string; externalId: string }): string =>
    `${record.source}\u0000${record.externalId}`;

  const idByKey: Map<string, string> = new Map(existing.map((row) => [key(row), row.id]));
  const versionByKey: Map<string, string | null> = new Map(
    existing.map((row) => [key(row), row.sourceVersion]),
  );

  const toCreate = records.filter((record) => !idByKey.has(key(record)));

  /*
   * A record already stored at the same provider version is left completely alone —
   * no parent update, and no child-code churn either.
   *
   * This is the difference between a re-sync costing one write per record and costing
   * nothing. A null version on either side means "cannot tell", which always rewrites:
   * a missed amendment is a real problem, a redundant write is merely slow.
   */
  const existingRecords = records.filter((record) => idByKey.has(key(record)));

  const toUpdate = existingRecords.filter((record) => {
    const storedVersion = versionByKey.get(key(record)) ?? null;
    const incomingVersion = record.sourceVersion ?? null;
    return storedVersion === null || incomingVersion === null || storedVersion !== incomingVersion;
  });

  const unchanged = existingRecords.length - toUpdate.length;

  let failed = 0;

  // --- new parents, in one statement
  if (toCreate.length > 0) {
    await prisma.opportunity.createMany({
      data: toCreate.map((record) => ({
        source: record.source,
        externalId: record.externalId,
        ...sourceOwnedFields(record),
        // Only ever set on insert. See sourceOwnedFields for why status is not there.
        status: record.status,
      })),
      skipDuplicates: true,
    });
  }

  // --- existing parents, one update each because every value differs
  if (toUpdate.length > 0) {
    const outcomes = await mapWithConcurrency(toUpdate, WRITE_CONCURRENCY, (record) =>
      prisma.opportunity.update({
        where: { id: idByKey.get(key(record))! },
        data: sourceOwnedFields(record),
      }),
    );

    failed += outcomes.filter((outcome) => outcome.status === "rejected").length;
  }

  /*
   * Ids are re-read rather than collected above: `createMany` does not return them,
   * and the child codes need them. One query for the whole batch.
   */
  /*
   * Only the records this batch actually wrote need their ids resolved — skipped ones
   * keep the codes they already have. On a re-sync where nothing changed this whole
   * tail is one query over an empty set.
   */
  const written = [...toCreate, ...toUpdate];

  if (written.length === 0) {
    return { created: 0, updated: 0, unchanged, failed };
  }

  const stored = await prisma.opportunity.findMany({
    where: {
      OR: written.map((record) => ({ source: record.source, externalId: record.externalId })),
    },
    select: { id: true, source: true, externalId: true },
  });

  const storedIdByKey: Map<string, string> = new Map(stored.map((row) => [key(row), row.id]));

  const naicsRows = written.flatMap((record) => {
    const id = storedIdByKey.get(key(record));
    return id ? record.naicsCodes.map((code) => ({ ...code, opportunityId: id })) : [];
  });

  const pscRows = written.flatMap((record) => {
    const id = storedIdByKey.get(key(record));
    return id ? record.pscCodes.map((code) => ({ ...code, opportunityId: id })) : [];
  });

  /*
   * Only the records that already existed need their codes cleared — a record just
   * inserted by `createMany` has none. Four statements for the whole batch.
   */
  const updatedIds = toUpdate
    .map((record) => storedIdByKey.get(key(record)))
    .filter((id): id is string => id !== undefined);

  if (updatedIds.length > 0) {
    await prisma.opportunityNaicsCode.deleteMany({ where: { opportunityId: { in: updatedIds } } });
    await prisma.opportunityPscCode.deleteMany({ where: { opportunityId: { in: updatedIds } } });
  }

  if (naicsRows.length > 0) {
    await prisma.opportunityNaicsCode.createMany({ data: naicsRows, skipDuplicates: true });
  }

  if (pscRows.length > 0) {
    await prisma.opportunityPscCode.createMany({ data: pscRows, skipDuplicates: true });
  }

  /*
   * Counted from what actually landed, not from the intent: a `skipDuplicates` insert
   * that collided with a concurrent sync should not be reported as created.
   */
  const createdCount = toCreate.filter((record) => storedIdByKey.has(key(record))).length;

  return {
    created: createdCount,
    updated: toUpdate.length - failed,
    unchanged,
    failed: failed + (toCreate.length - createdCount),
  };
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

/**
 * Takes an opportunity into someone's queue, or returns it to the inbox.
 *
 * Status and ownership move together in one statement so a record can never be
 * observed as claimed-but-still-NEW, or released-but-still-INTERESTED.
 */
export async function setOpportunityOwner(
  id: string,
  assignedToId: string | null,
  status: UpdateOpportunityStatusInput["status"],
  now: Date,
): Promise<OpportunityDetailRow> {
  return prisma.opportunity.update({
    where: { id },
    data: {
      assignedToId,
      // Cleared on release, so the column never claims a hand-off that was undone.
      assignedAt: assignedToId === null ? null : now,
      status,
    },
    include: opportunityDetailInclude,
  });
}

/** How many opportunities sit in one person's queue. */
export async function countOpportunitiesForOwner(assignedToId: string): Promise<number> {
  return prisma.opportunity.count({ where: { assignedToId } });
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
