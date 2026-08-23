"use client";

import { useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  Pencil,
  Trash2,
  User as UserIcon,
} from "lucide-react";

import { deleteTaskAction, moveTaskAction } from "@/app/(dashboard)/tasks/actions";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { Button } from "@/components/ui/button";
import type { TaskDto, TaskFormOptions } from "@/features/tasks/task.types";
import { TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { cn, formatDate, humanizeEnum } from "@/lib/utils";

/**
 * Kanban board for tasks.
 *
 * Drag-and-drop uses the browser's own HTML5 drag events rather than a library.
 * The reference design pulls in react-dnd for this; four drop targets and one
 * payload do not justify the dependency, and the native API brings the drag image
 * and cursor behaviour with it.
 *
 * Dragging is a pointer-only affordance, so every card also carries a status
 * `<select>` — that is the keyboard and touch path to the same mutation, not a
 * decoration.
 */

const COLUMNS: Array<{ status: TaskStatus; title: string; surface: string; heading: string }> = [
  { status: TaskStatus.TODO, title: "To Do", surface: "bg-surface-muted", heading: "text-ink-muted" },
  {
    status: TaskStatus.IN_PROGRESS,
    title: "In Progress",
    surface: "bg-brand/10",
    heading: "text-brand",
  },
  {
    status: TaskStatus.REVIEW,
    title: "Review",
    surface: "bg-fit-weak/10",
    heading: "text-[#b8600a]",
  },
  {
    status: TaskStatus.DONE,
    title: "Done",
    surface: "bg-fit-strong/10",
    heading: "text-[#1a8f5c]",
  },
];

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  [TaskPriority.HIGH]: "bg-fit-poor text-white",
  [TaskPriority.MEDIUM]: "bg-fit-weak text-white",
  [TaskPriority.LOW]: "bg-fit-strong text-white",
};

