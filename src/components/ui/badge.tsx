import type { ReactNode } from "react";

import { ClientStatus, MatchRecommendation, OpportunityStatus } from "@/generated/prisma/enums";
import { cn, humanizeEnum } from "@/lib/utils";

/** Badge primitive plus the domain-specific mappings that decide which tone to use. */

export type BadgeTone = "neutral" | "brand" | "positive" | "warning" | "critical" | "info";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-canvas text-ink-muted border-line-strong",
  brand: "bg-brand-soft text-brand border-brand-soft",
  positive: "bg-positive-soft text-positive border-positive-soft",
  warning: "bg-warning-soft text-warning border-warning-soft",
  critical: "bg-critical-soft text-critical border-critical-soft",
  info: "bg-info-soft text-info border-info-soft",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const CLIENT_STATUS_TONE: Record<ClientStatus, BadgeTone> = {
  [ClientStatus.ACTIVE]: "positive",
  [ClientStatus.PROSPECT]: "info",
  [ClientStatus.INACTIVE]: "neutral",
  [ClientStatus.ARCHIVED]: "neutral",
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <Badge tone={CLIENT_STATUS_TONE[status]}>{humanizeEnum(status)}</Badge>;
}

/** Workflow status colouring: won/pursuing read positive, passed/lost read closed. */
const OPPORTUNITY_STATUS_TONE: Record<OpportunityStatus, BadgeTone> = {
  [OpportunityStatus.NEW]: "info",
  [OpportunityStatus.MATCHED]: "brand",
  [OpportunityStatus.REVIEWING]: "warning",
  [OpportunityStatus.INTERESTED]: "warning",
  [OpportunityStatus.PASSED]: "neutral",
  [OpportunityStatus.PURSUING]: "positive",
  [OpportunityStatus.PROPOSAL_IN_PROGRESS]: "positive",
  [OpportunityStatus.SUBMITTED]: "brand",
  [OpportunityStatus.WON]: "positive",
  [OpportunityStatus.LOST]: "critical",
};

export function OpportunityStatusBadge({ status }: { status: OpportunityStatus }) {
  return <Badge tone={OPPORTUNITY_STATUS_TONE[status]}>{humanizeEnum(status)}</Badge>;
}

const RECOMMENDATION_TONE: Record<MatchRecommendation, BadgeTone> = {
  [MatchRecommendation.PURSUE]: "positive",
  [MatchRecommendation.REVIEW]: "warning",
  [MatchRecommendation.PASS]: "neutral",
};

export function RecommendationBadge({ recommendation }: { recommendation: MatchRecommendation }) {
  return <Badge tone={RECOMMENDATION_TONE[recommendation]}>{humanizeEnum(recommendation)}</Badge>;
}

/**
 * Match score pill. Renders a neutral placeholder until the matching engine
 * exists — an unscored opportunity must never look like a zero-scored one.
 */
export function MatchScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs text-ink-subtle">Not scored</span>;
  }

  const tone: BadgeTone = score >= 75 ? "positive" : score >= 50 ? "warning" : "neutral";

  return (
    <Badge tone={tone} className="numeric">
      {Math.round(score)}
    </Badge>
  );
}
