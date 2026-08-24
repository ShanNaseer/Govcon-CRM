"use client";

import { useState, useTransition } from "react";
import { Clock, Mail, Phone, Search, Shield, UserPlus, Users } from "lucide-react";

import { changeRoleAction, setActiveAction } from "@/app/(dashboard)/team/actions";
import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import type { TeamMemberDto } from "@/features/team/team.types";
import { UserRole } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { cn, deriveInitials, formatDate } from "@/lib/utils";

/**
 * Team directory: search, role/status filters, and a card per member.
 *
 * Filtering runs client-side because the whole directory is already loaded — a
 * round trip per keystroke to re-filter a list this size would be slower and no
 * more correct.
 *
 * Role and status controls only render for someone who may use them; the actions
 * behind them check `team:manage` server-side regardless.
 */

const ROLE_BADGE: Record<UserRole, string> = {
  [UserRole.ADMIN]: "bg-brand-tint text-brand",
  [UserRole.MANAGER]: "bg-[#f9e8fa] text-[#c026a3]",
  [UserRole.MEMBER]: "bg-field text-ink-muted",
};

function MemberCard({
  member,
  canManage,
  isSelf,
  busy,
  onRoleChange,
  onActiveChange,
}: {
  member: TeamMemberDto;
  canManage: boolean;
  isSelf: boolean;
  busy: boolean;
  onRoleChange: (id: string, role: string) => void;
  onActiveChange: (id: string, isActive: boolean) => void;
}) {
  return (
    <Card className={cn("p-6 transition-shadow hover:shadow-md", busy && "opacity-60")}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br from-brand to-brand-light font-semibold text-white"
            >
              {deriveInitials(member.name)}
            </span>
            <span
              aria-hidden
              className={cn(
                "absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-surface",
                member.isActive ? "bg-fit-strong" : "bg-[#c4c4d0]",
              )}
            />
          </div>

          <div className="min-w-0">
            <h3 className="truncate font-semibold text-ink">{member.name}</h3>
            <p className="truncate text-sm text-ink-muted">
              {member.jobTitle ?? ROLE_LABELS[member.role]}
            </p>
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            ROLE_BADGE[member.role],
          )}
        >
          {ROLE_LABELS[member.role]}
        </span>
      </div>

      <div className="mb-4 space-y-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Mail className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
          <span className="truncate">{member.email}</span>
        </p>
        {member.phone ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Phone className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
            {member.phone}
          </p>
        ) : null}
        {member.department ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Shield className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
            <span className="truncate">{member.department}</span>
          </p>
        ) : null}
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Clock className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
          Joined {formatDate(member.createdAt)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            member.isActive ? "bg-[#29c27f]/12 text-[#1a8f5c]" : "bg-field text-ink-muted",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              member.isActive ? "bg-fit-strong" : "bg-[#c4c4d0]",
            )}
          />
          {member.isActive ? "Active" : "Disabled"}
        </span>

        {/* Presence is not tracked; last sign-in is the honest version of it. */}
        <span className="truncate text-xs text-ink-subtle">
          {member.lastLoginAt ? `Last seen ${formatDate(member.lastLoginAt)}` : "Never signed in"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-center">
        <div>
          <p className="numeric text-2xl font-semibold text-ink">{member.tasksAssigned}</p>
          <p className="text-xs text-ink-muted">Assigned</p>
        </div>
        <div>
          <p className="numeric text-2xl font-semibold text-fit-strong">{member.tasksCompleted}</p>
          <p className="text-xs text-ink-muted">Completed</p>
        </div>
      </div>

      {canManage ? (
        <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
          <div className="min-w-0 flex-1">
            <label htmlFor={`role-${member.id}`} className="sr-only">
              Change role for {member.name}
            </label>
            <Select
              id={`role-${member.id}`}
              value={member.role}
              disabled={busy}
              onChange={(event) => onRoleChange(member.id, event.target.value)}
            >
              {Object.values(UserRole).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </div>

          <Button
            variant={member.isActive ? "secondary" : "primary"}
            size="sm"
            // Self-deactivation is refused by the service; disabling it here avoids
            // offering an action that can only fail.
            disabled={busy || (isSelf && member.isActive)}
            title={isSelf && member.isActive ? "You cannot deactivate your own account" : undefined}
            onClick={() => onActiveChange(member.id, !member.isActive)}
          >
            {member.isActive ? "Disable" : "Enable"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function TeamDirectory({
  members,
  canManage,
  currentUserId,
}: {
  members: TeamMemberDto[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needle = search.trim().toLowerCase();
  const filtered = members.filter((member) => {
    if (role && member.role !== role) return false;
    if (status === "active" && !member.isActive) return false;
    if (status === "disabled" && member.isActive) return false;
    if (!needle) return true;

    return [member.name, member.email, member.jobTitle, member.department]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(needle));
  });

  function run(id: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setBusyId(id);

    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      setBusyId(null);
    });
  }

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

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-64 flex-1">
            <label htmlFor="team-search" className="sr-only">
              Search team
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            />
            <Input
              id="team-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, role, or department…"
              className="pl-9"
            />
          </div>

          <div className="w-44">
            <label htmlFor="team-role" className="sr-only">
              Filter by role
            </label>
            <Select id="team-role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">All roles</option>
              {Object.values(UserRole).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-40">
            <label htmlFor="team-status" className="sr-only">
              Filter by status
            </label>
            <Select
              id="team-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </div>

          {canManage ? (
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              <UserPlus aria-hidden />
              Add Team Member
            </Button>
          ) : null}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-ink-subtle" aria-hidden />
          <p className="mb-1 text-ink-muted">No team members found</p>
          <p className="text-sm text-ink-subtle">Try adjusting your search criteria</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              canManage={canManage}
              isSelf={member.id === currentUserId}
              busy={pending && busyId === member.id}
              onRoleChange={(id, next) => run(id, () => changeRoleAction(id, next))}
              onActiveChange={(id, isActive) => run(id, () => setActiveAction(id, isActive))}
            />
          ))}
        </div>
      )}

      {canManage ? (
        <AddMemberDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      ) : null}
    </>
  );
}