function TaskCard({
  task,
  now,
  onEdit,
  onDragStart,
  busy,
  onMove,
  onDelete,
}: {
  task: TaskDto;
  now: Date;
  onEdit: (task: TaskDto) => void;
  onDragStart: (event: DragEvent<HTMLElement>, task: TaskDto) => void;
  busy: boolean;
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (task: TaskDto) => void;
}) {
  const isOverdue =
    task.dueDate !== null &&
    task.status !== TaskStatus.DONE &&
    new Date(task.dueDate).getTime() < now.getTime();

  const linkHref =
    task.linkedType === "opportunity"
      ? `/opportunities/${task.linkedId}`
      : task.linkedType === "client"
        ? `/clients/${task.linkedId}`
        : null;

  return (
    <article
      draggable
      onDragStart={(event) => onDragStart(event, task)}
      className={cn(
        "cursor-grab rounded-card border bg-surface p-4 transition-shadow hover:shadow-md active:cursor-grabbing",
        isOverdue ? "border-[#fecaca] bg-critical-soft/50" : "border-line",
        busy && "opacity-50",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 text-sm font-medium text-ink">{task.title}</h3>
          {task.description ? (
            <p className="line-clamp-2 text-sm text-ink-muted">{task.description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label={`Edit ${task.title}`}
            className="rounded-md p-1 text-ink-subtle hover:bg-canvas hover:text-ink"
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(task)}
            aria-label={`Delete ${task.title}`}
            className="rounded-md p-1 text-ink-subtle hover:bg-critical-soft hover:text-critical"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            PRIORITY_CLASSES[task.priority],
          )}
        >
          {humanizeEnum(task.priority)}
        </span>

        {linkHref ? (
          <Link
            href={linkHref}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted hover:bg-canvas hover:text-ink"
            title={task.linkedLabel ?? undefined}
          >
            {task.linkedType === "opportunity" ? (
              <Briefcase className="h-2.5 w-2.5" aria-hidden />
            ) : (
              <Building2 className="h-2.5 w-2.5" aria-hidden />
            )}
            <span className="max-w-28 truncate">{task.linkedLabel ?? task.linkedType}</span>
          </Link>
        ) : null}

        {task.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-field px-2 py-0.5 text-xs text-ink-muted">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
        {isOverdue ? (
          <span className="inline-flex items-center gap-1 text-xs text-critical">
            <AlertCircle className="h-3 w-3" aria-hidden />
            Overdue
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <Calendar className="h-3 w-3" aria-hidden />
            {task.dueDate === null ? "No due date" : formatDate(task.dueDate)}
          </span>
        )}

        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-ink-muted">
          <UserIcon className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{task.assigneeName ?? "Unassigned"}</span>
        </span>
      </div>

      {/*
       * The keyboard- and touch-accessible equivalent of dragging the card. Native
       * drag events fire for neither, so without this the board would be usable
       * only with a mouse.
       */}
      <div className="mt-2">
        <label htmlFor={`move-${task.id}`} className="sr-only">
          Move {task.title} to column
        </label>
        <select
          id={`move-${task.id}`}
          value={task.status}
          disabled={busy}
          onChange={(event) => onMove(task.id, event.target.value as TaskStatus)}
          className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-muted disabled:cursor-not-allowed"
        >
          {COLUMNS.map((column) => (
            <option key={column.status} value={column.status}>
              Move to {column.title}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

export function TaskBoard({
  tasks,
  options,
  now,
}: {
  tasks: TaskDto[];
  options: TaskFormOptions;
  now: Date;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogTask, setDialogTask] = useState<TaskDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function move(id: string, status: TaskStatus) {
    setError(null);
    setBusyId(id);

    startTransition(async () => {
      const result = await moveTaskAction(id, status);
      if (!result.ok) setError(result.error);
      setBusyId(null);
    });
  }

  function remove(task: TaskDto) {
    setError(null);
    setBusyId(task.id);

    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (!result.ok) setError(result.error);
      setBusyId(null);
    });
  }

  function onDragStart(event: DragEvent<HTMLElement>, task: TaskDto) {
    // `text/plain` so the drag is well-formed for the platform; the id is all the
    // drop handler needs.
    event.dataTransfer.setData("text/plain", task.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDrop(event: DragEvent<HTMLDivElement>, status: TaskStatus) {
    event.preventDefault();
    setDragOver(null);

    const id = event.dataTransfer.getData("text/plain");
    if (!id) return;

    // Dropping a card back into its own column is not a change.
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task || task.status === status) return;

    move(id, status);
  }

  return (
    <>
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-card border border-[#fecaca] bg-critical-soft p-3 text-sm text-critical"
        >
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex justify-end">
        <Button
          variant="primary"
          onClick={() => {
            setDialogTask(null);
            setDialogOpen(true);
          }}
        >
          New Task
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.status);

          return (
            <div key={column.status} className="min-w-70 flex-1">
              <div className="mb-3 flex items-center gap-2">
                <h3 className={cn("font-semibold", column.heading)}>{column.title}</h3>
                <span className="numeric rounded-full bg-field px-2 py-0.5 text-xs font-medium text-ink-muted">
                  {columnTasks.length}
                </span>
              </div>

              <div
                onDragOver={(event) => {
                  // Preventing default is what marks this element as a drop target.
                  event.preventDefault();
                  setDragOver(column.status);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(event) => onDrop(event, column.status)}
                className={cn(
                  "min-h-125 rounded-lg p-3 transition-colors",
                  column.surface,
                  dragOver === column.status && "ring-2 ring-brand",
                )}
              >
                <div className="space-y-3">
                  {columnTasks.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-muted">No tasks</p>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        now={now}
                        busy={pending && busyId === task.id}
                        onEdit={(target) => {
                          setDialogTask(target);
                          setDialogOpen(true);
                        }}
                        onDragStart={onDragStart}
                        onMove={move}
                        onDelete={remove}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <TaskDialog
        key={dialogTask?.id ?? "new"}
        open={dialogOpen}
        task={dialogTask}
        options={options}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
