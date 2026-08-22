"use client";

import { useState, type ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";

/**
 * Dashboard chrome: sidebar rail, header, scrollable content column.
 *
 * A Client Component only because the mobile drawer's open state is shared
 * between the header's hamburger and the sidebar. `children` arrives already
 * rendered on the server, so pages stay Server Components — passing them through
 * as a prop keeps the data-fetching layout untouched by this boundary.
 */
export function AppShell({
  appName,
  userEmail,
  userName,
  userRole,
  children,
}: {
  appName: string;
  userEmail: string;
  userName?: string;
  userRole?: string;
  children: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <AppSidebar
        appName={appName}
        userEmail={userEmail}
        userName={userName}
        userRole={userRole}
        mobileOpen={mobileMenuOpen}
        onNavigate={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader
          mobileMenuOpen={mobileMenuOpen}
          onToggleMobileMenu={() => setMobileMenuOpen((previous) => !previous)}
        />

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-6">
          <div className="mx-auto w-full max-w-[100rem]">{children}</div>
        </main>
      </div>

      {mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      ) : null}
    </div>
  );
}
