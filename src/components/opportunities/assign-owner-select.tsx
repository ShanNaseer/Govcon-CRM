"use client";

import { useState, useTransition } from "react";
import { UserCog } from "lucide-react";

import { assignOwnerAction } from "@/app/(dashboard)/opportunities/actions";
import { Select } from "@/components/ui/input";
import type { AssignableOwnerDto } from "@/features/team/team.types";
import { ROLE_LABELS } from "@/lib/auth/permissions";

/**
 * "Assign to" picker on an opportunity card.
 *
 * Rendered only for someone holding `opportunities:assign`. That is presentation:
 * `assignOpportunityTo` re-checks the permission and re-validates the chosen person
 * against the assignable list, so a replayed call from a viewer without the grant is
 * refused server-side.
 *
 * Fires on change rather than behind an Apply button. There is no other state to
 * coordinate, and the card leaves the list on success — a second click to confirm a
 * choice already made from a short list would be ceremony.
 */
export function AssignOwnerSelect({
  opportunityId,
  currentOwnerId,
  owners,
}: {
  opportunityId: string;
  /** Excluded from the list — reassigning to the current holder is a no-op. */
  currentOwnerId: string | null;
  owners: AssignableOwnerDto[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const choices = owners.filter((owner) => owner.id !== currentOwnerId);

  /*
   * Nothing to offer — the only assignable person already holds it. Rendering an
   * empty select would invite a click that could not go anywhere.
   */
  if (choices.length === 0) return null;

  function assign(assigneeId: string) {
    if (!assigneeId) return;

    setError(null);
    startTransition(async () => {
      const result = await assignOwnerAction(opportunityId, assigneeId);
      if (!result.ok) setError(result.error);
    });
  }

  const selectId = `assign-${opportunityId}`;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <label htmlFor={selectId} className="sr-only">
        Assign this opportunity to a team member
      </label>

      <UserCog className="h-3 w-3 shrink-0 text-ink-subtle" aria-hidden />

      <Select
        id={selectId}
        // Always shows the placeholder: the select is a command, not a bound field.
        // Its value is the person to hand this to, which is never "the current state".
        value=""
        disabled={pending}
        onChange={(event) => assign(event.target.value)}
        className="h-7 w-auto py-0 text-xs"
      >
        <option value="">{pending ? "Assigning…" : "Assign to…"}</option>
        {choices.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.jobTitle ? `${owner.name} — ${owner.jobTitle}` : `${owner.name} (${ROLE_LABELS[owner.role]})`}
          </option>
        ))}
      </Select>

      {error ? (
        <p role="alert" className="text-xs text-fit-poor">
          {error}
        </p>
      ) : null}
    </div>
  );
}
