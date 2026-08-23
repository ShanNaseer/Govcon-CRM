"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Flame } from "lucide-react";

import { Select } from "@/components/ui/input";
import { TaskPriority } from "@/generated/prisma/enums";
import { humanizeEnum } from "@/lib/utils";

/**
 * Filter bar for the tasks board.
 *
 * Filter state lives in the URL, so the page stays a Server Component and a
 * filtered board is shareable. Selecting navigates immediately — there is no Apply
 * button in the design, and a filter that needs confirming is a filter people stop
 * using.
 */
export function TaskFilters({
  priority,
  linkedTo,
  assigneeId,
  assignees,
  overdueCount,
  highPriorityCount,
}: {
  priority: string;
  linkedTo: string;
  assigneeId: string;
  assignees: Array<{ id: string; name: string }>;
  overdueCount: number;
  highPriorityCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function commit(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-45">
        <label htmlFor="filter-linked" className="sr-only">
          Filter by linked record
        </label>
        <Select
          id="filter-linked"
          value={linkedTo}
          onChange={(event) => commit("linkedTo", event.target.value)}
        >
          <option value="">All Entities</option>
          <option value="opportunity">Opportunities</option>
          <option value="client">Clients</option>
          <option value="unlinked">Not linked</option>
        </Select>
      </div>

      <div className="w-45">
        <label htmlFor="filter-priority" className="sr-only">
          Filter by priority
        </label>
        <Select
          id="filter-priority"
          value={priority}
          onChange={(event) => commit("priority", event.target.value)}
        >
          <option value="">All Priorities</option>
          {Object.values(TaskPriority).map((value) => (
            <option key={value} value={value}>
              {humanizeEnum(value)} Priority
            </option>
          ))}
        </Select>
      </div>

      <div className="w-45">
        <label htmlFor="filter-assignee" className="sr-only">
          Filter by assignee
        </label>
        <Select
          id="filter-assignee"
          value={assigneeId}
          onChange={(event) => commit("assigneeId", event.target.value)}
        >
          <option value="">All Assignees</option>
          {assignees.map((assignee) => (
            <option key={assignee.id} value={assignee.id}>
              {assignee.name}
            </option>
          ))}
        </Select>
      </div>

      {/*
       * Counts, not filters. The board already surfaces overdue cards in red; these
       * make the totals legible without scanning four columns.
       */}
      <div className="ml-auto flex items-center gap-2">
        {overdueCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical">
            <AlertCircle className="h-3 w-3" aria-hidden />
            {overdueCount} overdue
          </span>
        ) : null}
        {highPriorityCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-fit-weak/10 px-2.5 py-1 text-xs font-medium text-[#b8600a]">
            <Flame className="h-3 w-3" aria-hidden />
            {highPriorityCount} high priority
          </span>
        ) : null}
      </div>
    </div>
  );
}
