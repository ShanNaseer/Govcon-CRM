import type { UserRole } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/auth/permissions";

/**
 * Transport types for team management.
 *
 * `passwordHash` appears nowhere in this file, by design: the DTO is what reaches
 * the browser, and a hash is a credential even though it is not reversible.
 */

export type TeamMemberDto = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  isActive: boolean;
  /** ISO 8601, or null if they have never signed in. */
  lastLoginAt: string | null;
  createdAt: string;
  /** Open tasks assigned to this person. */
  tasksAssigned: number;
  tasksCompleted: number;
};

export type TeamStats = {
  total: number;
  active: number;
  tasksAssigned: number;
  tasksCompleted: number;
};

/**
 * A person an opportunity can be handed to.
 *
 * Intentionally minimal — an id, a name and enough context to tell two people with
 * similar names apart. It populates a picker rendered to whoever holds
 * `opportunities:assign`, so it carries no email, phone or activity figures.
 */
export type AssignableOwnerDto = {
  id: string;
  name: string;
  role: UserRole;
  jobTitle: string | null;
};

/** One role's column in the permission matrix. */
export type RolePermissionColumnDto = {
  role: UserRole;
  granted: Permission[];
  /**
   * Grants this role cannot lose, sent so the matrix can render them as fixed
   * rather than reimplementing the rules client-side and risking a disagreement
   * with what the server will actually accept.
   */
  locked: Permission[];
  /** Active users this column applies to, so a revocation states its reach. */
  activeUsers: number;
};

export type RolePermissionMatrixDto = {
  columns: RolePermissionColumnDto[];
  /**
   * False while the workspace is still running on the code defaults, i.e. nothing
   * has been edited and no rows exist yet. The page says so, because "these are the
   * defaults" and "someone chose exactly the defaults" are different situations.
   */
  configured: boolean;
  /** ISO 8601 of the most recent grant, or null when nothing has been edited. */
  lastChangedAt: string | null;
};
