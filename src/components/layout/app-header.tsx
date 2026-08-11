import { Search } from "lucide-react";

import { Input, Select } from "@/components/ui/input";
import { OpportunityStatus } from "@/generated/prisma/enums";
import { humanizeEnum } from "@/lib/utils";

/**
 * Application header.
 *
 * Search and the two filters are non-functional placeholders in this scaffold —
 * they are marked `disabled` rather than being wired to a dead handler, so the
 * UI never implies behaviour that does not exist.
 */
export function AppHeader({ userEmail }: { userEmail: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <div className="w-full max-w-sm">
        <label htmlFor="global-search" className="sr-only">
          Search
        </label>
        <Input
          id="global-search"
          type="search"
          disabled
          placeholder="Search opportunities, clients…"
          icon={<Search className="h-4 w-4" aria-hidden />}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label htmlFor="stage-filter" className="sr-only">
          Stage
        </label>
        <Select id="stage-filter" disabled defaultValue="" className="hidden w-36 sm:block">
          <option value="">All stages</option>
          {Object.values(OpportunityStatus).map((status) => (
            <option key={status} value={status}>
              {humanizeEnum(status)}
            </option>
          ))}
        </Select>

        <label htmlFor="type-filter" className="sr-only">
          Type
        </label>
        <Select id="type-filter" disabled defaultValue="" className="hidden w-32 md:block">
          <option value="">All types</option>
          <option value="rfp">RFP</option>
          <option value="rfi">RFI</option>
          <option value="sources-sought">Sources Sought</option>
        </Select>

        <div className="flex items-center gap-2 border-l border-line pl-3">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
          >
            {userEmail.slice(0, 2).toUpperCase()}
          </span>
          <span className="hidden text-xs text-ink-muted lg:inline">{userEmail}</span>
        </div>
      </div>
    </header>
  );
}
