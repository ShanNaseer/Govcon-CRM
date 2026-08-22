"use client";

import { Menu, Search, X } from "lucide-react";

import { Input, Select } from "@/components/ui/input";
import { OpportunitySourceType, OpportunityStatus } from "@/generated/prisma/enums";
import { humanizeEnum } from "@/lib/utils";

/**
 * Application header, styled to the Figma design: a full-width global search with
 * two scoping filters on one row, collapsing to a compact search plus a second
 * filter row below `lg`.
 *
 * These controls are real. It is a plain GET form targeting the opportunities list,
 * which already reads `search`, `status` and `source` from the URL — so filter
 * state lives in the address bar, the header needs no client state of its own, and
 * it keeps working without JavaScript. The only scripted behaviour is submitting on
 * select change, so a filter does not need a separate confirming keystroke.
 *
 * One deviation: the design's second filter reads "All Types" (RFP / RFI / Sources
 * Sought). The Opportunity model has no such field — the nearest real dimension is
 * the ingesting provider — so this filters by source instead of inventing a column.
 */

function submitOwningForm(event: { currentTarget: HTMLSelectElement }): void {
  event.currentTarget.form?.requestSubmit();
}

function StageFilter({ id, className }: { id: string; className?: string }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Stage
      </label>
      <Select id={id} name="status" defaultValue="" className={className} onChange={submitOwningForm}>
        <option value="">All Stages</option>
        {Object.values(OpportunityStatus).map((status) => (
          <option key={status} value={status}>
            {humanizeEnum(status)}
          </option>
        ))}
      </Select>
    </>
  );
}

function SourceFilter({ id, className }: { id: string; className?: string }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Source
      </label>
      <Select id={id} name="source" defaultValue="" className={className} onChange={submitOwningForm}>
        <option value="">All Sources</option>
        {Object.values(OpportunitySourceType).map((source) => (
          <option key={source} value={source}>
            {humanizeEnum(source)}
          </option>
        ))}
      </Select>
    </>
  );
}

export function AppHeader({
  mobileMenuOpen,
  onToggleMobileMenu,
}: {
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-line bg-surface px-4 py-3 lg:px-6">
      {/*
       * One flex row that wraps, rather than a desktop set plus a hidden mobile set:
       * duplicate controls would submit each parameter twice. Below `lg` the search
       * fills the first line and the two filters wrap onto a second, which is the
       * design's small-screen layout.
       */}
      <form method="get" action="/opportunities" className="flex flex-wrap items-center gap-2 lg:gap-3">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-canvas lg:hidden"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" aria-hidden />
          ) : (
            <Menu className="h-5 w-5" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="global-search" className="sr-only">
            Search opportunities
          </label>
          <Input
            id="global-search"
            name="search"
            type="search"
            placeholder="Search opportunities, proposals, projects, contacts..."
            icon={<Search className="h-4 w-4" aria-hidden />}
          />
        </div>

        <StageFilter id="stage-filter" className="min-w-0 basis-[calc(50%-0.25rem)] lg:basis-40" />
        <SourceFilter id="source-filter" className="min-w-0 basis-[calc(50%-0.25rem)] lg:basis-40" />

        {/*
         * Keeps the form submittable by keyboard and without JavaScript; the design
         * has no visible submit control in the header.
         */}
        <button type="submit" className="sr-only">
          Search
        </button>
      </form>
    </header>
  );
}
