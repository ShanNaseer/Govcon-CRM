import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

/**
 * Transport types for the Task domain. Dates are ISO strings so these cross the
 * Server/Client boundary without loss — see the note in client.types.ts.
 */

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** ISO 8601, or null when the task has no deadline. */
  dueDate: string | null;
  completedAt: string | null;
  tags: string[];

  assigneeId: string | null;
  assigneeName: string | null;

  /** The linked record, whichever kind it is, flattened for display. */
  linkedType: "opportunity" | "client" | null;
  linkedId: string | null;
  linkedLabel: string | null;

  createdAt: string;
  updatedAt: string;
};

/** Counts backing the tasks page summary row. */
export type TaskBoardStats = {
  total: number;
  todo: number;
  inProgress: number;
  review: number;
  done: number;
  overdue: number;
  highPriority: number;
};

/** Options for the create/edit dialog's relation pickers. */
export type TaskFormOptions = {
  assignees: Array<{ id: string; name: string }>;
  opportunities: Array<{ id: string; title: string }>;
  clients: Array<{ id: string; name: string }>;
};
