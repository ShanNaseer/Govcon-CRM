import Link from "next/link";
import { AlertCircle, Clock, Inbox, Search, Sparkles, TrendingUp } from "lucide-react";

import { InboxStatCard } from "@/components/opportunities/inbox-stat-card";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import {
  OpportunityInboxFilters,
  type FilterOption,
} from "@/components/opportunities/opportunity-inbox-filters";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { listOpportunitiesQuerySchema } from "@/features/opportunities/opportunity.schemas";
import { listOpportunities, summarizeInbox } from "@/features/opportunities/opportunity.service";
import { OpportunitySourceType } from "@/generated/prisma/enums";
import { safeQuery } from "@/lib/db/safe-query";
import { humanizeEnum } from "@/lib/utils";

export const metadata = { title: "GovCon Opportunities Inbox" };

export const dynamic = "force-dynamic";

/** Provider filter options, labelled as the design shows them. */
const SOURCE_OPTIONS: FilterOption[] = [
  { value: "", label: "All Sources" },
  ...Object.values(OpportunitySourceType).map((source) => ({
    value: source,
    label: source === OpportunitySourceType.SAM_GOV ? "SAM.gov" : humanizeEnum(source),
  })),
];

export default async function OpportunitiesPage({ searchParams }: PageProps<"/opportunities">) {
  const params = await searchParams;
  const now = new Date();

  // URL parameters are untrusted; invalid values fall back to defaults rather than
  // failing the page. Empty strings from the filter bar parse to undefined.
  const parsed = listOpportunitiesQuerySchema.safeParse(
    Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== "" && value !== undefined),
    ),
  );
  const query = parsed.success ? parsed.data : listOpportunitiesQuerySchema.parse({});

  const result = await safeQuery("opportunities-list", () => listOpportunities(query, now));

  const header = (
    <div className="mb-6">
      <h1 className="text-[22px] leading-tight font-semibold text-ink">GovCon Opportunities Inbox</h1>
      <p className="mt-0.5 text-[13px] leading-tight text-ink-faint">
        Review newly discovered government opportunities before qualification.
      </p>
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

  const { items, total } = result.data;
  const stats = summarizeInbox(items, now);

  const filterState = {
    search: query.search ?? "",
    source: query.source ?? "",
    priority: query.priority ?? "",
    review: query.review ?? "",
    sort: query.sort,
  };

  const isFiltered =
    Boolean(filterState.search) ||
    Boolean(filterState.source) ||
    Boolean(filterState.priority) ||
    Boolean(filterState.review);

  return (
    <>
      {header}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <InboxStatCard
          tone="brand"
          label="Total Inbox"
          value={stats.total}
          hint={isFiltered ? `${stats.total} matching filters` : undefined}
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
              : "New opportunities will appear here once a provider connector imports them. No source integration is enabled in this release."}
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
              <OpportunityCard key={opportunity.id} opportunity={opportunity} now={now} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
