"use server";

import { revalidatePath } from "next/cache";

import { parseTaskForm } from "@/features/tasks/task.form";
import { moveTaskSchema, taskIdSchema } from "@/features/tasks/task.schemas";
import * as service from "@/features/tasks/task.service";
import { AppError } from "@/lib/api/errors";
import { describeError, logger } from "@/lib/logger";

/**
 * Task mutations for the board.
 *
 * Each delegates to the service, which calls `requireSession()` before it writes.
 * Nothing here re-implements authorization, and nothing here may skip it. The
 * form-to-input mapping lives in task.form.ts so it can be tested without a
 * request context; this module is only the request-bound glue.
 */

export type TaskActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Bumped on success so the dialog knows to close. */
  savedAt?: number;
};

export type TaskMutationResult = { ok: true } | { ok: false; error: string };

export async function saveTaskAction(
  _previousState: TaskActionState | null,
  formData: FormData,
): Promise<TaskActionState> {
  const parsed = parseTaskForm(formData);

  if (!parsed.success) {
    return { error: "Please correct the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }

  try {
    if (parsed.mode === "update") {
      await service.updateTask(taskIdSchema.parse(parsed.id), parsed.data);
    } else {
      await service.createTask(parsed.data);
    }
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };

    logger.error("Task save failed", describeError(error));
    return { error: "Could not save this task right now. Please try again." };
  }

  revalidatePath("/tasks");
  return { savedAt: Date.now() };
}

export async function moveTaskAction(id: string, status: string): Promise<TaskMutationResult> {
  const parsed = moveTaskSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "That move is not valid." };

  try {
    await service.moveTask(parsed.data.id, parsed.data.status);
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Task move failed", describeError(error));
    return { ok: false, error: "Could not move that task. Please try again." };
  }

  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteTaskAction(id: string): Promise<TaskMutationResult> {
  const parsed = taskIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "That task reference is not valid." };

  try {
    await service.deleteTask(parsed.data);
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Task delete failed", describeError(error));
    return { ok: false, error: "Could not delete that task. Please try again." };
  }

  revalidatePath("/tasks");
  return { ok: true };
}
