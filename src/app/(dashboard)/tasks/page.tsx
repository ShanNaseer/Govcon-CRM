import { CheckSquare, CircleCheck, CircleDashed, LoaderCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskFilters } from "@/components/tasks/task-filters";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { listTasksQuerySchema } from "@/features/tasks/task.schemas";
import { getTaskFormOptions, listTasks, summarizeTasks } from "@/features/tasks/task.service";
import { safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "Tasks" };

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const params = await searchParams;
  const now = new Date();

  // URL parameters are untrusted; invalid values fall back to defaults rather than
  // failing the page. Empty strings from the filter bar parse to undefined.
  const parsed = listTasksQuerySchema.safeParse(
    Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== "" && value !== undefined),
    ),
  );
  const query = parsed.success ? parsed.data : listTasksQuerySchema.parse({});

  const result = await safeQuery("tasks", async () => {
    const [tasks, options] = await Promise.all([listTasks(query), getTaskFormOptions()]);
    return { tasks, options };
  });

  const header = (
    <PageHeader
      title="Tasks"
      description="Manage capture, proposal, and project tasks across the GovCon lifecycle"
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Tasks unavailable" description={result.message} />
        </Card>
      </>
    );
  }

  const { tasks, options } = result.data;
  const stats = summarizeTasks(tasks, now);

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          tone="brand"
          icon={<CheckSquare className="h-5 w-5" aria-hidden />}
          value={stats.total}
          label="Total Tasks"
          hint="All tasks across lifecycle stages"
        />
        <StatCard
          tone="warning"
          icon={<CircleDashed className="h-5 w-5" aria-hidden />}
          value={stats.todo}
          label="To Do"
          hint="Tasks waiting to be started"
        />
        <StatCard
          tone="accent"
          icon={<LoaderCircle className="h-5 w-5" aria-hidden />}
          value={stats.inProgress}
          label="In Progress"
          hint="Tasks currently being worked on"
        />
        <StatCard
          tone="positive"
          icon={<CircleCheck className="h-5 w-5" aria-hidden />}
          value={stats.done}
          label="Done"
          hint="Completed tasks"
        />
      </div>

      <div className="mt-6">
        <TaskFilters
          priority={query.priority ?? ""}
          linkedTo={query.linkedTo ?? ""}
          assigneeId={query.assigneeId ?? ""}
          assignees={options.assignees}
          overdueCount={stats.overdue}
          highPriorityCount={stats.highPriority}
        />
      </div>

      <div className="mt-6">
        <TaskBoard tasks={tasks} options={options} now={now} />
      </div>
    </>
  );
}
