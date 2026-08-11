import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { getSession } from "@/lib/auth/session";

/**
 * Dashboard shell: fixed sidebar, sticky header, scrollable content column.
 *
 * AUTHENTICATION BOUNDARY — every route in this group renders behind this layout.
 *
 * It fails closed: when no session can be resolved (which is always the case in
 * production until an auth provider is wired in) the shell renders a notice
 * instead of the page. Without this the dashboard would serve client and
 * opportunity records to any anonymous visitor, even though the API layer
 * already returns 401 — the two boundaries must agree.
 *
 * TODO(auth): once a provider exists, replace this with a redirect to sign-in.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="hidden md:block">
        <AppSidebar appName={process.env.NEXT_PUBLIC_APP_NAME ?? "GovCon CRM"} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader userEmail={session?.email ?? "Not signed in"} />
        <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          <div className="mx-auto w-full max-w-[100rem]">
            {session ? (
              children
            ) : (
              <Card className="mt-6">
                <ErrorState
                  title="Authentication is not configured"
                  description="This deployment has no authentication provider, so dashboard data is not served. Configure a provider in src/lib/auth/session.ts before deploying."
                />
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
