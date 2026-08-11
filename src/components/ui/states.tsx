import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Empty / loading / error states.
 *
 * An empty database is a normal condition for this application, not a failure —
 * every list renders one of these rather than a blank panel.
 */

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-critical-soft text-critical">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Neutral placeholder block used by Suspense fallbacks and `loading.tsx` files. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-line", className)} aria-hidden />;
}

export function LoadingState({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2 px-4 py-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}
