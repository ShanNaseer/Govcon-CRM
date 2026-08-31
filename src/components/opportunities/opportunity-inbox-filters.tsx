"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Filter, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Filter bar for the opportunities inbox, transcribed from the design.
 *
 * Filter state stays in the URL, so the page below remains a Server Component and
 * a filtered view is shareable and back-button-safe. The dropdowns are custom
 * popovers rather than native selects because the design renders a "Label: Value"
 * trigger, which a `<select>` cannot express — each one is keyboard-dismissable and
 * carries the ARIA a listbox needs.
 *
 * Below `sm` the four dropdowns collapse behind a Filters button with an active
 * count, matching the design's mobile bar.
 */

export type FilterOption = { value: string; label: string };

export type InboxFilterState = {
  search: string;
  source: string;
  priority: string;
  review: string;
  deadline: string;
  fit: string;
  sort: string;
};

/** Params this bar owns. Anything else in the URL is preserved untouched. */
const OWNED_PARAMS = ["search", "source", "priority", "review", "deadline", "fit", "sort"] as const;

const PRIORITY_OPTIONS: FilterOption[] = [
  { value: "", label: "All Priorities" },
  { value: "high", label: "High Priority" },
  { value: "medium", label: "Medium Priority" },
  { value: "low", label: "Low Priority" },
];

const REVIEW_OPTIONS: FilterOption[] = [
  { value: "", label: "All Status" },
  { value: "unreviewed", label: "Unreviewed" },
  { value: "reviewed", label: "Reviewed" },
];

/**
 * Deadline window.
 *
 * "Open" is the default and carries no query parameter, so the plain URL shows the
 * actionable queue. The other three exist so nothing becomes unreachable — an expired
 * solicitation is still a record someone may need to look up, and 48 in this feed
 * carry no stated deadline at all.
 */
const DEADLINE_OPTIONS: FilterOption[] = [
  { value: "", label: "Open (due after today)" },
  { value: "expired", label: "Past deadline" },
  { value: "undated", label: "No deadline stated" },
  { value: "all", label: "Any deadline" },
];

/**
 * Fit-score band. The default carries no query parameter, so the plain URL is the
 * shortlist rather than the firehose.
 */
const FIT_OPTIONS: FilterOption[] = [
  { value: "", label: "Strong fit (70%+)" },
  { value: "review", label: "Worth reviewing (40%+)" },
  { value: "any", label: "Any fit, including unscored" },
];

const SORT_OPTIONS: FilterOption[] = [
  { value: "due-date", label: "Due Date" },
  { value: "newest", label: "Newest First" },
  { value: "priority", label: "By Priority" },
  { value: "fit-score", label: "Fit Score" },
];

