import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** White content surface with a subtle border — the base of every panel in the app. */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-card border border-line bg-surface", className)}>{children}</section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-3", className)}>{children}</div>;
}

/**
 * Label/value row used throughout the detail pages. Absent values render an
 * em dash rather than collapsing, so the field list stays scannable.
 */
export function DefinitionRow({ label, children }: { label: string; children?: ReactNode }) {
  const isEmpty = children === null || children === undefined || children === "";

  return (
    <div className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn("min-w-0 break-words", isEmpty ? "text-ink-subtle" : "text-ink")}>
        {isEmpty ? "—" : children}
      </dd>
    </div>
  );
}

export function DefinitionList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cn("divide-y divide-line", className)}>{children}</dl>;
}
