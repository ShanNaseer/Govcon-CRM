import { UserRole } from "@/generated/prisma/enums";

/**
 * The permission catalogue, and the invariants that constrain it.
 *
 * WHAT LIVES HERE vs. IN THE DATABASE
 *
 * The set of permissions that exist is code — it tracks the feature set, so adding
 * a capability is a code change. WHICH ROLE HOLDS WHICH PERMISSION is data, edited
 * at runtime from /team/permissions and stored in the `RolePermission` table. The
 * map below is only the starting point a fresh installation is configured from; it
 * is not what authorization reads. That resolution lives in
 * src/lib/auth/role-permissions.ts, and everything downstream reads
 * `session.permissions`.
 *
 * Deliberately not `server-only`: the sidebar and the permission matrix are Client
 * Components and need the catalogue to render. Nothing here is a secret — it is a
 * list of capability names and the rules about them, not anyone's grants.
 *
 * IMPORTANT — hiding a nav item is not access control. Anyone can type a URL, and a
 * Client Component's filtering happens after the server already decided what to
 * send. Every permission below must also be checked on the server, at the point
 * where data is read or written:
 *
 *   - pages call `requirePagePermission(...)` from src/lib/auth/session.ts
 *   - services call `requirePermission(...)` before the repository
 *
 * The nav filtering exists so people are not shown doors they cannot open, not to
 * keep them out.
 */

