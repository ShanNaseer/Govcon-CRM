import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";
import { humanizeEnum } from "@/lib/utils";

/**
 * Dashboard shell: sidebar rail, header, scrollable content column.
 *
 * `requireUser()` here redirects an unauthenticated visitor to /login, and supplies
 * the identity the sidebar shows. It is NOT the security boundary: a Next.js layout
 * does not re-render on client-side navigation and does not stop nested segments
 * from rendering. The enforcement that matters happens at the data source — every
 * function in src/features/**\/*.service.ts calls `requireSession()` before it
 * touches the database, so no page can serve records by omitting a check.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();

  return (
    <AppShell
      appName={process.env.NEXT_PUBLIC_APP_NAME ?? "GovCon CRM"}
      userEmail={session.email}
      userName={session.name}
      userRole={humanizeEnum(session.role)}
    >
      {children}
    </AppShell>
  );
}