function Dropdown({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((previous) => !previous)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap transition-colors",
          open ? "border-brand-light bg-brand-tint" : "border-line bg-field",
        )}
      >
        <span className="text-xs text-ink-muted">{label}:</span>
        <span className="font-medium text-ink">{selected.label}</span>
        <ChevronDown
          aria-hidden
          className={cn("h-3 w-3 text-ink-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute top-full left-0 z-50 mt-1 min-w-40 overflow-hidden rounded-xl border border-line-strong bg-surface py-1 shadow-xl"
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value || "all"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-canvas",
                  isSelected ? "bg-brand-tint text-brand" : "text-ink",
                )}
              >
                {isSelected ? (
                  <Check className="h-3 w-3 text-brand" aria-hidden />
                ) : (
                  <span className="w-3" />
                )}
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function OpportunityInboxFilters({
  state,
  sourceOptions,
}: {
  state: InboxFilterState;
  sourceOptions: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchDraft, setSearchDraft] = useState(state.search);
  const [mobileOpen, setMobileOpen] = useState(false);

  /*
   * The URL is the source of truth, so a back/forward navigation has to reset the
   * box. Adjusted during render rather than in an effect: React re-renders before
   * committing, so the input never paints a stale value, and there is no second
   * pass for the browser to show.
   */
  const [committedSearch, setCommittedSearch] = useState(state.search);
  if (state.search !== committedSearch) {
    setCommittedSearch(state.search);
    setSearchDraft(state.search);
  }

  function commit(changes: Partial<InboxFilterState>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    // Any filter change invalidates the current offset.
    params.delete("skip");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit({ search: searchDraft.trim() });
  }

  const activeCount = [state.source, state.priority, state.review, state.deadline, state.fit].filter(
    Boolean,
  ).length;
  const hasFilters = Boolean(state.search) || activeCount > 0 || state.sort !== "due-date";

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of OWNED_PARAMS) params.delete(key);
    params.delete("skip");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const searchField = (
    <form onSubmit={onSearchSubmit} className="relative flex-1">
      <label htmlFor="inbox-search" className="sr-only">
        Search opportunities
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
      />
      <input
        id="inbox-search"
        type="search"
        value={searchDraft}
        onChange={(event) => setSearchDraft(event.target.value)}
        placeholder="Search by title, agency, solicitation number…"
        className="h-9 w-full rounded-lg border border-line bg-field pr-9 pl-9 text-sm text-ink placeholder:text-ink-muted focus:bg-surface"
      />
      {searchDraft ? (
        <button
          type="button"
          onClick={() => {
            setSearchDraft("");
            commit({ search: "" });
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 hover:bg-black/5"
        >
          <X className="h-3 w-3 text-ink-muted" aria-hidden />
        </button>
      ) : null}
      {/* Submits on Enter without a visible control, as the design shows. */}
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {searchField}

        <div className="hidden items-center gap-2 sm:flex">
          <Dropdown
            label="Source"
            options={sourceOptions}
            value={state.source}
            onSelect={(value) => commit({ source: value })}
          />
          <Dropdown
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={state.priority}
            onSelect={(value) => commit({ priority: value })}
          />
          <Dropdown
            label="Status"
            options={REVIEW_OPTIONS}
            value={state.review}
            onSelect={(value) => commit({ review: value })}
          />
          <Dropdown
            label="Deadline"
            options={DEADLINE_OPTIONS}
            value={state.deadline}
            onSelect={(value) => commit({ deadline: value })}
          />
          <Dropdown
            label="Fit"
            options={FIT_OPTIONS}
            value={state.fit}
            onSelect={(value) => commit({ fit: value })}
          />
          <Dropdown
            label="Sort"
            options={SORT_OPTIONS}
            value={state.sort}
            onSelect={(value) => commit({ sort: value })}
          />
          {hasFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="h-9 rounded-lg border border-fit-poor/30 bg-[#fff5f5] px-3 text-sm whitespace-nowrap text-fit-poor"
            >
              Clear
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((previous) => !previous)}
          aria-expanded={mobileOpen}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 sm:hidden",
            mobileOpen || activeCount > 0 ? "border-brand-light bg-brand-tint" : "border-line bg-field",
          )}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          {activeCount > 0 ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
          <span className="text-sm font-medium">Filters</span>
          <ChevronDown
            aria-hidden
            className={cn("h-3 w-3 text-ink-muted transition-transform", mobileOpen && "rotate-180")}
          />
        </button>
      </div>

      {mobileOpen ? (
        <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-tile p-3 sm:hidden">
          <Dropdown
            label="Source"
            options={sourceOptions}
            value={state.source}
            onSelect={(value) => commit({ source: value })}
          />
          <Dropdown
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={state.priority}
            onSelect={(value) => commit({ priority: value })}
          />
          <Dropdown
            label="Status"
            options={REVIEW_OPTIONS}
            value={state.review}
            onSelect={(value) => commit({ review: value })}
          />
          <Dropdown
            label="Deadline"
            options={DEADLINE_OPTIONS}
            value={state.deadline}
            onSelect={(value) => commit({ deadline: value })}
          />
          <Dropdown
            label="Fit"
            options={FIT_OPTIONS}
            value={state.fit}
            onSelect={(value) => commit({ fit: value })}
          />
          <Dropdown
            label="Sort"
            options={SORT_OPTIONS}
            value={state.sort}
            onSelect={(value) => commit({ sort: value })}
          />
          {hasFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="h-9 rounded-lg border border-fit-poor/30 bg-[#fff5f5] px-3 text-sm text-fit-poor"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
