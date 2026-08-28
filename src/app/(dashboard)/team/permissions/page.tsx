import { PageHeader } from "@/components/layout/page-header";
import { PermissionMatrix } from "@/components/team/permission-matrix";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { getPermissionMatrix } from "@/features/team/role-permissions.service";
import { requirePagePermission, sessionHasPermission } from "@/lib/auth/session";
import { safeQuery } from "@/lib/db/safe-query";

export const metadata = { title: "Roles & Permissions" };

/*
 * Never cached: this page renders authorization state, and a stale copy of it would
 * mislead the person whose job is to audit it.
 */
export const dynamic = "force-dynamic";

export default async function RolePermissionsPage() {
  /*
   * `team:read` to look, `team:manage` to change. Gated at both levels: this
   * redirect keeps a member from loading the page, and the service refuses to
   * return or write anything without the same permissions even if it were
   * bypassed — hiding the link is not what keeps them out.
   */
  const session = await requirePagePermission("team:read");
  const canManage = sessionHasPermission(session, "team:manage");

  const result = await safeQuery("role permissions", () => getPermissionMatrix());

  const header = (
    <PageHeader
      title="Roles & Permissions"
      description="Choose which tabs and actions each role can reach"
      breadcrumbs={[{ label: "Team", href: "/team" }, { label: "Roles & Permissions" }]}
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <ErrorState title="Permissions unavailable" description={result.message} />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <PermissionMatrix matrix={result.data} canManage={canManage} viewerRole={session.role} />
    </>
  );
}
