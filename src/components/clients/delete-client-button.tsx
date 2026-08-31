"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";

import {
  clientDeletionImpactAction,
  deleteClientAction,
  type DeletionImpact,
} from "@/app/(dashboard)/clients/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Delete control for a client, behind a confirmation that says what will be lost.
 *
 * Ten tables cascade from `Client`. Eight are the profile's own child rows, which
 * nobody is surprised to lose — but `Task` and `OpportunityMatch` are not obviously
 * part of the client, and losing a team's work items to a profile deletion is exactly
 * what a bare "Are you sure?" fails to prevent. So the dialog itemises the collateral.
 *
 * The counts are fetched WHEN THE DIALOG OPENS, not with the page. Ten counts is a
 * real cost on a remote pooled connection, and a list of twenty clients would pay it
 * twenty times over while almost every visit deletes nothing.
 *
 * The extra friction is proportionate: the client's name must be typed only when tasks
 * or matches would actually be destroyed. Demanding it to delete an empty prospect is
 * ceremony, and ceremony on every delete is what teaches people to click through
 * warnings without reading them.
 */
export function DeleteClientButton({
  clientId,
  clientName,
  /** Compact form for a table row; the default suits a page header. */
  variant = "button",
}: {
  clientId: string;
  clientName: string;
  variant?: "button" | "link";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    setOpen(true);
    setError(null);
    setTyped("");
    setImpact(null);
    setLoading(true);

    startTransition(async () => {
      const result = await clientDeletionImpactAction(clientId);
      setLoading(false);

      if (result.ok) setImpact(result.impact);
      else setError(result.error);
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setTyped("");
    setError(null);
  }

  const hasCollateral = impact !== null && (impact.tasks > 0 || impact.matches > 0);

  // Case-insensitive and trimmed: a speed bump, not a spelling test.
  const nameConfirmed =
    !hasCollateral || typed.trim().toLowerCase() === clientName.trim().toLowerCase();

  /*
   * Deleting is blocked until the impact is known. Otherwise the confirmation would be
   * claiming nothing will be lost while it is still finding out.
   */
  const canDelete = impact !== null && nameConfirmed && !pending;

  function confirmDelete() {
    setError(null);

    startTransition(async () => {
      const result = await deleteClientAction(clientId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      /*
       * Navigated here rather than redirected in the action, so a failure can be shown
       * inside the dialog instead of on a page that has already moved on. `refresh()`
       * because the list is a cached Server Component render.
       */
      router.push("/clients");
      router.refresh();
    });
  }

  const cascades =
    impact === null
      ? []
      : [
          impact.tasks > 0 ? `${impact.tasks} task${impact.tasks === 1 ? "" : "s"}` : null,
          impact.matches > 0
            ? `${impact.matches} opportunity match${impact.matches === 1 ? "" : "es"}`
            : null,
          impact.profileRecords > 0
            ? `${impact.profileRecords} profile record${impact.profileRecords === 1 ? "" : "s"} (NAICS, PSC, keywords, certifications)`
            : null,
        ].filter((entry): entry is string => entry !== null);

  return (
    <>
      {variant === "link" ? (
        <button
          type="button"
          onClick={openDialog}
          // Named per row: screen readers announce controls out of context, so a
          // column of identical "Delete" buttons would be unusable.
          aria-label={`Delete ${clientName}`}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium text-critical",
            "hover:underline",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete
        </button>
      ) : (
        <Button variant="danger" onClick={openDialog}>
          <Trash2 aria-hidden />
          Delete
        </Button>
      )}

      <Dialog
        open={open}
        onClose={close}
        title={`Delete ${clientName}?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={!canDelete}>
              {pending && impact !== null ? "Deleting…" : "Delete permanently"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-ink-muted">Checking what this would affect…</p>
          ) : impact === null ? (
            // Only reachable when the lookup failed; `error` below carries the reason.
            <p className="text-sm text-ink-muted">Could not determine what would be deleted.</p>
          ) : cascades.length > 0 ? (
            <div className="rounded-card border border-[#fecaca] bg-critical-soft p-3">
              <p className="flex items-start gap-2 text-sm font-medium text-critical">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Deleting this client will also delete:
              </p>
              <ul className="mt-2 ml-6 list-disc space-y-0.5 text-sm text-critical">
                {cascades.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              This client has no tasks, matches or profile records attached.
            </p>
          )}

          {hasCollateral ? (
            <div>
              <label htmlFor={`confirm-${clientId}`} className="mb-1 block text-sm font-medium text-ink">
                Type <span className="font-semibold">{clientName}</span> to confirm
              </label>
              <Input
                id={`confirm-${clientId}`}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                placeholder={clientName}
                disabled={pending}
              />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
