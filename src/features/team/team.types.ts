import type { UserRole } from "@/generated/prisma/enums";

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
