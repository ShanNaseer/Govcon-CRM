"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, UserPlus, XCircle } from "lucide-react";

import {
  assignToQueue,
  markReviewed,
  passOpportunity,
  type TriageResult,
} from "@/app/(dashboard)/opportunities/actions";
import { cn } from "@/lib/utils";

/**
 * The three triage buttons on an inbox card.
 *
 * A Client Component because the buttons need pending state; the writes themselves
 * are Server Functions, so no opportunity status is ever mutated from the browser.
 * `useTransition` keeps the row responsive while the revalidation streams back.
 */

const BUTTON_BASE =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium " +
  "transition-colors disabled:pointer-events-none disabled:opacity-50";

export function TriageActions({ opportunityId }: { opportunityId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: string) => Promise<TriageResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action(opportunityId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(assignToQueue)}
        className={cn(BUTTON_BASE, "border-transparent bg-brand text-white hover:bg-brand-hover")}
      >
        <UserPlus className="h-3 w-3" aria-hidden />
        Assign to My Queue
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => run(markReviewed)}
        className={cn(BUTTON_BASE, "border-line bg-surface text-ink hover:bg-canvas")}
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        Mark Reviewed
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => run(passOpportunity)}
        className={cn(BUTTON_BASE, "border-fit-poor/30 bg-[#fff5f5] text-fit-poor hover:bg-[#ffeceb]")}
      >
        <XCircle className="h-3 w-3" aria-hidden />
        Pass
      </button>

      {error ? (
        <p role="alert" className="text-xs text-fit-poor">
          {error}
        </p>
      ) : null}
    </div>
  );
}
