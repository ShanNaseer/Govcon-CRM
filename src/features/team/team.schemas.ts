import { z } from "zod";

import { UserRole } from "@/generated/prisma/enums";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Zod schemas for team management. Shared with the client bundle, so nothing
 * server-only may be imported — and note that no schema here ever carries a
 * password back out, only in.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullish();

/**
 * Password policy: length only.
 *
 * Composition rules (a digit, a symbol, mixed case) push people toward predictable
 * substitutions — "Password1!" satisfies most of them. Length is what actually
 * resists guessing, and the same 12-character floor is enforced by the
 * user-provisioning script, so the two paths cannot disagree.
 */
export const passwordSchema = z
  .string()
  .min(12, { error: "Password must be at least 12 characters" })
  .max(200, { error: "Password must be at most 200 characters" });

export const createTeamMemberSchema = z
  .object({
    name: z.string().trim().min(1, { error: "Name is required" }).max(200),
    email: z.email({ error: "Must be a valid email address" }).max(200).toLowerCase(),
    role: z.enum(UserRole),
    jobTitle: optionalText(150),
    department: optionalText(150),
    phone: optionalText(40),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: "Passwords do not match",
    // Reported against the confirmation field, which is the one to retype.
    path: ["confirmPassword"],
  });

/** Changing someone's role. Separate from profile edits — it changes what they can do. */
export const changeRoleSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  role: z.enum(UserRole),
});

/** Enabling or disabling an account. Disabling also revokes their sessions. */
export const setActiveSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  isActive: z.boolean(),
});

/** An administrator setting someone else's password. */
export const resetPasswordSchema = z
  .object({
    userId: z.string().trim().min(1).max(64),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * One cell of the permission matrix.
 *
 * `permission` is validated against the catalogue rather than accepted as free text,
 * so a replayed or hand-crafted Server Function call cannot insert a grant naming
 * something the application will never recognise.
 */
export const setRolePermissionSchema = z.object({
  role: z.enum(UserRole),
  permission: z.enum(PERMISSIONS),
  enabled: z.boolean(),
});

export const listTeamQuerySchema = z.object({
  search: optionalText(200),
  role: z.enum(UserRole).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;
export type ListTeamQuery = z.infer<typeof listTeamQuerySchema>;
