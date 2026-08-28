"use server";

import { revalidatePath } from "next/cache";

import * as rolePermissions from "@/features/team/role-permissions.service";
import {
  changeRoleSchema,
  createTeamMemberSchema,
  resetPasswordSchema,
  setActiveSchema,
  setRolePermissionSchema,
} from "@/features/team/team.schemas";
import * as service from "@/features/team/team.service";
import { AppError } from "@/lib/api/errors";
import { describeError, logger } from "@/lib/logger";

/**
 * Team mutations.
 *
 * Every one delegates to the service, which requires `team:manage` before it
 * writes. Nothing here re-checks the role and nothing here may skip it — a hidden
 * sidebar entry does not stop someone replaying a Server Function call.
 */

export type TeamActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  savedAt?: number;
};

export type TeamMutationResult = { ok: true } | { ok: false; error: string };

function collectFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string[]> = {};
  const seen = new Set<string>();

  for (const issue of issues) {
    const pathKey = issue.path.join(".");
    if (seen.has(pathKey)) continue;
    seen.add(pathKey);

    const field = String(issue.path[0] ?? "form");
    (fieldErrors[field] ??= []).push(issue.message);
  }

  return fieldErrors;
}

function text(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : "";
}

export async function addTeamMemberAction(
  _previousState: TeamActionState | null,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = createTeamMemberSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    role: text(formData, "role"),
    jobTitle: text(formData, "jobTitle"),
    department: text(formData, "department"),
    phone: text(formData, "phone"),
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  try {
    await service.createTeamMember(parsed.data);
  } catch (error) {
    if (error instanceof AppError) {
      return {
        error: error.message,
        fieldErrors: (error.details as Record<string, string[]> | undefined) ?? undefined,
      };
    }

    // Deliberately logged without the submitted values, which include a password.
    logger.error("Add team member failed", describeError(error));
    return { error: "Could not add this team member right now. Please try again." };
  }

  revalidatePath("/team");
  return { savedAt: Date.now() };
}

export async function changeRoleAction(userId: string, role: string): Promise<TeamMutationResult> {
  const parsed = changeRoleSchema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, error: "That role is not valid." };

  try {
    await service.changeMemberRole(parsed.data.userId, parsed.data.role);
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Change role failed", describeError(error));
    return { ok: false, error: "Could not change that role. Please try again." };
  }

  revalidatePath("/team");
  return { ok: true };
}

export async function setActiveAction(
  userId: string,
  isActive: boolean,
): Promise<TeamMutationResult> {
  const parsed = setActiveSchema.safeParse({ userId, isActive });
  if (!parsed.success) return { ok: false, error: "That request is not valid." };

  try {
    await service.setMemberActive(parsed.data.userId, parsed.data.isActive);
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Set active failed", describeError(error));
    return { ok: false, error: "Could not update that account. Please try again." };
  }

  revalidatePath("/team");
  return { ok: true };
}

export async function setRolePermissionAction(
  role: string,
  permission: string,
  enabled: boolean,
): Promise<TeamMutationResult> {
  const parsed = setRolePermissionSchema.safeParse({ role, permission, enabled });
  if (!parsed.success) return { ok: false, error: "That permission is not valid." };

  try {
    await rolePermissions.setRolePermission(
      parsed.data.role,
      parsed.data.permission,
      parsed.data.enabled,
    );
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Set role permission failed", describeError(error));
    return { ok: false, error: "Could not save that permission. Please try again." };
  }

  /*
   * The whole layout, not just this route: the sidebar is rendered by the dashboard
   * layout from the viewer's permissions, so an editor who has just changed their
   * own role's access needs the nav rebuilt, not only the matrix.
   */
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetRolePermissionsAction(): Promise<TeamMutationResult> {
  try {
    await rolePermissions.resetRolePermissions();
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Reset role permissions failed", describeError(error));
    return { ok: false, error: "Could not restore the defaults. Please try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetPasswordAction(
  _previousState: TeamActionState | null,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = resetPasswordSchema.safeParse({
    userId: text(formData, "userId"),
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  try {
    await service.resetMemberPassword(parsed.data.userId, parsed.data.password);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };

    logger.error("Password reset failed", describeError(error));
    return { error: "Could not set that password right now. Please try again." };
  }

  revalidatePath("/team");
  return { savedAt: Date.now() };
}
