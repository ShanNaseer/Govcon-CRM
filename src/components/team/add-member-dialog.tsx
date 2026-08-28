"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import { addTeamMemberAction, type TeamActionState } from "@/app/(dashboard)/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { UserRole } from "@/generated/prisma/enums";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";

/**
 * Add Team Member dialog.
 *
 * Two departures from the reference design, both deliberate:
 *
 * 1. It sets a password. The design collects a profile only, which would create an
 *    account nobody can sign in to.
 * 2. Its "Role" is the permission role, not a free-text job title. The design uses
 *    one field for both, which makes access unenforceable — so job title is a
 *    separate, display-only field here.
 */

const INITIAL_STATE: TeamActionState | null = null;

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-xs text-critical" role="alert">
      {messages.join(" ")}
    </p>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink">
      {children}
    </label>
  );
}

export function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(addTeamMemberAction, INITIAL_STATE);
  const lastSavedAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state?.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      onClose();
    }
  }, [state?.savedAt, onClose]);

  const errors = state?.fieldErrors ?? {};
  const invalid = (field: string) => (errors[field] ? "border-critical" : undefined);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Team Member"
      description="Create an account and set the password they will sign in with."
    >
      <form action={formAction} className="space-y-4">
        {state?.error ? (
          <div
            role="alert"
            className="rounded-card border border-[#fecaca] bg-critical-soft p-3 text-sm text-critical"
          >
            {state.error}
          </div>
        ) : null}

        <div>
          <Label htmlFor="member-name">Name</Label>
          <Input
            id="member-name"
            name="name"
            required
            maxLength={200}
            placeholder="Full name…"
            className={invalid("name")}
          />
          <FieldError messages={errors.name} />
        </div>

        <div>
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="off"
            placeholder="Email address…"
            className={invalid("email")}
          />
          <FieldError messages={errors.email} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="member-jobTitle">Job title</Label>
            <Input
              id="member-jobTitle"
              name="jobTitle"
              maxLength={150}
              placeholder="Proposal Manager"
              className={invalid("jobTitle")}
            />
            <FieldError messages={errors.jobTitle} />
          </div>

          <div>
            <Label htmlFor="member-department">Department</Label>
            <Input
              id="member-department"
              name="department"
              maxLength={150}
              placeholder="Business Development"
              className={invalid("department")}
            />
            <FieldError messages={errors.department} />
          </div>
        </div>

        <div>
          <Label htmlFor="member-phone">Phone</Label>
          <Input
            id="member-phone"
            name="phone"
            maxLength={40}
            placeholder="(555) 123-4567"
            className={invalid("phone")}
          />
          <FieldError messages={errors.phone} />
        </div>

        <div>
          <Label htmlFor="member-role">Access role</Label>
          <Select id="member-role" name="role" defaultValue={UserRole.MEMBER}>
            {Object.values(UserRole).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
          {/*
           * Says what each role is for at the point of choosing it — an access
           * decision made from a bare label is a guess. What each role can actually
           * reach is editable, so the exact grants are linked rather than listed
           * here; a hard-coded list would start lying the first time someone
           * changed a cell in the matrix.
           */}
          <ul className="mt-2 space-y-1">
            {Object.values(UserRole).map((role) => (
              <li key={role} className="text-xs text-ink-muted">
                <span className="font-medium text-ink">{ROLE_LABELS[role]}:</span>{" "}
                {ROLE_DESCRIPTIONS[role]}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-subtle">
            <Link href="/team/permissions" className="text-brand hover:underline">
              Roles &amp; Permissions
            </Link>{" "}
            sets which tabs and actions each role can reach.
          </p>
          <FieldError messages={errors.role} />
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <Label htmlFor="member-password">Password</Label>
            <Input
              id="member-password"
              name="password"
              type="password"
              required
              // Stops a browser offering the current user's saved credentials, and
              // stops it saving this one as theirs.
              autoComplete="new-password"
              placeholder="At least 12 characters"
              className={invalid("password")}
            />
            <FieldError messages={errors.password} />
          </div>

          <div>
            <Label htmlFor="member-confirmPassword">Confirm password</Label>
            <Input
              id="member-confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Retype the password"
              className={invalid("confirmPassword")}
            />
            <FieldError messages={errors.confirmPassword} />
          </div>
        </div>

        <p className="text-xs text-ink-subtle">
          Length is the only rule — at least 12 characters. Share it with them over a
          channel you trust, and have them change it after signing in.
        </p>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            <UserPlus aria-hidden />
            {pending ? "Adding…" : "Add Member"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
