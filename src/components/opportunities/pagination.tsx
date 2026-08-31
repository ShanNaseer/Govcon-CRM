import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Page navigation for a list.
 *
 * Link-based, not a Client Component: paging is a change of address, so it belongs in
 * the URL. That keeps a given page linkable and shareable, keeps the list a Server
 * Component, and makes the browser's back button do the obvious thing.
 *
 * `skip`/`take` are carried in the query string because that is what
 * `listOpportunitiesQuerySchema` already parses — introducing a `page` parameter would
 * mean two representations of the same position.
 */

function buildHref(basePath: string, params: URLSearchParams, skip: number): string {
  const next = new URLSearchParams(params);

  // Page one is the bare URL: a `skip=0` in the address bar is noise.
  if (skip <= 0) next.delete("skip");
  else next.set("skip", String(skip));

  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Page numbers to show: the first, the last, and a window around the current one,
 * with gaps marked. A list of 439 records is nine pages, but a filtered view can be
 * far longer and rendering every number would wrap the row.
 */
function pageNumbers(current: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set<number>([1, totalPages, current]);
  if (current > 1) pages.add(current - 1);
  if (current < totalPages) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const withGaps: Array<number | "gap"> = [];

  for (const [index, page] of sorted.entries()) {
    if (index > 0 && page - sorted[index - 1] > 1) withGaps.push("gap");
    withGaps.push(page);
  }

  return withGaps;
}

const LINK_BASE =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 text-sm " +
  "transition-colors";

export function Pagination({
  basePath,
  searchParams,
  total,
  take,
  skip,
}: {
  basePath: string;
  /** The current query string, so filters and sort survive a page change. */
  searchParams: Record<string, string | string[] | undefined>;
  total: number;
  take: number;
  skip: number;
}) {
  const totalPages = Math.max(Math.ceil(total / take), 1);
  const current = Math.floor(skip / take) + 1;

  // Nothing to navigate.
  if (totalPages <= 1) return null;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "skip") continue;
    if (typeof value === "string" && value !== "") params.set(key, value);
  }

  const previousDisabled = current <= 1;
  const nextDisabled = current >= totalPages;

  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
      {previousDisabled ? (
        // A span, not a disabled link: there is no such thing, and an anchor with no
        // href is still focusable and still announced as a link.
        <span aria-disabled="true" className={cn(LINK_BASE, "border-line text-ink-subtle")}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </span>
      ) : (
        <Link
          href={buildHref(basePath, params, skip - take)}
          rel="prev"
          className={cn(LINK_BASE, "border-line-strong text-ink hover:bg-canvas")}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </Link>
      )}

      {pageNumbers(current, totalPages).map((page, index) =>
        page === "gap" ? (
          <span key={`gap-${index}`} aria-hidden className="px-1 text-sm text-ink-subtle">
            …
          </span>
        ) : page === current ? (
          <span
            key={page}
            aria-current="page"
            className={cn(LINK_BASE, "border-transparent bg-brand font-medium text-white")}
          >
            {page}
          </span>
        ) : (
          <Link
            key={page}
            href={buildHref(basePath, params, (page - 1) * take)}
            aria-label={`Page ${page}`}
            className={cn(LINK_BASE, "border-line text-ink-muted hover:bg-canvas hover:text-ink")}
          >
            {page}
          </Link>
        ),
      )}

      {nextDisabled ? (
        <span aria-disabled="true" className={cn(LINK_BASE, "border-line text-ink-subtle")}>
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      ) : (
        <Link
          href={buildHref(basePath, params, skip + take)}
          rel="next"
          className={cn(LINK_BASE, "border-line-strong text-ink hover:bg-canvas")}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </nav>
  );
}
