import "server-only";

import * as repository from "@/features/team/role-permissions.repository";
import type { RolePermissionMatrixDto } from "@/features/team/team.types";
import { UserRole } from "@/generated/prisma/enums";
import { AppError } from "@/lib/api/errors";
import {
  DEFAULT_ROLE_PERMISSIONS,
  isPermissionLocked,
  lockedPermissionsForRole,
  PERMISSION_META,
  PERMISSION_REQUIRES,
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_ORDER,
  type Permission,
} from "@/lib/auth/permissions";
import {
  getRolePermissionMap,
  isRolePermissionTableEmpty,
} from "@/lib/auth/role-permissions";
import { requirePermission } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/**
 * Editing the role permission matrix.
 *
 * Reading requires `team:read`, changing requires `team:manage` — the same split as
 * the rest of team management, and checked here rather than in the page for the same
 * reason: a page can forget, a service every caller goes through cannot. This one
 * matters more than most, because the thing being written is authorization itself.
 */

export async function getPermissionMatrix(): Promise<RolePermissionMatrixDto> {
  await requirePermission("team:read");

  const [map, grants, configured] = await Promise.all([
    getRolePermissionMap(),
    repository.findAllGrants(),
    isRolePermissionTableEmpty().then((empty) => !empty),
  ]);

  const activeUsers = await Promise.all(
    ROLE_ORDER.map((role) => repository.countUsersWithRole(role)),
  );

  const lastChangedAt = grants.reduce<Date | null>(
    (latest, grant) => (latest === null || grant.grantedAt > latest ? grant.grantedAt : latest),
    null,
  );

  return {
    columns: ROLE_ORDER.map((role, index) => ({
      role,
      granted: [...map[role]],
      locked: [...lockedPermissionsForRole(role)],
      activeUsers: activeUsers[index],
    })),
    configured,
    lastChangedAt: lastChangedAt?.toISOString() ?? null,
  };
}

/**
 * Grants or revokes one permission for one role, plus whatever the prerequisite
 * closure implies.
 *
 * One cell at a time rather than submitting the whole matrix: a toggle is a single
 * insert or delete, so two administrators editing different cells cannot overwrite
 * each other's work the way two submissions of a whole-matrix form would.
 */
export async function setRolePermission(
  role: UserRole,
  permission: Permission,
  enabled: boolean,
): Promise<void> {
  const session = await requirePermission("team:manage");

  if (isPermissionLocked(role, permission)) {
    throw AppError.validation(
      `"${PERMISSION_META[permission].label}" cannot be changed for ${ROLE_LABELS[role]}. ` +
        `Removing it would make this page, or the dashboard every role lands on, unreachable.`,
    );
  }

  const map = await getRolePermissionMap();
  const current = new Set(map[role]);

  const { grant, revoke } = resolveGrantEdits(role, current, permission, enabled);

  if (grant.length === 0 && revoke.length === 0) return;

  /*
   * A workspace that has never been edited is running on the code defaults with no
   * rows behind them. Applying this edit alone would leave every other permission
   * revoked, because absence is denial — so the defaults are written out first, in
   * the same transaction.
   */
  if (await isRolePermissionTableEmpty()) {
    await repository.seedDefaultsAndApply(
      DEFAULT_ROLE_PERMISSIONS,
      role,
      grant,
      revoke,
      session.userId,
    );
  } else {
    await repository.applyGrantChanges(role, grant, revoke, session.userId);
  }

  /*
   * Sessions are deliberately NOT revoked. `getSession` resolves permissions live on
   * every request, so the change already applies to everyone holding this role on
   * their next navigation — signing them out would be disruption with no security
   * benefit. Contrast `changeMemberRole`, which must revoke because the role itself
   * is cached on the session record.
   */
  logger.info("Role permission changed", {
    role,
    permission,
    enabled,
    granted: grant,
    revoked: revoke,
    changedBy: session.userId,
  });
}

/** Discards every edit, returning the workspace to the code defaults. */
export async function resetRolePermissions(): Promise<void> {
  const session = await requirePermission("team:manage");

  const removed = await repository.deleteAllGrants();

  logger.info("Role permissions reset to defaults", { removed, changedBy: session.userId });
}

/**
 * Expands one toggle into the full set of rows to add and remove.
 *
 * Exported for the same reason it is a pure function: the closure rules are the
 * subtle part of this feature, and they are worth being able to test without a
 * database.
 *
 * Granting pulls in prerequisites — `clients:write` is unusable without
 * `clients:read`, because the page hosting the editing controls will not render
 * without it. Revoking pushes out to dependents, for the mirror-image reason: a
 * role left holding `clients:write` and not `clients:read` would show a permission
 * it cannot exercise. Both directions are transitive, so a chain longer than one
 * link still resolves in a single toggle.
 *
 * Locked permissions are never revoked here even if they are dependents, so a
 * revocation elsewhere in the matrix cannot breach an invariant by the back door.
 */
export function resolveGrantEdits(
  role: UserRole,
  current: ReadonlySet<Permission>,
  permission: Permission,
  enabled: boolean,
): { grant: Permission[]; revoke: Permission[] } {
  if (enabled) {
    const wanted = [permission, ...prerequisitesOf(permission)];
    return { grant: wanted.filter((entry) => !current.has(entry)), revoke: [] };
  }

  const unwanted = [permission, ...dependentsOf(permission)];
  return {
    grant: [],
    revoke: unwanted.filter(
      (entry) => current.has(entry) && !isPermissionLocked(role, entry),
    ),
  };
}

/** Everything `permission` needs in order to be usable, transitively. */
function prerequisitesOf(permission: Permission): Permission[] {
  const chain: Permission[] = [];
  let next = PERMISSION_REQUIRES[permission];

  // `PERMISSION_REQUIRES` is a forest, not a general graph, so this terminates.
  while (next && !chain.includes(next)) {
    chain.push(next);
    next = PERMISSION_REQUIRES[next];
  }

  return chain;
}

/** Everything that would become unusable without `permission`, transitively. */
function dependentsOf(permission: Permission): Permission[] {
  const found = new Set<Permission>();
  const queue: Permission[] = [permission];

  while (queue.length > 0) {
    const target = queue.shift()!;

    for (const candidate of PERMISSIONS) {
      if (PERMISSION_REQUIRES[candidate] !== target) continue;
      if (found.has(candidate)) continue;

      found.add(candidate);
      queue.push(candidate);
    }
  }

  return [...found];
}
