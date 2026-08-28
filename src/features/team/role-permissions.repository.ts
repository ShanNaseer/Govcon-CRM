import "server-only";

import { UserRole } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

/**
 * Data access for the role permission matrix.
 *
 * The read path used by authorization is NOT here — it is
 * src/lib/auth/role-permissions.ts, which the auth boundary owns. This module is
 * only the write side, plus the audit columns the matrix page displays.
 */

export type GrantRow = {
  role: UserRole;
  permission: string;
  grantedAt: Date;
  grantedById: string | null;
};

export async function findAllGrants(): Promise<GrantRow[]> {
  return prisma.rolePermission.findMany({
    select: { role: true, permission: true, grantedAt: true, grantedById: true },
    orderBy: [{ role: "asc" }, { permission: "asc" }],
  });
}

/**
 * Applies a set of grants and revocations as one transaction.
 *
 * A transaction because the prerequisite closure means a single toggle can be
 * several row changes (granting `clients:write` also grants `clients:read`), and a
 * half-applied closure is exactly the unusable combination the closure exists to
 * prevent.
 *
 * `createMany` with `skipDuplicates` rather than upserts: re-granting something a
 * role already has must not rewrite `grantedAt`, which would lose the record of who
 * originally granted it.
 */
export async function applyGrantChanges(
  role: UserRole,
  grant: readonly Permission[],
  revoke: readonly Permission[],
  grantedById: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (revoke.length > 0) {
      await tx.rolePermission.deleteMany({
        where: { role, permission: { in: [...revoke] } },
      });
    }

    if (grant.length > 0) {
      await tx.rolePermission.createMany({
        data: grant.map((permission) => ({ role, permission, grantedById })),
        skipDuplicates: true,
      });
    }
  });
}

/**
 * Writes the code defaults out as rows, then applies the caller's changes — the
 * first edit a workspace makes.
 *
 * One transaction with the edit itself so that the workspace never observes a
 * partially materialized matrix. `skipDuplicates` makes the seed idempotent, so two
 * administrators clicking at the same moment cannot make it fail.
 */
export async function seedDefaultsAndApply(
  defaults: Record<UserRole, readonly Permission[]>,
  role: UserRole,
  grant: readonly Permission[],
  revoke: readonly Permission[],
  grantedById: string,
): Promise<void> {
  const seedRows = Object.entries(defaults).flatMap(([seedRole, permissions]) =>
    permissions.map((permission) => ({
      role: seedRole as UserRole,
      permission,
      // Null, not the editing user: they did not choose these, the defaults did.
      grantedById: null,
    })),
  );

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.createMany({ data: seedRows, skipDuplicates: true });

    if (revoke.length > 0) {
      await tx.rolePermission.deleteMany({
        where: { role, permission: { in: [...revoke] } },
      });
    }

    if (grant.length > 0) {
      await tx.rolePermission.createMany({
        data: grant.map((permission) => ({ role, permission, grantedById })),
        skipDuplicates: true,
      });
    }
  });
}

/** Discards every grant so the next read falls back to the code defaults. */
export async function deleteAllGrants(): Promise<number> {
  const { count } = await prisma.rolePermission.deleteMany({});
  return count;
}

/** Users holding a role, so a revocation can report who it affects. */
export async function countUsersWithRole(role: UserRole): Promise<number> {
  return prisma.user.count({ where: { role, isActive: true } });
}
