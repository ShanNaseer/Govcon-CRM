import "server-only";

import { cache } from "react";

import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_ROLE_PERMISSIONS,
  isPermission,
  lockedPermissionsForRole,
  ROLE_ORDER,
  type Permission,
} from "@/lib/auth/permissions";

/**
 * Resolves what each role may do, from the `RolePermission` table.
 *
 * This is the authority authorization reads. It sits alongside session.ts rather
 * than in a feature service because it is part of the auth boundary: session.ts
 * calls it while building a session, and a service that called back into the
 * session layer would be a cycle.
 *
 * Three rules, in this order:
 *
 *   1. An entirely empty table means "not yet configured", and answers from
 *      `DEFAULT_ROLE_PERMISSIONS`. Without this, deploying the migration would lock
 *      every user out of every page until someone seeded the table — and the only
 *      page that could seed it needs `team:manage`, so nobody could.
 *   2. Otherwise the stored rows are the whole truth. ABSENCE IS DENIAL: a role
 *      with no rows can do nothing, which is what makes revoking a permission in
 *      the matrix actually take effect. Rows naming a permission that no longer
 *      exists in the catalogue are discarded.
 *   3. `lockedPermissionsForRole` is then unioned in regardless, because those
 *      grants are invariants the matrix must not be able to express the absence of
 *      — see the comments on ALWAYS_GRANTED and LOCKED_BY_ROLE.
 *
 * The write path enforces the same invariants, so rule 3 is belt-and-braces. It is
 * here because it is the cheaper place to be certain: a row inserted by hand, by a
 * restored backup, or by a future migration cannot produce an unusable workspace.
 */

export type RolePermissionMap = Record<UserRole, readonly Permission[]>;

/**
 * `cache` scopes this to one request, so the layout, the page and every service
 * call it makes share a single query — the same treatment `getSession` gets, and
 * for the same reason. There is deliberately no cross-request cache: an edit to the
 * matrix must take effect on the next request for everyone, and a process-level
 * cache would make that depend on which server instance answered.
 */
export const getRolePermissionMap = cache(async function getRolePermissionMap(): Promise<RolePermissionMap> {
  const rows = await prisma.rolePermission.findMany({
    select: { role: true, permission: true },
  });

  if (rows.length === 0) return withLocked(DEFAULT_ROLE_PERMISSIONS);

  const granted: Record<UserRole, Permission[]> = {
    [UserRole.ADMIN]: [],
    [UserRole.MANAGER]: [],
    [UserRole.MEMBER]: [],
  };

  for (const row of rows) {
    // A stale permission name grants nothing rather than being carried forward.
    if (!isPermission(row.permission)) continue;
    granted[row.role].push(row.permission);
  }

  return withLocked(granted);
});

/** The permissions a role holds right now. */
export async function permissionsForRole(role: UserRole): Promise<readonly Permission[]> {
  const map = await getRolePermissionMap();
  return map[role];
}

/**
 * Whether the table has been materialized into rows yet.
 *
 * The write path needs to tell "no rows because nobody has configured this" from
 * "no rows because everything was revoked", since only the first should be filled
 * in from the defaults before an edit is applied.
 */
export async function isRolePermissionTableEmpty(): Promise<boolean> {
  const count = await prisma.rolePermission.count();
  return count === 0;
}

function withLocked(source: Record<UserRole, readonly Permission[]>): RolePermissionMap {
  const map = {} as Record<UserRole, readonly Permission[]>;

  for (const role of ROLE_ORDER) {
    map[role] = [...new Set([...source[role], ...lockedPermissionsForRole(role)])];
  }

  return map;
}
