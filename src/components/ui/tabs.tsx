import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Link-based tabs. The active tab lives in the URL query string, which keeps the
 * detail pages Server Components and makes a given tab linkable.
 */

export type TabDefinition = {
  key: string;
  label: string;
  /** Future sections render a disabled tab rather than an empty panel. */
  enabled: boolean;
};

export function Tabs({
  tabs,
  activeKey,
  basePath,
}: {
  tabs: TabDefinition[];
  activeKey: string;
  basePath: string;
}) {
  return (
    <div className="border-b border-line">
      <nav aria-label="Sections" className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;

          if (!tab.enabled) {
            return (
              <span
                key={tab.key}
                aria-disabled="true"
                title="Not implemented in this release"
                className="cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-ink-subtle"
              >
                {tab.label}
              </span>
            );
          }

          return (
            <Link
              key={tab.key}
              href={`${basePath}?tab=${tab.key}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                isActive
                  ? "border-brand font-medium text-brand"
                  : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Resolves the requested tab, falling back to the first enabled one. */
export function resolveActiveTab(tabs: TabDefinition[], requested: string | undefined): string {
  const match = tabs.find((tab) => tab.key === requested && tab.enabled);
  return match?.key ?? tabs.find((tab) => tab.enabled)?.key ?? tabs[0].key;
}
