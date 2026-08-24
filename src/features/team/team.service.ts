import "server-only";

import * as repository from "@/features/team/team.repository";
import type { MemberRow } from "@/features/team/team.repository";
import type { CreateTeamMemberInput, ListTeamQuery } from "@/features/team/team.schemas";
import type { TeamMemberDto, TeamStats } from "@/features/team/team.types";
import { UserRole } from "@/generated/prisma/enums";
import { AppError } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/password";
import { requirePermission } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/**
 * Team management, and the authorization choke point for it.
 *
 * Reads require `team:read`; anything that changes who has access requires
 * `team:manage`. Those checks live here rather than in the page for the reason
 * given in client.service.ts — a page can forget, a service every caller goes
 * through cannot.
 */

function toDto(row: MemberRow, completed: number): TeamMemberDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    jobTitle: row.jobTitle,
    department: row.department,
    phone: row.phone,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    // `_count` covers every assigned task; the grouped query supplies the done ones.
    tasksAssigned: row._count.assignedTasks,
    tasksCompleted: completed,
  };
}

export async function listTeamMembers(query: ListTeamQuery): Promise<TeamMemberDto[]> {
  await requirePermission("team:read");

  const [rows, completedByAssignee] = await Promise.all([
    repository.findManyMembers(query),
    repository.countCompletedTasksByAssignee(),
  ]);

  return rows.map((row) => toDto(row, completedByAssignee.get(row.id) ?? 0));
}

export function summarizeTeam(members: TeamMemberDto[]): TeamStats {
  return {
    total: members.length,
    active: members.filter((member) => member.isActive).length,
    tasksAssigned: members.reduce((sum, member) => sum + member.tasksAssigned, 0),
    tasksCompleted: members.reduce((sum, member) => sum + member.tasksCompleted, 0),
  };
}

export async function createTeamMember(input: CreateTeamMemberInput): Promise<TeamMemberDto> {
  const session = await requirePermission("team:manage");

  const existing = await repository.findMemberByEmail(input.email);
  if (existing) {
    throw AppError.conflict("Someone with that email address already has an account", {
      email: ["This email is already in use"],
    });
  }

  const passwordHash = await hashPassword(input.password);

  /*
   * The profile is listed field by field rather than spread with the credentials
   * destructured away. Spreading would carry any field added to the input type
   * onward silently; naming them means a new credential-like field has to be
   * considered here before it can travel.
   */
  const row = await repository.createMember(
    {
      name: input.name,
      email: input.email,
      role: input.role,
      jobTitle: input.jobTitle,
      department: input.department,
      phone: input.phone,
    },
    passwordHash,
  );

  // Never log the password or its hash — only who did what.
  logger.info("Team member created", {
    userId: row.id,
    role: row.role,
    createdBy: session.userId,
  });

  return toDto(row, 0);
}

export async function changeMemberRole(userId: string, role: UserRole): Promise<TeamMemberDto> {
  const session = await requirePermission("team:manage");

  /*
   * Demoting the last administrator would lock everyone out of team management with
   * no way back in short of direct database access, so it is refused.
   */
  if (role !== UserRole.ADMIN) {
    await assertNotLastAdmin(userId, "change the role of");
  }

  const row = await repository.updateRole(userId, role);

  /*
   * A role change alters what their existing sessions may do, and the session
   * record caches the role. Revoking forces a fresh sign-in so the new role takes
   * effect immediately rather than at the next expiry.
   */
  const revoked = await repository.deleteSessionsForUser(userId);

  logger.info("Team member role changed", { userId, role, revoked, changedBy: session.userId });
  return toDto(row, 0);
}

export async function setMemberActive(userId: string, isActive: boolean): Promise<TeamMemberDto> {
  const session = await requirePermission("team:manage");

  if (!isActive) {
    if (userId === session.userId) {
      throw AppError.validation("You cannot deactivate your own account");
    }
    await assertNotLastAdmin(userId, "deactivate");
  }

  const row = await repository.setActive(userId, isActive);

  // Deactivation must take effect now, not at session expiry.
  const revoked = isActive ? 0 : await repository.deleteSessionsForUser(userId);

  logger.info("Team member active state changed", {
    userId,
    isActive,
    revoked,
    changedBy: session.userId,
  });
  return toDto(row, 0);
}

export async function resetMemberPassword(userId: string, password: string): Promise<void> {
  const session = await requirePermission("team:manage");

  const passwordHash = await hashPassword(password);
  await repository.setPasswordHash(userId, passwordHash);

  // A password change invalidates everything issued under the old one.
  const revoked = await repository.deleteSessionsForUser(userId);

  logger.info("Team member password reset", { userId, revoked, changedBy: session.userId });
}

/** Refuses an operation that would leave the workspace with no active administrator. */
async function assertNotLastAdmin(userId: string, operation: string): Promise<void> {
  const members = await repository.findManyMembers({});
  const target = members.find((member) => member.id === userId);

  if (!target) throw AppError.notFound("User", userId);
  if (target.role !== UserRole.ADMIN || !target.isActive) return;

  const activeAdmins = await repository.countActiveAdmins();
  if (activeAdmins <= 1) {
    throw AppError.validation(
      `Cannot ${operation} the only active administrator. Promote someone else first.`,
    );
  }
}
