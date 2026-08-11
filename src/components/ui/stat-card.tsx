import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

/** Headline figure for the dashboard summary row. */
export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
        {icon ? <span className="text-ink-subtle">{icon}</span> : null}
      </div>
      <p className="numeric mt-2 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </Card>
  );
}
