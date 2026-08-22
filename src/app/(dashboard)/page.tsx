import type { ReactNode } from "react";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  Clock,
  DollarSign,
  ShoppingCart,
  Star,
  Target,
  TrendingUp,
  XCircle,
  AlertTriangle,
  FileText,
  Inbox,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { OpportunityRow } from "@/components/opportunities/opportunity-row";
import { Table, TableWrapper, TBody, TH, THead, TR } from "@/components/ui/table";
import {
  AWARD_FORECAST_THRESHOLD,
  getDashboardStats,
  listOpportunities,
} from "@/features/opportunities/opportunity.service";
import type {
  DashboardDeadlineDto,
  DashboardOpportunityDto,
} from "@/features/opportunities/opportunity.types";
import { DATABASE_UNAVAILABLE_MESSAGE, safeQuery } from "@/lib/db/safe-query";
import { cn, formatDate, formatMillions } from "@/lib/utils";

export const metadata = { title: "Lifecycle Dashboard" };

/** Summary figures are live — never served from a build-time cache. */
export const dynamic = "force-dynamic";

/** Section heading treatment shared by the design's dashboard panels. */
const PANEL_TITLE = "text-xl leading-7 font-semibold text-ink";

/**
 * One urgency column of the deadlines panel. The design colours the whole column —
 * heading, row border and row fill — from a single hue per urgency.
 */
