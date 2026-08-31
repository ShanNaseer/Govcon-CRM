import Link from "next/link";
import {
  AlertCircle,
  Building2,
  Calendar,
  Eye,
  FileText,
  Sparkles,
  Tag,
  TrendingUp,
  UserCheck,
} from "lucide-react";

import { AssignOwnerSelect } from "@/components/opportunities/assign-owner-select";
import { QueueActions, TriageActions } from "@/components/opportunities/triage-actions";
import type { OpportunitySummaryDto } from "@/features/opportunities/opportunity.types";
import type { AssignableOwnerDto } from "@/features/team/team.types";
import type { OpportunityPriority } from "@/features/opportunities/opportunity.schemas";
import { cn, daysUntil, formatCurrencyRange, formatDate, humanizeEnum } from "@/lib/utils";

/**
 * One opportunity as a triage card, transcribed from the design's inbox.
 *
 * Structure: a priority stripe down the left edge, then title with NEW/priority
 * flags and a review-state pill, a meta line, attribute chips, a four-column data
 * row, and the action bar.
 */

const PRIORITY_CONFIG: Record<
  OpportunityPriority,
  { stripe: string; label: string; flag: string | null; icon: typeof AlertCircle | null }
> = {
  high: {
    stripe: "bg-fit-poor",
    label: "High Priority",
    flag: "bg-fit-poor/10 text-fit-poor",
    icon: AlertCircle,
  },
  medium: {
    stripe: "bg-fit-weak",
    label: "Medium Priority",
    flag: "bg-fit-weak/10 text-[#b8600a]",
    icon: TrendingUp,
  },
  // Low priority gets a neutral edge and no flag — the design only calls out urgency.
  low: { stripe: "bg-line", label: "Low Priority", flag: null, icon: null },
};

/** Fit-score colour bands, per the design. */
function fitClasses(score: number): { text: string; bar: string } {
  if (score >= 80) return { text: "text-fit-strong", bar: "bg-fit-strong" };
  if (score >= 60) return { text: "text-fit-fair", bar: "bg-fit-fair" };
  if (score >= 40) return { text: "text-fit-weak", bar: "bg-fit-weak" };
  return { text: "text-fit-poor", bar: "bg-fit-poor" };
}

/** Provider enum to the label the design shows. */
function sourceLabel(source: string): string {
  /*
   * Names the upstream government system, since that is what `source` records. The
   * three acronyms would otherwise come out title-cased by `humanizeEnum` ("Dibbs"),
   * which reads as a typo to anyone in this industry.
   */
  const LABELS: Record<string, string> = {
    SAM_GOV: "SAM.gov",
    DIBBS: "DIBBS",
    SBIR: "SBIR",
    GRANTS: "Grants",
    STATE_PORTAL: "State & Local",
  };

  return LABELS[source] ?? humanizeEnum(source);
}

function Chip({
  label,
  icon: Icon,
  className,
}: {
  label: string;
  icon?: typeof Tag;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className ?? "bg-field text-ink-muted",
      )}
    >
      {Icon ? <Icon className="h-2.5 w-2.5" aria-hidden /> : null}
      {label}
    </span>
  );
}

function DataCell({
  label,
  children,
  sub,
  className,
}: {
  label: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-semibold tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="truncate text-sm leading-tight font-semibold text-ink">{children}</p>
      {sub ? <p className="mt-0.5 truncate text-[10px] text-ink-muted">{sub}</p> : null}
    </div>
  );
}

