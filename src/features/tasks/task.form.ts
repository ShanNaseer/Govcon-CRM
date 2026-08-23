import {
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/features/tasks/task.schemas";

/**
 * Translation between the task dialog and the Task schemas.
 *
 * Separate from the Server Function that calls it, and free of any server-only
 * import: a `"use server"` module exports only callable actions, which cannot be
 * exercised without a Next request context. The logic worth testing — the link
 * encoding, blank handling, create-versus-update shape — lives here.
 */

/**
 * The dialog carries the linked record in one field, encoded `"<kind>:<id>"`.
 *
 * One control rather than a kind selector plus an id selector means a task cannot
 * be pointed at an opportunity and a client simultaneously. The service rejects
 * that combination anyway; this makes it unrepresentable in the form.
 */
export function splitLink(linked: string): { opportunityId?: string; clientId?: string } {
  const separator = linked.indexOf(":");
  if (separator < 0) return {};

  const kind = linked.slice(0, separator);
  const id = linked.slice(separator + 1);
  if (!id) return {};

  if (kind === "opportunity") return { opportunityId: id };
  if (kind === "client") return { clientId: id };
  return {};
}

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : undefined;
}

export type ParsedTaskForm =
  | { success: true; mode: "create"; data: CreateTaskInput }
  | { success: true; mode: "update"; id: string; data: UpdateTaskInput }
  | { success: false; fieldErrors: Record<string, string[]> };

/** Collects Zod issues into per-field messages, one per distinct path. */
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

/**
 * Maps the dialog's fields onto a validated create or update payload.
 *
 * A present, non-empty `id` selects update. On update both link columns are sent
 * explicitly when the field was cleared, because an omitted key means "leave
 * unchanged" — without that, removing a link in the UI would silently keep it.
 */
export function parseTaskForm(formData: FormData): ParsedTaskForm {
  const id = value(formData, "id") ?? "";
  const isEdit = id !== "";
  const linked = value(formData, "linked") ?? "";

  const candidate = {
    title: value(formData, "title"),
    description: value(formData, "description"),
    status: value(formData, "status"),
    priority: value(formData, "priority"),
    dueDate: value(formData, "dueDate"),
    assigneeId: value(formData, "assigneeId"),
    tags: value(formData, "tags"),
    ...splitLink(linked),
    ...(isEdit && linked === "" ? { opportunityId: null, clientId: null } : {}),
  };

  if (isEdit) {
    const parsed = updateTaskSchema.safeParse(candidate);
    if (!parsed.success) {
      return { success: false, fieldErrors: collectFieldErrors(parsed.error.issues) };
    }
    return { success: true, mode: "update", id, data: parsed.data };
  }

  const parsed = createTaskSchema.safeParse(candidate);
  if (!parsed.success) {
    return { success: false, fieldErrors: collectFieldErrors(parsed.error.issues) };
  }
  return { success: true, mode: "create", data: parsed.data };
}
