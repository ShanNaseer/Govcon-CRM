import "server-only";

import * as repository from "@/features/tasks/task.repository";
import type { TaskRow } from "@/features/tasks/task.repository";
import type {
  CreateTaskInput,
  ListTasksQuery,
  UpdateTaskInput,
} from "@/features/tasks/task.schemas";
import type { TaskBoardStats, TaskDto, TaskFormOptions } from "@/features/tasks/task.types";
import { TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/**
 * Business logic for the Task domain, and the authorization choke point for it —
 * every exported function calls `requireSession()` before touching the database,
 * for the reason described in client.service.ts.
 */

function dateToIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toDto(row: TaskRow): TaskDto {
  /*
   * A task links to at most one record. The opportunity wins if both columns are
   * somehow set, so the card never renders two conflicting badges.
   */
  const linkedType = row.opportunityId ? "opportunity" : row.clientId ? "client" : null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: dateToIso(row.dueDate),
    completedAt: dateToIso(row.completedAt),
    tags: row.tags,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.name ?? null,
    linkedType,
    linkedId: linkedType === "opportunity" ? row.opportunityId : row.clientId,
    linkedLabel:
      linkedType === "opportunity"
        ? (row.opportunity?.title ?? null)
        : (row.client?.name ?? null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Rejects a task linked to two different records at once. */
function assertSingleLink(input: { opportunityId?: string | null; clientId?: string | null }): void {
  if (input.opportunityId && input.clientId) {
    throw AppError.validation("A task can be linked to an opportunity or a client, not both", {
      opportunityId: ["Choose one linked record"],
    });
  }
}

export async function listTasks(query: ListTasksQuery): Promise<TaskDto[]> {
  await requireSession();

  const rows = await repository.findManyTasks(query);
  return rows.map(toDto);
}

/**
 * Board counts.
 *
 * Derived from the same filtered list the board renders, so the summary cards and
 * the columns beneath them can never disagree.
 */
export function summarizeTasks(tasks: TaskDto[], now: Date): TaskBoardStats {
  const isOverdue = (task: TaskDto) =>
    task.dueDate !== null &&
    task.status !== TaskStatus.DONE &&
    new Date(task.dueDate).getTime() < now.getTime();

  return {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === TaskStatus.TODO).length,
    inProgress: tasks.filter((task) => task.status === TaskStatus.IN_PROGRESS).length,
    review: tasks.filter((task) => task.status === TaskStatus.REVIEW).length,
    done: tasks.filter((task) => task.status === TaskStatus.DONE).length,
    overdue: tasks.filter(isOverdue).length,
    highPriority: tasks.filter((task) => task.priority === TaskPriority.HIGH).length,
  };
}

export async function getTaskFormOptions(): Promise<TaskFormOptions> {
  await requireSession();
  return repository.findFormOptions();
}

export async function createTask(input: CreateTaskInput): Promise<TaskDto> {
  const session = await requireSession();
  assertSingleLink(input);

  const row = await repository.createTask(input, session.userId);

  logger.info("Task created", { taskId: row.id, status: row.status });
  return toDto(row);
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<TaskDto> {
  await requireSession();
  assertSingleLink(input);

  const existing = await repository.findTaskById(id);
  if (!existing) throw AppError.notFound("Task", id);

  const row = await repository.updateTask(id, input);

  logger.info("Task updated", { taskId: id });
  return toDto(row);
}

/** Column change from a drag, or from the card's status control. */
export async function moveTask(id: string, status: TaskStatus): Promise<TaskDto> {
  await requireSession();

  const existing = await repository.findTaskById(id);
  if (!existing) throw AppError.notFound("Task", id);

  const row = await repository.moveTask(id, status, existing.completedAt);

  logger.info("Task moved", { taskId: id, from: existing.status, to: status });
  return toDto(row);
}

export async function deleteTask(id: string): Promise<void> {
  await requireSession();

  const existing = await repository.findTaskById(id);
  if (!existing) throw AppError.notFound("Task", id);

  await repository.deleteTask(id);
  logger.info("Task deleted", { taskId: id });
}
