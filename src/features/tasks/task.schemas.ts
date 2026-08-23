import { z } from "zod";

import { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

/**
 * Zod schemas for the Task domain. The only accepted shape for external input —
 * the Server Functions validate against these before the service layer runs.
 * Shared with the client bundle, so nothing server-only may be imported.
 */

/** Blank becomes null (an explicit clear); an omitted key stays undefined. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullish();

/**
 * A cuid, or null. Empty string maps to null so an unselected `<select>` reads as
 * "no link" rather than failing validation.
 */
const optionalId = z
  .string()
  .trim()
  .max(64)
  .transform((value) => (value === "" ? null : value))
  .nullish();

/**
 * A date-only value from `<input type="date">`, parsed at UTC midnight.
 *
 * Appending the time explicitly matters: `new Date("2026-08-23")` is already UTC,
 * but `new Date("2026-08-23T00:00")` is local — mixing the two shifts a deadline
 * across a day boundary depending on the viewer's timezone. Every date in this
 * application is formatted in UTC (see `formatDate`), so it is stored that way.
 */
const dueDateSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined) return value ?? null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });

const tagsSchema = z
  .string()
  .trim()
  .default("")
  .transform((value) => [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ])
  .refine((tags) => tags.length <= 20, { error: "At most 20 tags" })
  .refine((tags) => tags.every((tag) => tag.length <= 40), { error: "Each tag is at most 40 characters" });

const taskFields = {
  title: z.string().trim().min(1, { error: "Title is required" }).max(300),
  description: optionalText(5000),
  status: z.enum(TaskStatus),
  priority: z.enum(TaskPriority),
  dueDate: dueDateSchema,
  assigneeId: optionalId,
  opportunityId: optionalId,
  clientId: optionalId,
  tags: tagsSchema,
} as const;

export const createTaskSchema = z.object({
  ...taskFields,
  status: taskFields.status.default(TaskStatus.TODO),
  priority: taskFields.priority.default(TaskPriority.MEDIUM),
});

/** Partial update. An omitted key means "leave unchanged". */
export const updateTaskSchema = z
  .object({
    ...taskFields,
    title: taskFields.title.optional(),
    status: taskFields.status.optional(),
    priority: taskFields.priority.optional(),
    tags: taskFields.tags.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    error: "At least one field must be provided",
  });

/** Moving a card between columns — the only write a drag performs. */
export const moveTaskSchema = z.object({
  id: z.string().trim().min(1).max(64),
  status: z.enum(TaskStatus),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  /** `"opportunity"` / `"client"` / `"unlinked"` — the board's entity filter. */
  linkedTo: z.enum(["opportunity", "client", "unlinked"]).optional(),
  assigneeId: optionalId,
  take: z.coerce.number().int().min(1).max(500).default(300),
});

export const taskIdSchema = z.string().trim().min(1).max(64);

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
