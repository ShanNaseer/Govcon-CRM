import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Summary card for the opportunities inbox.
 *
 * A different composition from the dashboard's `StatCard`: here the label sits
 * above the figure on the left and the icon tile is pinned right, at the design's
 * spec — 16px radius, 21px padding, a 44px/14px-radius tile, and a 126px minimum
 * height so a row of five aligns whether or not each card has a sub-line.
 */

export type InboxStatTone = "brand" | "accent" | "critical" | "warning" | "positive";

const TONE_CLASSES: Record<InboxStatTone, { surface: string; tile: string; icon: string }> = {
  brand: {
    surface: "border-black/8 bg-linear-[120deg,#eff6ff_0%,#ffffff_100%]",
    tile: "bg-brand-tint",
    icon: "text-brand",
  },
  accent: {
    surface: "border-[#ec49c6]/19 bg-linear-[140deg,#faf5ff_0%,#ffffff_100%]",
    tile: "bg-[#ec49c6]/8",
    icon: "text-[#ec49c6]",
  },
  critical: {
    surface: "border-fit-poor/19 bg-linear-[120deg,#fef2f2_0%,#ffffff_100%]",
    tile: "bg-fit-poor/7",
    icon: "text-fit-poor",
  },
  warning: {
    surface: "border-fit-weak/19 bg-linear-[120deg,#fefce8_0%,#ffffff_100%]",
    tile: "bg-fit-weak/7",
    icon: "text-fit-weak",
  },
  positive: {
    surface: "border-black/8 bg-linear-[120deg,#f0fdf4_0%,#ffffff_100%]",
    tile: "bg-fit-strong/7",
    icon: "text-fit-strong",
  },
};

export function InboxStatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: ReactNode;
  tone: InboxStatTone;
}) {
  const tones = TONE_CLASSES[tone];

  return (
    <div
      className={cn(
        "flex min-h-[126px] items-center gap-4 rounded-inbox-card border p-[21px]",
        tones.surface,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-xs leading-4 font-medium text-ink-muted">{label}</p>
        <p className="numeric mt-1.5 text-2xl leading-6 font-bold text-ink">{value}</p>
        {hint ? <p className="mt-1.5 text-xs leading-4 text-ink-muted">{hint}</p> : null}
      </div>

      <div
        aria-hidden
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]",
          tones.tile,
          tones.icon,
        )}
      >
        {icon}
      </div>
    </div>
  );
}
