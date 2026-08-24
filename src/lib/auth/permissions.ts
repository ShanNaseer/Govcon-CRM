import { UserRole } from "@/generated/prisma/enums";

/**
 * Role-based permissions.
 *
 * Deliberately not `server-only`: the sidebar needs this to decide what to render,
 * and it holds no secrets — only a static map of role to capability.
 *
 * IMPORTANT — hiding a nav item is not access control. Anyone can type a URL, and
 * a Client Component's filtering happens after the server already decided what to
 * send. Every permission below must also be checked on the server, at the point
 * where data is read or written:
 *
 *   - pages call `requirePermission(...)` from src/lib/auth/session.ts
 *   - services call it before the repository, the same place `requireSession` sits
 *
 * The nav filtering exists so people are not shown doors they cannot open, not to
 * keep them out.
 */

export const PERMISSIONS = [
  "dashboard:read",
  "opportunities:read",
  "opportunities:write",
  "clients:read",
  "clients:write",
  "tasks:read",
  "tasks:write",
  "team:read",
  /** Create, deactivate and re-role users, and set their passwords. */
  "team:manage",
  "settings:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * What each role may do.
 *
 * ADMIN   — everything, including managing who else has access.
 * MANAGER — full read/write on business data, but cannot grant access to others.
 *           Team is visible so they can see who to assign work to.
 * MEMBER  — reads the pipeline and works their own tasks. No client edits, no team
 *           management, no settings.
 *
 * Listed explicitly per role rather than derived by inheritance: a widening bug in
 * an inheritance chain silently grants access, whereas an omission here is visible.
 */
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
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

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** True when the role carries the permission. */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Human-readable label for a role, for badges and selects. */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Administrator",
  [UserRole.MANAGER]: "Manager",
  [UserRole.MEMBER]: "Member",
};

/** One-line description of what each role can do, shown beside the role picker. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Full access, including adding and removing team members.",
  [UserRole.MANAGER]: "Full access to clients, opportunities and tasks. Cannot manage the team.",
  [UserRole.MEMBER]: "Can view the pipeline and work on tasks. Read-only for clients.",
};
