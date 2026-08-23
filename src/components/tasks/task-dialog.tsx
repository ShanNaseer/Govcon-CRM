"use client";

import { useActionState, useEffect, useRef } from "react";

import { saveTaskAction, type TaskActionState } from "@/app/(dashboard)/tasks/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { TaskDto, TaskFormOptions } from "@/features/tasks/task.types";
import { TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { cn, humanizeEnum } from "@/lib/utils";

/**
 * Create / edit task dialog.
 *
 * `useActionState` against the same Server Function for both modes — a hidden `id`
 * is what distinguishes an update from an insert, so there is one validation path
 * rather than two that could drift.
 *
 * The parent remounts this via `key` when the target task changes, so the
 * uncontrolled fields pick up fresh `defaultValue`s without an effect syncing them.
 */

const INITIAL_STATE: TaskActionState | null = null;

/** `<input type="date">` wants `YYYY-MM-DD`, read in UTC to match how dates are stored. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-xs text-critical" role="alert">
      {messages.join(" ")}
    </p>
  );
}

export function TaskDialog({
  open,
  task,
  options,
  onClose,
}: {
  open: boolean;
  task: TaskDto | null;
  options: TaskFormOptions;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveTaskAction, INITIAL_STATE);
  const lastSavedAt = useRef<number | undefined>(undefined);

  /*
   * Close on a successful save. Keyed on the `savedAt` stamp rather than on a
   * boolean, so two consecutive saves each close the dialog instead of the second
   * being swallowed as "state unchanged".
   */
  useEffect(() => {
    if (state?.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      onClose();
    }
  }, [state?.savedAt, onClose]);

  const errors = state?.fieldErrors ?? {};
  const invalid = (field: string) => (errors[field] ? "border-critical" : undefined);

  const linkedValue = task?.linkedType && task.linkedId ? `${task.linkedType}:${task.linkedId}` : "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? "Edit Task" : "Create New Task"}
      description={`Fill in the details below to ${task ? "update" : "create"} a task.`}
    >
      <form action={formAction} className="space-y-4">
        {task ? <input type="hidden" name="id" value={task.id} /> : null}

        {state?.error ? (
          <div
            role="alert"
            className="rounded-card border border-[#fecaca] bg-critical-soft p-3 text-sm text-critical"
          >
            {state.error}
          </div>
        ) : null}

        <div>
          <label htmlFor="task-title" className="mb-1 block text-sm font-medium text-ink">
            Title
          </label>
          <Input
            id="task-title"
            name="title"
            required
            maxLength={300}
            defaultValue={task?.title ?? ""}
            placeholder="Enter task title"
            className={invalid("title")}
          />
          <FieldError messages={errors.title} />
        </div>

        <div>
          <label htmlFor="task-description" className="mb-1 block text-sm font-medium text-ink">
            Description
          </label>
          <Textarea
            id="task-description"
            name="description"
            rows={3}
            maxLength={5000}
            defaultValue={task?.description ?? ""}
            placeholder="Enter task description"
            className={invalid("description")}
          />
          <FieldError messages={errors.description} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="task-status" className="mb-1 block text-sm font-medium text-ink">
              Status
            </label>
            <Select id="task-status" name="status" defaultValue={task?.status ?? TaskStatus.TODO}>
              {Object.values(TaskStatus).map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="task-priority" className="mb-1 block text-sm font-medium text-ink">
              Priority
            </label>
            <Select
              id="task-priority"
              name="priority"
              defaultValue={task?.priority ?? TaskPriority.MEDIUM}
            >
              {Object.values(TaskPriority).map((priority) => (
                <option key={priority} value={priority}>
                  {humanizeEnum(priority)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="task-dueDate" className="mb-1 block text-sm font-medium text-ink">
              Due date
            </label>
            <Input
              id="task-dueDate"
              name="dueDate"
              type="date"
              defaultValue={toDateInput(task?.dueDate ?? null)}
              className={cn(invalid("dueDate"))}
            />
            <FieldError messages={errors.dueDate} />
          </div>

          <div>
            <label htmlFor="task-assignee" className="mb-1 block text-sm font-medium text-ink">
              Assignee
            </label>
            <Select id="task-assignee" name="assigneeId" defaultValue={task?.assigneeId ?? ""}>
              <option value="">Unassigned</option>
              {options.assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label htmlFor="task-linked" className="mb-1 block text-sm font-medium text-ink">
            Linked record
          </label>
          {/*
           * One control for both kinds, values prefixed with their type. A task can
           * therefore never be pointed at an opportunity and a client at once — the
           * service rejects that, and this makes it unrepresentable in the UI.
           */}
          <Select id="task-linked" name="linked" defaultValue={linkedValue}>
            <option value="">Not linked</option>
            {options.opportunities.length > 0 ? (
              <optgroup label="Opportunities">
                {options.opportunities.map((opportunity) => (
                  <option key={opportunity.id} value={`opportunity:${opportunity.id}`}>
                    {opportunity.title}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {options.clients.length > 0 ? (
              <optgroup label="Clients">
                {options.clients.map((client) => (
                  <option key={client.id} value={`client:${client.id}`}>
                    {client.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
          <FieldError messages={errors.opportunityId ?? errors.clientId} />
        </div>

        <div>
          <label htmlFor="task-tags" className="mb-1 block text-sm font-medium text-ink">
            Tags
          </label>
          <Input
            id="task-tags"
            name="tags"
            defaultValue={task?.tags.join(", ") ?? ""}
            placeholder="capture, compliance"
            className={invalid("tags")}
          />
          <p className="mt-1 text-xs text-ink-subtle">Comma separated.</p>
          <FieldError messages={errors.tags} />
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : task ? "Save Changes" : "Create Task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