export function OpportunityCard({
  opportunity,
  now,
  canWrite,
  context = "inbox",
  assignableOwners,
}: {
  opportunity: OpportunitySummaryDto;
  now: Date;
  /**
   * `opportunities:write`, resolved on the server from the role matrix. Presentation
   * only — the triage Server Functions check it again before they write.
   */
  canWrite: boolean;
  /**
   * Which list the card is in. "inbox" offers Assign / Reviewed / Pass; "queue"
   * offers Return to Inbox / Pass and shows who holds it.
   */
  context?: "inbox" | "queue";
  /**
   * People this can be handed to. Supplied only when the viewer holds
   * `opportunities:assign`; absent or empty means no picker is rendered.
   */
  assignableOwners?: AssignableOwnerDto[];
}) {
  const priority = PRIORITY_CONFIG[opportunity.priority];
  const PriorityIcon = priority.icon;

  const score = opportunity.bestMatchScore;
  const fit = score === null ? null : fitClasses(score);

  const remainingDays = daysUntil(opportunity.responseDeadline, now);
  const isUrgent = remainingDays !== null && remainingDays <= 7;
  const isReviewed = opportunity.reviewState === "reviewed";

  return (
    <article className="relative overflow-hidden rounded-inbox-card border border-line bg-surface transition-shadow hover:shadow-sm">
      <div aria-hidden className={cn("absolute inset-y-0 left-0 w-1", priority.stripe)} />

      <div className="px-5 py-4">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-sm leading-snug font-semibold text-ink">
                <Link href={`/opportunities/${opportunity.id}`} className="hover:text-brand hover:underline">
                  {opportunity.title}
                </Link>
              </h3>

              {opportunity.isNew ? (
                <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                  New
                </span>
              ) : null}

              {priority.flag && PriorityIcon ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold",
                    priority.flag,
                  )}
                >
                  <PriorityIcon className="h-2.5 w-2.5" aria-hidden />
                  {priority.label}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              {opportunity.agency ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="max-w-40 truncate">{opportunity.agency}</span>
                </span>
              ) : null}

              {opportunity.solicitationNumber ? (
                <span className="numeric inline-flex shrink-0 items-center gap-1">
                  <FileText className="h-3 w-3 shrink-0" aria-hidden />
                  {opportunity.solicitationNumber}
                </span>
              ) : null}

              {/*
                * Why the engine ranked it, in the meta row rather than a separate
                * block: the reason is only useful next to the score it explains.
                */}
              {opportunity.topMatchReasons.length > 0 ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-fit-strong">
                  <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="max-w-72 truncate" title={opportunity.topMatchReasons.join(" · ")}>
                    {opportunity.topMatchReasons.join(" · ")}
                  </span>
                </span>
              ) : null}

              {opportunity.postedDate ? (
                <span className="inline-flex shrink-0 items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                  Posted {formatDate(opportunity.postedDate)}
                </span>
              ) : null}

              {/*
               * Who holds it, and since when. Shown wherever an owner exists rather
               * than only in My Queue: a claimed record can still be reached from
               * the dashboard and from search, and "whose desk is this on" is the
               * first thing to know about one.
               */}
              {opportunity.assignedToName ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-brand">
                  <UserCheck className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="max-w-40 truncate">
                    {context === "queue" ? "In your queue" : opportunity.assignedToName}
                    {opportunity.assignedAt ? ` · ${formatDate(opportunity.assignedAt)}` : ""}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
              isReviewed ? "bg-[#f3ce44]/10 text-[#b8960f]" : "bg-field text-ink-muted",
            )}
          >
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isReviewed ? "bg-[#f3ce44]" : "bg-[#c4c4d0]")}
            />
            {isReviewed ? humanizeEnum(opportunity.status) : "Unreviewed"}
          </span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {opportunity.contractType ? <Chip label={opportunity.contractType} /> : null}
          {opportunity.setAside ? (
            <Chip label={opportunity.setAside} icon={Tag} className="bg-brand-tint text-brand" />
          ) : null}
          <Chip
            label={sourceLabel(opportunity.source)}
            icon={Sparkles}
            className="bg-[#f3ce44]/10 text-[#b8960f]"
          />
          {opportunity.primaryNaicsCode ? (
            <Chip label={`NAICS ${opportunity.primaryNaicsCode}`} />
          ) : null}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-x-5">
          <div className="col-span-2 sm:col-span-1">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                Fit Score
              </span>
              <span className={cn("numeric text-sm font-bold", fit?.text ?? "text-ink-subtle")}>
                {score === null ? "—" : `${Math.round(score)}%`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-tile-track">
              {/* An unscored opportunity shows an empty track, never a zero-width claim of 0%. */}
              {score !== null && fit ? (
                <div
                  className={cn("h-full rounded-full transition-all", fit.bar)}
                  style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                />
              ) : null}
            </div>
          </div>

          <DataCell
            label="Due Date"
            sub={
              remainingDays === null
                ? "No deadline"
                : remainingDays <= 0
                  ? "Past due"
                  : remainingDays === 1
                    ? "Due tomorrow"
                    : `${remainingDays} days`
            }
          >
            <span className={isUrgent ? "text-fit-poor" : undefined}>
              {formatDate(opportunity.responseDeadline)}
            </span>
          </DataCell>

          <DataCell label="Est. Value" sub={opportunity.contractType ?? undefined}>
            {formatCurrencyRange(opportunity.estimatedValueMin, opportunity.estimatedValueMax)}
          </DataCell>

          <DataCell
            label="Set-Aside"
            sub={opportunity.primaryNaicsCode ? `NAICS ${opportunity.primaryNaicsCode}` : undefined}
          >
            {opportunity.setAside ?? "Full & Open"}
          </DataCell>
        </div>

        <div aria-hidden className="mb-4 h-px bg-line" />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/*
           * Without `opportunities:write` the card keeps View Details and drops the
           * action row, so a read-only role sees the pipeline without controls that
           * would only fail for them.
           */}
          {canWrite ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
              {context === "queue" ? (
                <QueueActions opportunityId={opportunity.id} />
              ) : (
                <TriageActions opportunityId={opportunity.id} />
              )}

              {assignableOwners && assignableOwners.length > 0 ? (
                <AssignOwnerSelect
                  opportunityId={opportunity.id}
                  currentOwnerId={opportunity.assignedToId}
                  owners={assignableOwners}
                />
              ) : null}
            </div>
          ) : (
            <span />
          )}

          <Link
            href={`/opportunities/${opportunity.id}`}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:bg-canvas"
          >
            <Eye className="h-3 w-3" aria-hidden />
            View Details
          </Link>
        </div>
      </div>
    </article>
  );
}
