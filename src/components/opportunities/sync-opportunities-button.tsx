"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Target } from "lucide-react";

import {
  runMatchingAction,
  syncOpportunitiesAction,
} from "@/app/(dashboard)/opportunities/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

/**
 * Manual "Sync now" control for the opportunity feed.
 *
 * DELIBERATELY ONE BUTTON, no window picker. The API filters `captured_date` to an
 * exact day, so covering a gap means naming the missed dates — but working out which
 * days were missed is the application's job, not the user's. The server keeps a
 * cursor and catches up from it, so the only question left here is "now?".
 *
 * The outcome is reported in words, not as a toast that vanishes — an import is the
 * kind of action where "how many, and were any skipped" is the whole point.
 */

export function SyncOpportunitiesButton({
  configured,
  lastRunAt,
}: {
  configured: boolean;
  /** ISO timestamp of the last run, or null if it has never run. */
  lastRunAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  /*
   * With no API key there is nothing to sync, so the control is replaced by the
   * reason rather than rendered as a button that can only fail.
   */
  if (!configured) {
    return (
      <p className="text-xs text-ink-subtle">
        No opportunity feed configured — set <code className="font-mono">HIGHERGOV_API_KEY</code>.
      </p>
    );
  }

  /*
   * Re-scores without re-importing. The separate control exists because editing a
   * client profile changes the ranking of solicitations already in the database, and
   * pulling the feed again to see that would be both slow and beside the point.
   */
  function rescore() {
    setMessage(null);

    startTransition(async () => {
      const result = await runMatchingAction();

      setMessage(
        result.ok ? { tone: "ok", text: result.summary } : { tone: "error", text: result.error },
      );
    });
  }

  function sync() {
    setMessage(null);

    startTransition(async () => {
      const result = await syncOpportunitiesAction();

      setMessage(
        result.ok ? { tone: "ok", text: result.summary } : { tone: "error", text: result.error },
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {/*
       * When it last ran, so "should I sync?" is answerable without clicking. Absent
       * before the first run rather than shown as "never", which reads like a fault.
       */}
      {lastRunAt && !pending ? (
        <span className="text-xs text-ink-subtle">Last synced {formatDate(lastRunAt)}</span>
      ) : null}

      <Button variant="secondary" onClick={rescore} disabled={pending}>
        <Target aria-hidden />
        Rescore
      </Button>

      <Button variant="primary" onClick={sync} disabled={pending}>
        <RefreshCw className={cn(pending && "animate-spin")} aria-hidden />
        {pending ? "Working…" : "Sync now"}
      </Button>

      {/*
       * Said up front, because a sync takes a few seconds per page and silence during
       * that looks like a hang — which is exactly how this first went wrong.
       */}
      {pending ? (
        <p role="status" className="w-full text-right text-xs text-ink-subtle">
          Fetching from HigherGov — this takes a few seconds per 100 records.
        </p>
      ) : null}

      {message ? (
        <p
          // Assertive only for failures: a successful count is informative, not urgent.
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "w-full text-right text-xs",
            message.tone === "error" ? "text-fit-poor" : "text-ink-muted",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
