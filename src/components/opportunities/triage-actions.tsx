"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Undo2, UserPlus, XCircle } from "lucide-react";

import {
  assignToQueue,
  markReviewed,
  passOpportunity,
  returnToInbox,
  type TriageResult,
} from "@/app/(dashboard)/opportunities/actions";
import { cn } from "@/lib/utils";

/**
 * The triage buttons on an opportunity card.
 *
 * Two sets, because the useful action depends on where the card is: an inbox card
 * offers Assign / Mark Reviewed / Pass, a My Queue card offers Return to Inbox /
 * Pass. Offering "Assign to My Queue" on something already in your queue would be
 * a button whose only outcome is an error.
 *
 * Client Components because the buttons need pending state; the writes themselves
 * are Server Functions, so no opportunity status is ever mutated from the browser.
 * `useTransition` keeps the row responsive while the revalidation streams back.
 */

const BUTTON_BASE =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium " +
  "transition-colors disabled:pointer-events-none disabled:opacity-50";

const PASS_CLASSES = "border-fit-poor/30 bg-[#fff5f5] text-fit-poor hover:bg-[#ffeceb]";

/** Shared runner: clears the last error, then reports whatever the action returns. */
function useTriage(opportunityId: string) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: string) => Promise<TriageResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action(opportunityId);
      /*
       * Only failures are surfaced. A success needs no message: the card leaves the
       * list it was in, which is the feedback.
       */
      if (!result.ok) setError(result.error);
    });
  }

  return { pending, error, run };
}

function TriageError({ message }: { message: string | null }) {
  if (message === null) return null;

  return (
    <p role="alert" className="text-xs text-fit-poor">
      {message}
    </p>
  );
}

export function TriageActions({ opportunityId }: { opportunityId: string }) {
  const { pending, error, run } = useTriage(opportunityId);

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
        className={cn(BUTTON_BASE, PASS_CLASSES)}
      >
        <XCircle className="h-3 w-3" aria-hidden />
        Pass
      </button>

      <TriageError message={error} />
    </div>
  );
}

/**
 * Actions for a card that is already in the viewer's queue.
 *
 * No "Assign", and Return to Inbox is the primary: the decision left on a queued
 * item is whether to keep working it, hand it back, or decline it.
 */
export function QueueActions({ opportunityId }: { opportunityId: string }) {
  const { pending, error, run } = useTriage(opportunityId);

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(returnToInbox)}
        className={cn(BUTTON_BASE, "border-line bg-surface text-ink hover:bg-canvas")}
      >
        <Undo2 className="h-3 w-3" aria-hidden />
        Return to Inbox
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => run(passOpportunity)}
        className={cn(BUTTON_BASE, PASS_CLASSES)}
      >
        <XCircle className="h-3 w-3" aria-hidden />
        Pass
      </button>

      <TriageError message={error} />
    </div>
  );
}