function DeadlineColumn({
  label,
  icon,
  items,
  emptyLabel,
  tone,
}: {
  label: string;
  icon: ReactNode;
  items: DashboardDeadlineDto[];
  emptyLabel: string;
  tone: { text: string; border: string; surface: string };
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className={tone.text}>{icon}</span>
        <p className={cn("text-sm font-semibold", tone.text)}>{label}</p>
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-muted">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/opportunities/${item.id}`}
              className={cn(
                "block rounded-lg border p-3 transition-shadow hover:shadow-sm",
                tone.border,
                tone.surface,
              )}
            >
              <p className="mb-1 truncate text-sm font-medium text-ink">{item.title}</p>
              <div className="flex items-center gap-2">
                <Clock className={cn("h-3 w-3", tone.text)} aria-hidden />
                <p className={cn("text-xs", tone.text)}>{formatDate(item.deadline)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** A row in the awards panel — a won contract, or a forecast with its probability. */
function AwardRow({
  item,
  tone,
}: {
  item: DashboardOpportunityDto;
  tone: "awarded" | "forecast";
}) {
  const isAwarded = tone === "awarded";

  return (
    <Link
      href={`/opportunities/${item.id}`}
      className={cn(
        "block rounded-lg border p-3 transition-shadow hover:shadow-md",
        isAwarded ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-[#fde68a] bg-[#fffbeb]",
      )}
    >
      {!isAwarded && item.probabilityOfWin !== null ? (
        <span className="mb-1 inline-flex rounded-full bg-[#d97706] px-2 py-0.5 text-xs font-medium text-white">
          P(Win): {item.probabilityOfWin}%
        </span>
      ) : null}

      <p className="mb-1 text-sm font-medium text-ink">{item.title}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs text-ink-muted">{item.agency ?? "Agency not stated"}</p>
        {isAwarded ? (
          <span className="shrink-0 rounded-full bg-[#16a34a] px-2 py-0.5 text-xs font-medium text-white">
            Awarded
          </span>
        ) : (
          <span className="numeric shrink-0 text-xs text-ink-muted">
            {item.value === null ? "Unpriced" : formatMillions(item.value)}
          </span>
        )}
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const now = new Date();

  const result = await safeQuery("dashboard", async () => {
    const [stats, recent] = await Promise.all([
      getDashboardStats(now),
      listOpportunities({ take: 5, skip: 0, sort: "due-date" }, now),
    ]);
    return { stats, recent };
  });

  const header = (
    <PageHeader
      title="Lifecycle Dashboard"
      description="Complete operational overview and performance metrics across the GovCon lifecycle"
      actions={
        <ButtonLink href="/opportunities" variant="primary">
          <Target aria-hidden />
          View All Opportunities
        </ButtonLink>
      }
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Dashboard unavailable" description={DATABASE_UNAVAILABLE_MESSAGE} />
        </Card>
      </>
    );
  }

  const { stats, recent } = result.data;
  const pipelineTotal = Number(stats.pipelineValue);

  return (
    <>
      {header}

      {/* Key metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          tone="brand"
          icon={<DollarSign className="h-5 w-5" aria-hidden />}
          value={formatMillions(stats.pipelineValue)}
          label="Pipeline Value"
          hint={`${stats.activeCount} Active Opportunit${stats.activeCount === 1 ? "y" : "ies"}`}
        />
        <StatCard
          tone="positive"
          icon={<TrendingUp className="h-5 w-5" aria-hidden />}
          value={formatMillions(stats.weightedValue)}
          label="Weighted Value"
          hint="Pipeline × Win Probability"
        />
        <StatCard
          tone="accent"
          icon={<ShoppingCart className="h-5 w-5" aria-hidden />}
          value={formatMillions(stats.averageDealSize)}
          label="Avg Deal Size"
          hint="Per Active Opportunity"
        />
        <StatCard
          tone="warning"
          icon={<Star className="h-5 w-5" aria-hidden />}
          // A dash, not 0%, while nothing has been decided — see `winRate` in the service.
          value={stats.winRate === null ? "—" : `${stats.winRate.toFixed(0)}%`}
          label="Win Rate"
          hint="Won vs Closed Opportunities"
        />
      </div>

      {/* Pipeline value by stage */}
      <Card className="mt-6 p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className={PANEL_TITLE}>Pipeline by Lifecycle Stage</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Contract value distribution across the GovCon lifecycle
            </p>
          </div>
          <span className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-sm text-ink">
            {formatMillions(stats.pipelineValue)} Total
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {stats.stages.map((stage) => {
            const stageValue = Number(stage.value);
            // Share of the open pipeline. Awarded work sits outside that total, so its
            // bar is scaled against itself rather than exceeding 100%.
            const share =
              pipelineTotal <= 0 ? 0 : Math.min(100, (stageValue / pipelineTotal) * 100);

            return (
              <div key={stage.name} className="rounded-lg bg-tile p-6 text-center">
                <p className="numeric mb-4 text-2xl font-semibold text-ink">
                  {formatMillions(stage.value)}
                </p>
                <p className="mb-4 text-base text-ink-muted">{stage.name}</p>
                <div
                  className="h-3 w-full overflow-hidden rounded-full bg-tile-track"
                  role="img"
                  aria-label={`${stage.count} opportunit${stage.count === 1 ? "y" : "ies"}, ${formatMillions(stage.value)}`}
                >
                  <div
                    className="h-3 rounded-full bg-brand-light transition-all duration-300"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recent work and awards */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            size="lg"
            icon={<FileText className="h-5 w-5 text-brand" aria-hidden />}
            title="Recent Opportunities"
            description="Ordered by response deadline"
            action={
              <Link href="/opportunities" className="text-sm font-medium text-ink hover:underline">
                View All
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

        <Card className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className={cn(PANEL_TITLE, "flex items-center gap-2")}>
                <Award className="h-5 w-5 text-[#d97706]" aria-hidden />
                Awards &amp; Forecast
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Recent awards and high-probability opportunities
              </p>
            </div>
          </div>

          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-[#f0fdf4] p-3">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Award className="h-4 w-4 text-[#16a34a]" aria-hidden />
                Recent Awards
              </span>
              <span className="numeric text-lg font-bold text-[#16a34a]">{stats.wonCount}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#fffbeb] p-3">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <TrendingUp className="h-4 w-4 text-[#d97706]" aria-hidden />
                High P(Win) Submitted
              </span>
              <span className="numeric text-lg font-bold text-[#d97706]">
                {stats.awardForecast.length}
              </span>
            </div>
          </div>

          {stats.recentAwards.length > 0 ? (
            <div className="space-y-2">
              <p className="mb-2 text-xs font-semibold text-ink-muted">RECENT CONTRACT AWARDS:</p>
              {stats.recentAwards.map((item) => (
                <AwardRow key={item.id} item={item} tone="awarded" />
              ))}
            </div>
          ) : stats.awardForecast.length > 0 ? (
            <div className="space-y-2">
              <p className="mb-2 text-xs font-semibold text-ink-muted">
                LIKELY AWARDS (≥{AWARD_FORECAST_THRESHOLD}% P(WIN)):
              </p>
              {stats.awardForecast.map((item) => (
                <AwardRow key={item.id} item={item} tone="forecast" />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-ink-muted">
              No recent awards or high-probability forecasts
            </p>
          )}
        </Card>
      </div>

      {/* Deadlines by urgency */}
      <Card className="mt-6 p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className={cn(PANEL_TITLE, "flex items-center gap-2")}>
              <Clock className="h-5 w-5 text-critical" aria-hidden />
              Upcoming Deadlines
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Response deadlines by urgency</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {stats.deadlines.overdueTotal > 0 ? (
              <span className="rounded-full bg-critical px-2 py-0.5 text-xs font-medium text-white">
                {stats.deadlines.overdueTotal} Overdue
              </span>
            ) : null}
            {stats.deadlines.thisWeekTotal > 0 ? (
              <span className="rounded-full bg-[#ffedd5] px-2 py-0.5 text-xs font-medium text-[#9a3412]">
                {stats.deadlines.thisWeekTotal} This Week
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <DeadlineColumn
            label="OVERDUE"
            icon={<XCircle className="h-4 w-4" aria-hidden />}
            items={stats.deadlines.overdue}
            emptyLabel="No overdue items"
            tone={{ text: "text-critical", border: "border-[#fecaca]", surface: "bg-[#fef2f2]" }}
          />
          <DeadlineColumn
            label="THIS WEEK"
            icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
            items={stats.deadlines.thisWeek}
            emptyLabel="No deadlines this week"
            tone={{ text: "text-[#ea580c]", border: "border-[#fed7aa]", surface: "bg-[#fff7ed]" }}
          />
          <DeadlineColumn
            label="UPCOMING"
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
            items={stats.deadlines.upcoming}
            emptyLabel="No upcoming deadlines"
            tone={{ text: "text-[#2563eb]", border: "border-[#bfdbfe]", surface: "bg-[#eff6ff]" }}
          />
        </div>
      </Card>
    </>
  );
}
