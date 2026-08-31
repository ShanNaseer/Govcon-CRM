import Link from "next/link";
import { AlertCircle, Clock, Inbox, ListChecks, TrendingUp } from "lucide-react";

import { InboxStatCard } from "@/components/opportunities/inbox-stat-card";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Pagination } from "@/components/opportunities/pagination";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { listOpportunitiesQuerySchema } from "@/features/opportunities/opportunity.schemas";
import { getInboxStats, listOpportunities } from "@/features/opportunities/opportunity.service";
import { requirePagePermission, sessionHasPermission } from "@/lib/auth/session";
import { safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "My Queue" };

export const dynamic = "force-dynamic";

/**
 * My Queue — the opportunities this user has taken out of the shared inbox.
 *
 * "Mine" is enforced server-side by the `"mine"` scope, which resolves to the
 * session's own user id. There is deliberately no way to ask for another person's
 * queue from here: that would be a different feature with a different permission,
 * not a URL parameter away.
 */
export default async function MyQueuePage({ searchParams }: PageProps<"/queue">) {
  const session = await requirePagePermission("opportunities:read");
  const canWrite = sessionHasPermission(session, "opportunities:write");

  const params = await searchParams;
  const now = new Date();

  // Same untrusted-input treatment as the inbox: invalid values fall back to
  // defaults rather than failing the page.
  const parsed = listOpportunitiesQuerySchema.safeParse(
    Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== "" && value !== undefined),
    ),
  );
  const query = parsed.success ? parsed.data : listOpportunitiesQuerySchema.parse({});

  const result = await safeQuery("my-queue", async () => {
    const [list, stats] = await Promise.all([
      listOpportunities(query, now, "mine"),
      getInboxStats(query, now, "mine"),
    ]);

    return { list, stats };
  });

  const header = (
    <div className="mb-6">
      <h1 className="text-[22px] leading-tight font-semibold text-ink">My Queue</h1>
      <p className="mt-0.5 text-[13px] leading-tight text-ink-faint">
        Opportunities you have taken from the inbox to qualify.
      </p>
    </div>
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Queue unavailable" description={result.message} />
        </Card>
      </>
    );
  }

  const { items, total } = result.data.list;

  /*
   * The same summary the inbox uses, over the whole queue rather than the page. Its
   * `unreviewed` count is omitted below rather than shown as zero: everything in a
   * queue has been triaged by definition, so the figure would be a constant, and a
   * constant on a stat card reads as information when it is not.
   */
  const stats = result.data.stats;

  return (
    <>
      {header}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InboxStatCard
          tone="brand"
          label="In My Queue"
          value={stats.capped ? `${stats.total}+` : stats.total}
          icon={<ListChecks className="h-5 w-5" aria-hidden />}
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
          icon={<TrendingUp className="h-5 w-5" aria-hidden />}
        />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-tile">
            <ListChecks className="h-6 w-6 text-ink-muted" aria-hidden />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-ink">Your queue is empty</h3>
          <p className="max-w-sm text-sm text-ink-muted">
            Nothing is assigned to you yet. Take something on from the inbox with{" "}
            <span className="font-medium text-ink">Assign to My Queue</span>.
          </p>
          <Link
            href="/opportunities"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <Inbox className="h-4 w-4" aria-hidden />
            Go to the inbox
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              Showing <span className="font-medium text-ink">{items.length}</span> of {total}{" "}
              opportunit{total === 1 ? "y" : "ies"} assigned to you
            </p>
          </div>

          <div className="space-y-3">
            {items.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                now={now}
                canWrite={canWrite}
                context="queue"
              />
            ))}
          </div>

          <Pagination
            basePath="/queue"
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
