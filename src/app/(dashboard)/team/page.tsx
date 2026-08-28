import { CheckCircle2, ClipboardList, ShieldCheck, UserCheck, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { TeamDirectory } from "@/components/team/team-directory";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { listTeamMembers, summarizeTeam } from "@/features/team/team.service";
import { sessionHasPermission, requirePagePermission } from "@/lib/auth/session";
import { safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "Team" };

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  /*
   * The real gate. A member who types /team is redirected to the dashboard, and the
   * service refuses to return anything without `team:read` even if this were
   * bypassed — hiding the sidebar entry is not what keeps them out.
   */
  const session = await requirePagePermission("team:read");
  const canManage = sessionHasPermission(session, "team:manage");

  const result = await safeQuery("team", () => listTeamMembers({}));

  const header = (
    <PageHeader
      title="Team"
      description="Manage team members and view their activity"
      actions={
        /*
         * Shown to anyone with `team:read`, because the matrix is worth being able
         * to consult even when you cannot change it — the page itself renders
         * read-only without `team:manage`.
         */
        <ButtonLink href="/team/permissions" variant="secondary">
          <ShieldCheck aria-hidden />
          Roles &amp; Permissions
        </ButtonLink>
      }
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Team unavailable" description={result.message} />
        </Card>
      </>
    );
  }

  const members = result.data;
  const stats = summarizeTeam(members);

  return (
    <>
      {header}

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <StatCard
          tone="brand"
          icon={<Users className="h-5 w-5" aria-hidden />}
          value={stats.total}
          label="Total Members"
          hint="Accounts in this workspace"
        />
        <StatCard
          tone="positive"
          icon={<UserCheck className="h-5 w-5" aria-hidden />}
          value={stats.active}
          label="Active"
          hint="Accounts able to sign in"
        />
        <StatCard
          tone="warning"
          icon={<ClipboardList className="h-5 w-5" aria-hidden />}
          value={stats.tasksAssigned}
          label="Tasks Assigned"
          hint="Across the whole team"
        />
        <StatCard
          tone="accent"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          value={stats.tasksCompleted}
          label="Tasks Completed"
          hint="Marked done"
        />
      </div>

      <TeamDirectory members={members} canManage={canManage} currentUserId={session.userId} />
    </>
  );
}
