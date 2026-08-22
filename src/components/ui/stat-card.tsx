import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * KPI card, transcribed from the design's `KPICard`.
 *
 * Exact spec: 14px radius, 25px padding, a 40px/10px-radius tinted icon tile, a
 * 30px semibold figure, then a 14px title and 12px subtitle. Each tone pairs the
 * tile tint with a matching diagonal wash and hairline border so a row of four
 * reads as a set.
 *
 * The design's spacing (32px under the tile, 24px under the figure) is kept, but
 * its fixed 246px height is not: with a one- or two-character figure that leaves a
 * large empty band. Height follows content, which at four cards across produces
 * the same row proportions.
 */

export type StatTone = "brand" | "positive" | "accent" | "warning";

const TONE_CLASSES: Record<StatTone, { surface: string; tile: string; icon: string }> = {
  brand: {
    surface: "border-[#dbeafe] bg-linear-[132deg,#eff6ff_0%,#ffffff_100%]",
    tile: "bg-[#4a90e2]/10",
    icon: "text-[#4a90e2]",
  },
  positive: {
    surface: "border-[#dcfce7] bg-linear-[132deg,#f0fdf4_0%,#ffffff_100%]",
    tile: "bg-[#dcfce7]",
    icon: "text-[#67ce67]",
  },
  accent: {
    surface: "border-[#f3e8ff] bg-linear-[131deg,#faf5ff_0%,#ffffff_100%]",
    tile: "bg-[#f9e8fa]",
    icon: "text-[#ec49c6]",
  },
  warning: {
    surface: "border-[#ffe2e2] bg-linear-[131deg,#fef2f2_0%,#ffffff_100%]",
    tile: "bg-[#ffa24b]/10",
    icon: "text-[#ffa24b]",
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: ReactNode;
  tone?: StatTone;
}) {
  const tones = TONE_CLASSES[tone];

  return (
    <div
      className={cn(
        "rounded-panel border p-6.25 transition-shadow hover:shadow-lg",
        tones.surface,
      )}
    >
      {icon ? (
        <div className="mb-8">
          <div
            aria-hidden
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-tile",
              tones.tile,
              tones.icon,
            )}
          >
            {icon}
          </div>
        </div>
      ) : null}

      <p className="numeric mb-6 text-[30px] leading-9 font-semibold tracking-[0.3955px] text-ink">
        {value}
      </p>
      <p className="mb-2.75 text-sm leading-5 tracking-[-0.1504px] text-ink">{label}</p>
      {hint ? <p className="text-xs leading-4 text-ink-muted">{hint}</p> : null}
    </div>
  );
}
