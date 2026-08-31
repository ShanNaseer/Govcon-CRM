import Link from "next/link";
import { AlertCircle, Clock, Inbox, Search, Sparkles, TrendingUp } from "lucide-react";

import { InboxStatCard } from "@/components/opportunities/inbox-stat-card";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Pagination } from "@/components/opportunities/pagination";
import {
  OpportunityInboxFilters,
  type FilterOption,
} from "@/components/opportunities/opportunity-inbox-filters";
import { SyncOpportunitiesButton } from "@/components/opportunities/sync-opportunities-button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import {
  listOpportunitiesQuerySchema,
  OPPORTUNITY_FIT_THRESHOLDS,
} from "@/features/opportunities/opportunity.schemas";
import { getInboxStats, listOpportunities } from "@/features/opportunities/opportunity.service";
import { getSyncStatus } from "@/features/opportunities/opportunity.sync.service";
import { OpportunitySourceType } from "@/generated/prisma/enums";
import { requirePagePermission, sessionHasPermission } from "@/lib/auth/session";
import { isHigherGovConfigured } from "@/lib/env";
import { safeQuery } from "@/lib/db/safe-query";
import { humanizeEnum } from "@/lib/utils";

export const metadata = { title: "GovCon Opportunities Inbox" };

export const dynamic = "force-dynamic";

/**
 * Provider filter options.
 *
 * Same labels as the card's source chip — the acronyms need spelling out because
 * `humanizeEnum` would render DIBBS as "Dibbs".
 */
const SOURCE_LABELS: Partial<Record<OpportunitySourceType, string>> = {
  [OpportunitySourceType.SAM_GOV]: "SAM.gov",
  [OpportunitySourceType.DIBBS]: "DIBBS",
  [OpportunitySourceType.SBIR]: "SBIR",
  [OpportunitySourceType.GRANTS]: "Grants",
  [OpportunitySourceType.STATE_PORTAL]: "State & Local",
};

const SOURCE_OPTIONS: FilterOption[] = [
  { value: "", label: "All Sources" },
  ...Object.values(OpportunitySourceType).map((source) => ({
    value: source,
    label: SOURCE_LABELS[source] ?? humanizeEnum(source),
  })),
];

