import Link from "next/link";
import { CalendarClock, FileCheck2, Sparkles, Target, Inbox } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { getClientStatusCounts } from "@/features/clients/client.service";
import {
  CLOSING_SOON_DAYS,
  getDashboardStats,
  listOpportunities,
  STRONG_MATCH_THRESHOLD,
} from "@/features/opportunities/opportunity.service";
import { OpportunityRow } from "@/components/opportunities/opportunity-row";
import { Table, TableWrapper, TBody, TH, THead, TR } from "@/components/ui/table";
import { DATABASE_UNAVAILABLE_MESSAGE, safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "Dashboard" };

/** Summary counts are live figures — never served from a build-time cache. */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();

  const result = await safeQuery("dashboard", async () => {
    const [stats, recent, clientCounts] = await Promise.all([
      getDashboardStats(now),
      listOpportunities({ take: 8, skip: 0 }, now),
      getClientStatusCounts(),
    ]);
    return { stats, recent, clientCounts };
  });

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Dashboard" description="Pipeline overview across all clients." />
        <Card>
          <ErrorState title="Dashboard unavailable" description={DATABASE_UNAVAILABLE_MESSAGE} />
        </Card>
      </>
    );
  }

  const { stats, recent, clientCounts } = result.data;
  const totalClients = Object.values(clientCounts).reduce((sum, count) => sum + count, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Pipeline overview across ${totalClients} client${totalClients === 1 ? "" : "s"}.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="New Opportunities"
          value={stats.newCount}
          hint="Awaiting triage"
          icon={<Sparkles className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          label="Strong Matches"
          value={stats.strongMatchCount}
          hint={`Score ≥ ${STRONG_MATCH_THRESHOLD}`}
          icon={<Target className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          label="Pursuing"
          value={stats.pursuingCount}
          hint="Actively being worked"
          icon={<FileCheck2 className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          label="Submitted"
          value={stats.submittedCount}
          hint="Awaiting award"
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent opportunities"
            description="Ordered by response deadline."
            action={
              <Link href="/opportunities" className="text-xs font-medium text-brand hover:underline">
                View all
              </Link>
            }
          />

          {recent.items.length === 0 ? (
            <EmptyState
              title="No opportunities yet"
              description="Once a provider connector is enabled, imported solicitations will appear here."
              icon={<Inbox className="h-5 w-5" aria-hidden />}
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Score</TH>
                    <TH>Title</TH>
                    <TH>Agency</TH>
                    <TH>Deadline</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {recent.items.map((opportunity) => (
                    <OpportunityRow
                      key={opportunity.id}
                      opportunity={opportunity}
                      now={now}
                      variant="compact"
                    />
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </Card>

        <Card>
          <CardHeader title="At a glance" />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Closing within {CLOSING_SOON_DAYS} days</span>
              <span className="numeric font-semibold text-ink">{stats.closingSoonCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Total clients</span>
              <span className="numeric font-semibold text-ink">{totalClients}</span>
            </div>
            {Object.entries(clientCounts).length > 0 ? (
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-xs font-medium tracking-wide text-ink-subtle uppercase">
                  Clients by status
                </p>
                {Object.entries(clientCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between py-0.5 text-sm">
                    <span className="text-ink-muted capitalize">{status.toLowerCase()}</span>
                    <span className="numeric text-ink">{count}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
