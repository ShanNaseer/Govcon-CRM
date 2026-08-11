import Link from "next/link";

import { MatchScoreBadge, OpportunityStatusBadge } from "@/components/ui/badge";
import { TD, TR } from "@/components/ui/table";
import type { OpportunitySummaryDto } from "@/features/opportunities/opportunity.types";
import { cn, daysUntil, formatDate, humanizeEnum } from "@/lib/utils";

/**
 * One row of the opportunities table, shared by the dashboard (compact) and the
 * full list (all columns) so the two never drift apart.
 *
 * `now` is passed in rather than read from the clock here, so every row in a
 * render measures deadlines against the same instant.
 */
export function OpportunityRow({
  opportunity,
  now,
  variant = "full",
}: {
  opportunity: OpportunitySummaryDto;
  now: Date;
  variant?: "full" | "compact";
}) {
  const remainingDays = daysUntil(opportunity.responseDeadline, now);
  const isOverdue = remainingDays !== null && remainingDays < 0;
  const isUrgent = remainingDays !== null && remainingDays >= 0 && remainingDays <= 7;

  const deadlineCell = (
    <div className="flex flex-col">
      <span className={cn("numeric", isOverdue && "text-ink-subtle")}>
        {formatDate(opportunity.responseDeadline)}
      </span>
      {remainingDays !== null ? (
        <span
          className={cn(
            "text-xs",
            isOverdue ? "text-ink-subtle" : isUrgent ? "text-critical" : "text-ink-muted",
          )}
        >
          {isOverdue
            ? "Closed"
            : remainingDays === 0
              ? "Due today"
              : `${remainingDays} day${remainingDays === 1 ? "" : "s"} left`}
        </span>
      ) : null}
    </div>
  );

  return (
    <TR>
      <TD>
        <MatchScoreBadge score={opportunity.bestMatchScore} />
      </TD>

      <TD className="max-w-md">
        <Link
          href={`/opportunities/${opportunity.id}`}
          className="font-medium text-ink hover:text-brand hover:underline"
        >
          {opportunity.title}
        </Link>
        {opportunity.solicitationNumber ? (
          <p className="numeric text-xs text-ink-subtle">{opportunity.solicitationNumber}</p>
        ) : null}
      </TD>

      <TD className="max-w-56 text-ink-muted">{opportunity.agency ?? "—"}</TD>

      {variant === "full" ? (
        <>
          <TD className="text-ink-muted">{humanizeEnum(opportunity.source)}</TD>
          <TD className="numeric text-ink-muted">{opportunity.primaryNaicsCode ?? "—"}</TD>
          <TD className="max-w-40 text-ink-muted">{opportunity.setAside ?? "—"}</TD>
          <TD className="numeric text-ink-muted">{formatDate(opportunity.postedDate)}</TD>
        </>
      ) : null}

      <TD>{deadlineCell}</TD>

      <TD>
        <OpportunityStatusBadge status={opportunity.status} />
      </TD>
    </TR>
  );
}