export const PERMISSIONS = [
  "dashboard:read",
  "opportunities:read",
  "opportunities:write",
  /** Put an opportunity on somebody else's queue, or take it off theirs. */
  "opportunities:assign",
  "clients:read",
  "clients:write",
  "tasks:read",
  "tasks:write",
  "team:read",
  /** Create, deactivate and re-role users, set their passwords, and edit this matrix. */
  "team:manage",
  "settings:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

/**
 * Narrows a database string to a `Permission`.
 *
 * Rows are matched against the catalogue on every read, so a grant left behind by
 * a permission that has since been renamed or deleted is discarded rather than
 * carried forward as something authorization cannot interpret.
 */
export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/**
 * Presentation metadata for the permission matrix: what each row is called, what
 * granting it actually does, and which group it sits under.
 *
 * `group` is ordered by `PERMISSION_GROUPS` below rather than by declaration, so
 * the matrix's row order does not depend on the order of `PERMISSIONS`.
 */
export const PERMISSION_GROUPS = [
  "Dashboard",
  "Opportunities",
  "Clients",
  "Tasks",
  "Team",
  "Settings",
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export const PERMISSION_META: Record<
  Permission,
  { label: string; description: string; group: PermissionGroup }
> = {
  "dashboard:read": {
    label: "View dashboard",
    description: "See the pipeline summary on the home page.",
    group: "Dashboard",
  },
  "opportunities:read": {
    label: "View opportunities",
    description: "Browse the opportunity inbox and open individual solicitations.",
    group: "Opportunities",
  },
  "opportunities:write": {
    label: "Manage opportunities",
    description: "Triage, pursue, pass and edit opportunities. Includes taking one into your own queue.",
    group: "Opportunities",
  },
  "opportunities:assign": {
    label: "Assign work to others",
    description:
      "Hand an opportunity to any team member's queue, and take one back off theirs. Without this, a role can only claim work for itself.",
    group: "Opportunities",
  },
  "clients:read": {
    label: "View clients",
    description: "Browse client profiles and their matching criteria.",
    group: "Clients",
  },
  "clients:write": {
    label: "Manage clients",
    description: "Add clients and edit their profiles, keywords and certifications.",
    group: "Clients",
  },
  "tasks:read": {
    label: "View tasks",
    description: "See the task board across the whole team.",
    group: "Tasks",
  },
  "tasks:write": {
    label: "Manage tasks",
    description: "Create, assign, edit and complete tasks.",
    group: "Tasks",
  },
  "team:read": {
    label: "View team",
    description: "See the team directory and who work can be assigned to.",
    group: "Team",
  },
  "team:manage": {
    label: "Manage team and permissions",
    description:
      "Add and deactivate users, change their roles and passwords, and edit this permission matrix.",
    group: "Team",
  },
  "settings:read": {
    label: "View settings",
    description: "Open the workspace settings area.",
    group: "Settings",
  },
};

/**
 * Prerequisites. Granting a permission grants everything it requires; revoking one
 * revokes everything that requires it.
 *
 * These are not stylistic groupings, they are reachability facts. `clients:write`
 * without `clients:read` is unusable — the pages that host the editing controls
 * require the read permission to render at all — and `team:manage` without
 * `team:read` cannot reach /team, which is where the management controls live.
 * Rather than let an administrator produce such a combination and then wonder why
 * it does nothing, the write path closes it over these edges.
 * See `resolveGrantEdits` in src/features/team/role-permissions.service.ts.
 */
export const PERMISSION_REQUIRES: Partial<Record<Permission, Permission>> = {
  "opportunities:write": "opportunities:read",
  // Two links deep: assigning implies writing, which implies reading. Ticking
  // "Assign work to others" therefore turns on all three in one click.
  "opportunities:assign": "opportunities:write",
  "clients:write": "clients:read",
  "tasks:write": "tasks:read",
  "team:manage": "team:read",
};

/**
 * Granted to every role, and not revocable.
 *
 * `dashboard:read` is load-bearing, not a convenience: `requirePagePermission`
 * redirects a user who lacks a permission to "/", and "/" itself requires
 * `dashboard:read`. A role without it would redirect from "/" to "/" forever, so
 * the matrix must not be able to express that.
 */
export const ALWAYS_GRANTED: readonly Permission[] = ["dashboard:read"];

/**
 * Per-role permissions that cannot be revoked.
 *
 * ADMIN keeps team management because /team/permissions is the only way to edit
 * this matrix and it requires `team:manage` — take it away from the last role that
 * has it and the matrix becomes uneditable short of direct database access. Pinning
 * it to ADMIN specifically (rather than checking "some role still has it") means
 * the guarantee holds no matter what order the cells are toggled in, and `ADMIN` is
 * already the role `assertNotLastAdmin` keeps populated.
 */
export const LOCKED_BY_ROLE: Partial<Record<UserRole, readonly Permission[]>> = {
  [UserRole.ADMIN]: ["team:read", "team:manage"],
};

/** Every permission that is fixed for a role, whatever the stored grants say. */
export function lockedPermissionsForRole(role: UserRole): readonly Permission[] {
  const locked = LOCKED_BY_ROLE[role] ?? [];
  return [...new Set([...ALWAYS_GRANTED, ...locked])];
}

/** True when a cell in the matrix is not the administrator's to change. */
export function isPermissionLocked(role: UserRole, permission: Permission): boolean {
  return lockedPermissionsForRole(role).includes(permission);
}

/**
 * The configuration a fresh installation starts from.
 *
 * ADMIN   — everything, including managing who else has access.
 * MANAGER — full read/write on business data, but cannot grant access to others.
 *           Team is visible so they can see who to assign work to.
 * MEMBER  — reads the pipeline and works their own tasks. No client edits, no team
 *           management, no settings.
 *
 * Listed explicitly per role rather than derived by inheritance: a widening bug in
 * an inheritance chain silently grants access, whereas an omission here is visible.
 *
 * Read at two moments only — when the `RolePermission` table is entirely empty (see
 * src/lib/auth/role-permissions.ts), and when the first edit materializes these
 * defaults as rows. After that the database is the only authority, and editing this
 * map changes nothing for an existing workspace.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.ADMIN]: PERMISSIONS,
  [UserRole.MANAGER]: [
    "dashboard:read",
    "opportunities:read",
    "opportunities:write",
    "clients:read",
    "clients:write",
    "tasks:read",
    "tasks:write",
    "team:read",
    "settings:read",
  ],
  [UserRole.MEMBER]: [
    "dashboard:read",
    "opportunities:read",
    "clients:read",
    "tasks:read",
    "tasks:write",
  ],
};

/** Human-readable label for a role, for badges and selects. */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Administrator",
  [UserRole.MANAGER]: "Manager",
  [UserRole.MEMBER]: "Member",
};

/**
 * What each role is *for*, shown beside the role picker.
 *
 * Phrased as intent rather than as a list of capabilities, because the capabilities
 * are now editable — a description that enumerated them would start lying the first
 * time someone changed a cell in the matrix. The add-member dialog links to
 * /team/permissions for the actual grants.
 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Runs the workspace. Always able to manage people and permissions.",
  [UserRole.MANAGER]: "Owns day-to-day pipeline work for the team.",
  [UserRole.MEMBER]: "Works their own assignments within the pipeline.",
};

/** Roles in the order the matrix and the role pickers present them. */
export const ROLE_ORDER: readonly UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.MEMBER];
