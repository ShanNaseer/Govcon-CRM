import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { TaskStatus } from "@/generated/prisma/enums";
import type {
  CreateTaskInput,
  ListTasksQuery,
  UpdateTaskInput,
} from "@/features/tasks/task.schemas";
import { prisma } from "@/lib/db/prisma";

/** Data access for the Task aggregate. The only module that queries Prisma for tasks. */

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  completedAt: true,
  tags: true,
  assigneeId: true,
  assignee: { select: { name: true } },
  opportunityId: true,
  opportunity: { select: { title: true } },
  clientId: true,
  client: { select: { name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;

export type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

function buildWhere(query: ListTasksQuery): Prisma.TaskWhereInput {
  const filters: Prisma.TaskWhereInput[] = [];

  if (query.status) filters.push({ status: query.status });
  if (query.priority) filters.push({ priority: query.priority });
  if (query.assigneeId) filters.push({ assigneeId: query.assigneeId });

  if (query.linkedTo === "opportunity") filters.push({ opportunityId: { not: null } });
  if (query.linkedTo === "client") filters.push({ clientId: { not: null } });
  if (query.linkedTo === "unlinked") filters.push({ opportunityId: null, clientId: null });

  return filters.length === 0 ? {} : { AND: filters };
}

export async function findManyTasks(query: ListTasksQuery): Promise<TaskRow[]> {
  return prisma.task.findMany({
    where: buildWhere(query),
    select: taskSelect,
    /*
     * Soonest deadline first, undated last, then newest. The board renders every
     * column from one query, so this is also the within-column order.
     */
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: query.take,
  });
}

export async function findTaskById(id: string): Promise<TaskRow | null> {
  return prisma.task.findUnique({ where: { id }, select: taskSelect });
}

export async function createTask(
  input: CreateTaskInput,
  createdById: string | null,
): Promise<TaskRow> {
  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      tags: input.tags,
      assigneeId: input.assigneeId ?? null,
      opportunityId: input.opportunityId ?? null,
      clientId: input.clientId ?? null,
      createdById,
      // A task created straight into Done is complete as of now.
      completedAt: input.status === TaskStatus.DONE ? new Date() : null,
    },
    select: taskSelect,
  });
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<TaskRow> {
  return prisma.task.update({
    where: { id },
    // Only keys present in `input` are written; `undefined` leaves a column alone.
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      tags: input.tags,
      assigneeId: input.assigneeId,
      opportunityId: input.opportunityId,
      clientId: input.clientId,
    },
    select: taskSelect,
  });
}

/**
 * Moves a task to a column and maintains `completedAt` in the same statement.
 *
 * Done stamps the completion time only if it is not already set, so re-dropping a
 * card inside Done does not rewrite when the work finished; leaving Done clears it.
 */
export async function moveTask(
  id: string,
  status: TaskStatus,
  previousCompletedAt: Date | null,
): Promise<TaskRow> {
  const completedAt =
    status === TaskStatus.DONE ? (previousCompletedAt ?? new Date()) : null;

  return prisma.task.update({
    where: { id },
    data: { status, completedAt },
    select: taskSelect,
  });
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({ where: { id } });
}

/** Relation options for the create/edit dialog. Capped — these feed a `<select>`. */
export async function findFormOptions() {
  const [assignees, opportunities, clients] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.opportunity.findMany({
      select: { id: true, title: true },
      orderBy: { responseDeadline: { sort: "asc", nulls: "last" } },
      take: 200,
    }),
    prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return { assignees, opportunities, clients };
}
