"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Target } from "lucide-react";

import { NAV_SECTIONS, type NavItem } from "@/components/layout/nav-config";
import { UserMenu } from "@/components/layout/user-menu";
import type { Permission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

/**
 * Primary navigation, styled to the Figma design: 16rem white rail, grouped
 * sections with slate headings, icon + label rows, and a solid brand fill on the
 * active item.
 *
 * Off-canvas below `lg` — it slides in over a scrim rather than reserving width,
 * which is what the design specifies for small screens. The open state is owned
 * by `AppShell` because the header's hamburger toggles it too.
 */

/**
 * Longest matching href wins.
 *
 * A plain prefix test would light up both "Team" (/team) and "Roles & Permissions"
 * (/team/permissions) on the nested route. Comparing against the best match across
 * the whole nav keeps exactly one row highlighted whenever one entry sits under
 * another.
 */
function activeHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;

  for (const item of items) {
    if (!item.implemented) continue;

    const matches =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    if (matches && (best === null || item.href.length > best.length)) best = item.href;
  }

  return best;
}

export function AppSidebar({
  appName,
  userEmail,
  userName,
  userRole,
  permissions,
  mobileOpen,
  onNavigate,
}: {
  appName: string;
  userEmail: string;
  userName?: string;
  userRole?: string;
  /** The viewer's permissions, resolved on the server from their role. */
  permissions: readonly Permission[];
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  /*
   * Entries the viewer cannot use are removed entirely, and a section left with
   * nothing in it is dropped with them — an empty "Bids & Compliance" heading is
   * worse than no heading. This is presentation only; the routes enforce the same
   * permissions server-side.
   */
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permission || permissions.includes(item.permission),
    ),
  })).filter((section) => section.items.length > 0);

  /*
   * Resolved across every visible entry rather than per row, so nesting one route
   * under another cannot highlight both.
   */
  const currentHref = activeHref(
    pathname,
    visibleSections.flatMap((section) => section.items),
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-line bg-surface",
        "transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-4">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white"
          >
            <Target className="h-5 w-5" />
          </span>
          <span className="truncate text-lg font-semibold text-ink">{appName}</span>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-6 overflow-y-auto p-4">
          {visibleSections.map((section, sectionIndex) => (
            <div key={section.title ?? `section-${sectionIndex}`}>
              {section.title ? (
                <p className="mb-2 px-3 text-[12px] font-semibold text-ink-subtle">{section.title}</p>
              ) : null}

              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = item.implemented && item.href === currentHref;
                  const Icon = item.icon;

                  return (
                    <li key={`${section.title ?? "top"}-${item.label}`}>
                      {item.implemented ? (
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                            active ? "bg-brand text-white" : "text-ink-muted hover:bg-canvas hover:text-ink",
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge ? (
                            <span
                              className={cn(
                                "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
                                active ? "bg-white/20 text-white" : "bg-accent text-white",
                              )}
                            >
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      ) : (
                        <span
                          aria-disabled="true"
                          title="Not implemented in this release"
                          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-subtle"
                        >
                          <Icon className="h-5 w-5 shrink-0" aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-4">
          <UserMenu email={userEmail} name={userName} role={userRole} />
        </div>
      </div>
    </aside>
  );
}