export default async function OpportunitiesPage({ searchParams }: PageProps<"/opportunities">) {
  /*
   * Redirects to the dashboard when the role no longer holds this grant, so a
   * revoked permission reads as "not your page" rather than as an error card. The
   * service checks it again at the data — this is the courtesy, not the boundary.
   */
  const session = await requirePagePermission("opportunities:read");
  const canWrite = sessionHasPermission(session, "opportunities:write");

  const params = await searchParams;
  const now = new Date();

  // URL parameters are untrusted; invalid values fall back to defaults rather than
  // failing the page. Empty strings from the filter bar parse to undefined.
  const parsed = listOpportunitiesQuerySchema.safeParse(
    Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== "" && value !== undefined),
    ),
  );
  const parsedQuery = parsed.success ? parsed.data : listOpportunitiesQuerySchema.parse({});

  /*
   * Two opinionated defaults, both overridable from the filter bar:
   *
   *   deadline "open"  — still open for response, and NOT closing today. A closed
   *                      solicitation cannot be bid and one closing today cannot be
   *                      worked, so both are noise in a triage queue.
   *   fit "strong"     — scored at or above the pursue threshold. On an unfiltered
   *                      government feed the great majority score near zero; listing
   *                      them recreates the problem the matching engine solves.
   *
   * The bar reaches every other combination, so nothing is unreachable.
   */
  const fit = parsedQuery.fit ?? ("strong" as const);

  const query = {
    ...parsedQuery,
    deadline: parsedQuery.deadline ?? ("open" as const),
    /*
     * Translated to the score floor the repository already understands, rather than
     * teaching it a second vocabulary for the same filter. `any` removes the floor —
     * which also lets through solicitations with no match row at all, the state a
     * record sits in between being imported and being scored.
     */
    minMatchScore: fit === "any" ? undefined : OPPORTUNITY_FIT_THRESHOLDS[fit],
  };

  /*
   * "inbox" scope: unclaimed records only. The inbox is the pool nobody has taken
   * yet, so assigning a card to a queue removes it from here — and from the summary
   * counts above the list, which are computed over the same filtered result.
   *
   * Not a URL parameter. The scope is what this page IS, so letting a query string
   * widen it would let anyone browse other people's queues from the inbox.
   */
  const result = await safeQuery("opportunities-list", async () => {
    /*
     * The stats are a separate query over every matching record, not a reduction of
     * the page below — see `getInboxStats`. Issued together so the two see the same
     * database state.
     */
    const [list, stats] = await Promise.all([
      listOpportunities(query, now, "inbox"),
      getInboxStats(query, now, "inbox"),
    ]);

    return { list, stats };
  });

  const feedConfigured = isHigherGovConfigured();

  /*
   * Read through safeQuery like the list itself: a missing sync-state row or an
   * unreachable database must not take down a page whose job is showing opportunities.
   */
  const syncStatus = feedConfigured
    ? await safeQuery("sync-status", () => getSyncStatus())
    : null;

  const header = (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold text-ink">GovCon Opportunities Inbox</h1>
        <p className="mt-0.5 text-[13px] leading-tight text-ink-faint">
          Review newly discovered government opportunities before qualification.
        </p>
      </div>

      {/* Importing changes what the whole team sees, so it needs the write grant. */}
      {canWrite ? (
        <SyncOpportunitiesButton
          configured={feedConfigured}
          lastRunAt={syncStatus?.ok ? syncStatus.data.lastRunAt : null}
        />
      ) : null}
    </div>
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Opportunities unavailable" description={result.message} />
        </Card>
      </>
    );
  }

  const { items, total } = result.data.list;
  const stats = result.data.stats;

  const filterState = {
    search: query.search ?? "",
    source: query.source ?? "",
    priority: query.priority ?? "",
    review: query.review ?? "",
    // Empty means the default, which the bar labels "Open (due after today)".
    deadline: parsedQuery.deadline ?? "",
    fit: parsedQuery.fit ?? "",
    sort: query.sort,
  };

  const isFiltered =
    Boolean(filterState.search) ||
    Boolean(filterState.source) ||
    Boolean(filterState.priority) ||
    Boolean(filterState.review) ||
    Boolean(filterState.deadline) ||
    Boolean(filterState.fit);

  return (
    <>
      {header}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <InboxStatCard
          tone="brand"
          label="Total Inbox"
          value={stats.capped ? `${stats.total}+` : stats.total}
          hint={isFiltered ? "Matching your filters" : undefined}
          icon={<Inbox className="h-5 w-5" aria-hidden />}
        />
        <InboxStatCard
          tone="accent"
          label="Unreviewed"
          value={stats.unreviewed}
          icon={<Sparkles className="h-5 w-5" aria-hidden />}
        />
        <InboxStatCard
          tone="critical"
          label="High Priority"
          value={stats.highPriority}
          icon={<AlertCircle className="h-5 w-5" aria-hidden />}
        />
        <InboxStatCard
          tone="warning"
          label="Due This Week"
          value={stats.dueThisWeek}
          icon={<Clock className="h-5 w-5" aria-hidden />}
        />
        <InboxStatCard
          tone="positive"
          label="Avg Fit Score"
          // A dash rather than 0%: nothing scored is not the same as a poor fit.
          value={stats.averageFitScore === null ? "—" : `${stats.averageFitScore}%`}
          hint={
            stats.averageFitScore === null
              ? "Not yet scored"
              : stats.averageFitScore >= 70
                ? "Good pipeline quality"
                : "Improve match criteria"
          }
          icon={<TrendingUp className="h-5 w-5" aria-hidden />}
        />
      </div>

      <div className="mb-5">
        <OpportunityInboxFilters state={filterState} sourceOptions={SOURCE_OPTIONS} />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-tile">
            <Search className="h-6 w-6 text-ink-muted" aria-hidden />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-ink">
            {isFiltered ? "No results found" : "Inbox is clear"}
          </h3>
          <p className="max-w-sm text-sm text-ink-muted">
            {isFiltered
              ? "Try adjusting your search or filters."
              : feedConfigured
                ? "Nothing is waiting to be triaged. Use Sync now to pull the latest opportunities from HigherGov, or widen the window if today's feed is empty."
                : "Set HIGHERGOV_API_KEY in the environment to start importing opportunities from HigherGov."}
          </p>
          {isFiltered ? (
            <Link href="/opportunities" className="mt-4 text-sm font-medium text-brand hover:underline">
              Clear all filters
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              Showing <span className="font-medium text-ink">{items.length}</span> of {total}{" "}
              opportunit{total === 1 ? "y" : "ies"}
            </p>
          </div>

          <div className="space-y-3">
            {items.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                now={now}
                canWrite={canWrite}
              />
            ))}
          </div>

          <Pagination
            basePath="/opportunities"
            searchParams={params}
            total={total}
            take={query.take}
            skip={query.skip}
          />
        </>
      )}
    </>
  );
}
