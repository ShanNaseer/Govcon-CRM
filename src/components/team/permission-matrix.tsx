"use client";

import { useState, useTransition } from "react";
import { Info, Lock, RotateCcw } from "lucide-react";

import {
  resetRolePermissionsAction,
  setRolePermissionAction,
} from "@/app/(dashboard)/team/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RolePermissionMatrixDto } from "@/features/team/team.types";
import type { UserRole } from "@/generated/prisma/enums";
import {
  PERMISSION_GROUPS,
  PERMISSION_META,
  PERMISSION_REQUIRES,
  PERMISSIONS,
  ROLE_LABELS,
  type Permission,
  type PermissionGroup,
} from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

/**
 * The permission matrix: permissions down, roles across, one checkbox per grant.
 *
 * Saves on every toggle rather than behind a Save button. The grid has no other
 * state to coordinate, so a deferred save would only add a way to lose edits by
 * navigating away — and a per-cell write is what lets two administrators edit
 * different cells at once (see the repository).
 *
 * Nothing here is a security boundary. The checkbox that renders disabled is a
 * courtesy; `setRolePermission` re-checks `team:manage` and re-checks the lock, so a
 * replayed call from a viewer without the permission is refused server-side.
 */

const GROUPED: Array<{ group: PermissionGroup; permissions: Permission[] }> = PERMISSION_GROUPS.map(
  (group) => ({
    group,
    permissions: PERMISSIONS.filter((permission) => PERMISSION_META[permission].group === group),
  }),
).filter((entry) => entry.permissions.length > 0);

/** Cell identity for the busy indicator — one checkbox, not the whole row. */
function cellKey(role: UserRole, permission: Permission): string {
  return `${role}:${permission}`;
}

function PermissionCell({
  role,
  permission,
  granted,
  locked,
  canManage,
  busy,
  onToggle,
}: {
  role: UserRole;
  permission: Permission;
  granted: boolean;
  locked: boolean;
  canManage: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const label = `${granted ? "Revoke" : "Grant"} ${PERMISSION_META[permission].label} for ${ROLE_LABELS[role]}`;

  if (locked) {
    return (
      <span
        title={`Always granted to ${ROLE_LABELS[role]}, so the workspace cannot lock itself out.`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-subtle"
      >
        <Lock className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">
          {PERMISSION_META[permission].label} is permanently granted to {ROLE_LABELS[role]}
        </span>
        Always
      </span>
    );
  }

  return (
    <input
      type="checkbox"
      checked={granted}
      disabled={!canManage || busy}
      aria-label={label}
      onChange={(event) => onToggle(event.target.checked)}
      className={cn(
        "h-4 w-4 cursor-pointer rounded border-line-strong text-brand",
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        busy && "animate-pulse",
      )}
    />
  );
}

export function PermissionMatrix({
  matrix,
  canManage,
  viewerRole,
}: {
  matrix: RolePermissionMatrixDto;
  canManage: boolean;
  /** Used only to warn an editor who is about to change their own access. */
  viewerRole: UserRole;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * The server is the source of truth and `revalidatePath` re-renders this component
   * with the saved state, so there is no local copy of the grid to drift. The only
   * client state is which cell is in flight and the last error.
   */
  function toggle(role: UserRole, permission: Permission, next: boolean) {
    setError(null);
    setBusyCell(cellKey(role, permission));

    startTransition(async () => {
      const result = await setRolePermissionAction(role, permission, next);
      if (!result.ok) setError(result.error);
      setBusyCell(null);
    });
  }

  function reset() {
    setError(null);
    setBusyCell("reset");

    startTransition(async () => {
      const result = await resetRolePermissionsAction();
      if (!result.ok) setError(result.error);
      setBusyCell(null);
    });
  }

  const granted = new Map(
    matrix.columns.map((column) => [column.role, new Set<Permission>(column.granted)]),
  );
  const locked = new Map(
    matrix.columns.map((column) => [column.role, new Set<Permission>(column.locked)]),
  );

  return (
    <>
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-card border border-[#fecaca] bg-critical-soft p-3 text-sm text-critical"
        >
          {error}
        </div>
      ) : null}

      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="flex max-w-2xl items-start gap-2 text-sm text-ink-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
            <span>
              A permission controls both the sidebar entry and the data behind it. Changes apply
              the next time someone with that role loads a page — nobody is signed out.
              {matrix.configured ? null : " This workspace is still on the built-in defaults."}
            </span>
          </p>

          {canManage && matrix.configured ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={reset}
              disabled={pending && busyCell === "reset"}
            >
              <RotateCcw aria-hidden />
              Restore defaults
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-2xl border-collapse text-sm">
            <caption className="sr-only">
              Permissions granted to each role. Locked rows are always granted.
            </caption>

            <thead>
              <tr className="border-b border-line bg-surface-muted">
                <th scope="col" className="px-6 py-3 text-left font-semibold text-ink">
                  Permission
                </th>

                {matrix.columns.map((column) => (
                  <th
                    key={column.role}
                    scope="col"
                    className="px-6 py-3 text-center font-semibold text-ink"
                  >
                    <span className="block">{ROLE_LABELS[column.role]}</span>
                    <span className="block text-xs font-normal text-ink-subtle">
                      {column.activeUsers === 1 ? "1 active user" : `${column.activeUsers} active users`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            {GROUPED.map(({ group, permissions }) => (
              <tbody key={group}>
                <tr className="border-b border-line bg-canvas">
                  <th
                    scope="colgroup"
                    colSpan={matrix.columns.length + 1}
                    className="px-6 py-2 text-left text-xs font-semibold tracking-wide text-ink-subtle uppercase"
                  >
                    {group}
                  </th>
                </tr>

                {permissions.map((permission) => {
                  const requires = PERMISSION_REQUIRES[permission];

                  return (
                    <tr key={permission} className="border-b border-line last:border-0">
                      <th scope="row" className="max-w-md px-6 py-3 text-left font-normal">
                        <span className="block font-medium text-ink">
                          {PERMISSION_META[permission].label}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {PERMISSION_META[permission].description}
                        </span>
                        {requires ? (
                          <span className="mt-1 block text-xs text-ink-subtle">
                            Requires {PERMISSION_META[requires].label} — granting this grants that
                            too.
                          </span>
                        ) : null}
                      </th>

                      {matrix.columns.map((column) => (
                        <td key={column.role} className="px-6 py-3 text-center">
                          <PermissionCell
                            role={column.role}
                            permission={permission}
                            granted={granted.get(column.role)?.has(permission) ?? false}
                            locked={locked.get(column.role)?.has(permission) ?? false}
                            canManage={canManage}
                            busy={pending && busyCell === cellKey(column.role, permission)}
                            onToggle={(next) => toggle(column.role, permission, next)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </Card>

      {canManage ? (
        <p className="mt-4 text-sm text-ink-subtle">
          You are signed in as {ROLE_LABELS[viewerRole]}. Changes to that column affect your own
          access as soon as you navigate.
        </p>
      ) : (
        <p className="mt-4 text-sm text-ink-subtle">
          Read-only view — changing these requires the Manage team and permissions grant.
        </p>
      )}
    </>
  );
}
