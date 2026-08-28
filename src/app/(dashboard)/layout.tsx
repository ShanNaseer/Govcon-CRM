import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";

/**
 * Dashboard shell: sidebar rail, header, scrollable content column.
 *
 * `requireUser()` here redirects an unauthenticated visitor to /login, and supplies
 * the identity the sidebar shows. It is NOT the security boundary: a Next.js layout
 * does not re-render on client-side navigation and does not stop nested segments
 * from rendering. The enforcement that matters happens at the data source — every
 * function in src/features/**\/*.service.ts calls `requireSession()` before it
 * touches the database, so no page can serve records by omitting a check.
 *
 * `session.permissions` comes from the editable role matrix, resolved per request —
 * so a permission granted or revoked in /team/permissions changes the sidebar on
 * the affected users' next navigation, with no sign-out required.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();

  return (
    <AppShell
      appName={process.env.NEXT_PUBLIC_APP_NAME ?? "GovCon CRM"}
      userEmail={session.email}
      userName={session.name}
      userRole={ROLE_LABELS[session.role]}
      permissions={session.permissions}
    >
      {children}
    </AppShell>
  );
}
