"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Landmark } from "lucide-react";

import { NAV_SECTIONS, type NavItem } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

/**
 * Primary navigation.
 *
 * Client Component solely because active-link highlighting needs `usePathname`.
 * The nav model itself is static data imported from a plain module.
 */

function isActive(pathname: string, item: NavItem): boolean {
  if (!item.implemented) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppSidebar({ appName }: { appName: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-surface"
    >
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-white">
          <Landmark className="h-4 w-4" aria-hidden />
        </span>
        <span className="truncate text-sm font-semibold text-ink">{appName}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <div key={section.title ?? `section-${sectionIndex}`} className="mb-4 last:mb-0">
            {section.title ? (
              <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">
                {section.title}
              </p>
            ) : null}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item);

                return (
                  <li key={`${section.title ?? "top"}-${item.label}`}>
                    {item.implemented ? (
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-brand-soft font-medium text-brand"
                            : "text-ink-muted hover:bg-canvas hover:text-ink",
                        )}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span
                        aria-disabled="true"
                        title="Not implemented in this release"
                        className="block cursor-not-allowed rounded-md px-2 py-1.5 text-sm text-ink-subtle"
                      >
                        {item.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
