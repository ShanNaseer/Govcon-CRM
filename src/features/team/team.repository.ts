import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { TaskStatus, UserRole } from "@/generated/prisma/enums";
import type { CreateTeamMemberInput, ListTeamQuery } from "@/features/team/team.schemas";
import { prisma } from "@/lib/db/prisma";

/** Data access for team management. The only module that queries Prisma for users. */

/**
 * Note the absence of `passwordHash`. Selecting explicitly rather than returning
 * the whole row means a credential cannot reach a DTO by accident when someone
 * later adds a field.
 */
const memberSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  jobTitle: true,
  department: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { assignedTasks: true } },
} satisfies Prisma.UserSelect;

export type MemberRow = Prisma.UserGetPayload<{ select: typeof memberSelect }>;

function buildWhere(query: ListTeamQuery): Prisma.UserWhereInput {
  const filters: Prisma.UserWhereInput[] = [];

  if (query.role) filters.push({ role: query.role });
  if (query.status === "active") filters.push({ isActive: true });
  if (query.status === "disabled") filters.push({ isActive: false });

  if (query.search) {
    const search = query.search;
    filters.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { jobTitle: { contains: search, mode: "insensitive" } },
        { department: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  return filters.length === 0 ? {} : { AND: filters };
}

export async function findManyMembers(query: ListTeamQuery): Promise<MemberRow[]> {
  return prisma.user.findMany({
    where: buildWhere(query),
    select: memberSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 500,
  });
}

/**
 * Completed-task counts per assignee.
 *
 * A separate grouped query rather than a filtered `_count` relation: Prisma cannot
 * express "count only the DONE ones" inside the same `_count`, and fetching every
 * task to tally them in JavaScript would scale with the task table.
 */
export async function countCompletedTasksByAssignee(): Promise<Map<string, number>> {
  const grouped = await prisma.task.groupBy({
    by: ["assigneeId"],
    where: { status: TaskStatus.DONE, assigneeId: { not: null } },
    _count: { _all: true },
  });

  return new Map(
    grouped
      .filter((row): row is typeof row & { assigneeId: string } => row.assigneeId !== null)
      .map((row) => [row.assigneeId, row._count._all]),
  );
}

export async function findMemberByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

export async function createMember(
  input: Omit<CreateTeamMemberInput, "password" | "confirmPassword">,
  passwordHash: string,
): Promise<MemberRow> {
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      jobTitle: input.jobTitle ?? null,
      department: input.department ?? null,
      phone: input.phone ?? null,
      passwordHash,
      isActive: true,
      /*
       * Client scope follows the role: administrators and managers see every client,
       * a member starts with none. Defaulting a member to "all" would make the role
       * meaningless, so the failure direction here is deny.
       */
      allClients: input.role === UserRole.ADMIN || input.role === UserRole.MANAGER,
      clientIds: [],
    },
    select: memberSelect,
  });
}

export async function updateRole(userId: string, role: UserRole): Promise<MemberRow> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      role,
      allClients: role === UserRole.ADMIN || role === UserRole.MANAGER,
    },
    select: memberSelect,
  });
}

export async function setActive(userId: string, isActive: boolean): Promise<MemberRow> {
  return prisma.user.update({ where: { id: userId }, data: { isActive }, select: memberSelect });
}

export async function setPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function deleteSessionsForUser(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

/**
 * Active users, for the "assign to" picker.
 *
 * Deactivated accounts are excluded at the query: work handed to someone who cannot
 * sign in would sit in a queue nobody ever opens. The role comes back so the caller
 * can drop anyone whose role cannot open a queue at all — that filter needs the
 * permission map, which is not this layer's business.
 */
export async function findActiveMembersForAssignment(): Promise<
  Array<{ id: string; name: string; role: UserRole; jobTitle: string | null }>
> {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, jobTitle: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

/** Active administrators, so the last one cannot be removed or demoted. */
export async function countActiveAdmins(): Promise<number> {
  return prisma.user.count({ where: { role: UserRole.ADMIN, isActive: true } });
}
