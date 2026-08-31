import "server-only";

import * as repository from "@/features/opportunities/opportunity.repository";
import * as syncStateRepository from "@/features/opportunities/sync-state.repository";
import { createOpportunitySchema } from "@/features/opportunities/opportunity.schemas";
import type { CreateOpportunityInput } from "@/features/opportunities/opportunity.schemas";
import {
  fetchHigherGovOpportunities,
  normalize,
} from "@/integrations/opportunities/highergov/highergov.provider";
import { AppError } from "@/lib/api/errors";
import { requirePermission } from "@/lib/auth/session";
import {
  isFilterInactive,
  matchesIndustry,
  type IndustryFilter,
} from "@/features/opportunities/opportunity-filter";
import { getHigherGovEnv, getOpportunityFilter, isHigherGovConfigured } from "@/lib/env";
import {
  buildCatchUpWindow,
  buildDateWindow,
  DATE_ONLY,
  MAX_DAYS_BACK,
  nextCursorDate,
  toDateKey,
} from "@/features/opportunities/sync-window";
import { logger } from "@/lib/logger";

/**
 * Pulls government opportunities from HigherGov into the local database.
 *
 * The pipeline the integration layer describes, with this module as the middle:
 *
 *   HigherGov API → client → normalizer → THIS → upsert → PostgreSQL → inbox
 *
 * Two properties are load-bearing:
 *
 *   IDEMPOTENT.  Re-running for the same date changes nothing except fields the
 *                agency amended. Dedup is on `[source, externalId]` where
 *                externalId is HigherGov's stable `opp_key`.
 *   PARTIAL-SAFE. One malformed record is counted and skipped, never fatal. A sync
 *                over 100 solicitations must not be lost because one has a
 *                nonsensical NAICS code.
 */

export type SyncCounts = {
  /** Provider records received across all pages. */
  fetched: number;
  created: number;
  updated: number;
  /** Already stored at the same provider version, so not rewritten. */
  unchanged: number;
  /** Received but unusable — no `opp_key`, no title, or a failed schema parse. */
  skipped: number;
  /** Usable, but outside the configured industry, so deliberately not stored. */
  filtered: number;
  /** Pages actually requested. */
  pages: number;
  /** Total the provider says match the window, which may exceed what was imported. */
  reportedTotal: number | null;
  /** Set when a budget stopped the run before the window was exhausted. */
  truncated: boolean;
  /** Which budget stopped it, for a message that says what to do next. */
  stoppedBy: "pages" | "records" | null;
};

export type SyncResult = SyncCounts & {
  /** Dates covered, oldest first. */
  dates: string[];
  /** The cursor after this run — the last capture date fully imported. */
  lastCapturedDate: string | null;
  startedAt: string;
  finishedAt: string;
};

export type SyncOptions = {
  /**
   * Override the catch-up window with a fixed number of days back from today.
   *
   * Normally left unset: the window is worked out from the stored cursor, which is the
   * whole point of having one. This exists for a deliberate backfill.
   */
  daysBack?: number;
  /** Explicit dates (YYYY-MM-DD), overriding everything else. Targeted backfill. */
  dates?: string[];
  /** Restrict to particular upstream systems, e.g. ["sam"]. Omit for all. */
  sourceTypes?: string[];
  /** Saved-search id, overriding HIGHERGOV_SEARCH_ID for this run. */
  searchId?: string;
  pageSize?: number;
  /** Pages for the whole run, not per date. */
  maxPages?: number;
  /** Records for the whole run. */
  maxRecords?: number;
  /** Override the configured industry filter. Mainly for a one-off wider backfill. */
  filter?: IndustryFilter;
};

/** Identifies this connector's row in `ProviderSyncState`. */
const PROVIDER = "highergov";

/** When the feed last ran, for the inbox header and the settings page. */
export async function getSyncStatus(): Promise<{
  lastRunAt: string | null;
  lastCapturedDate: string | null;
}> {
  await requirePermission("opportunities:read");

  const state = await syncStateRepository.findSyncState(PROVIDER);

  return {
    lastRunAt: state?.lastRunAt?.toISOString() ?? null,
    lastCapturedDate: state?.lastCapturedDate ?? null,
  };
}

/**
 * Runs a sync.
 *
 * Requires `opportunities:write`: importing changes what the whole team sees, so it
 * answers to the same grant as triaging. Read access is not enough.
 */
export async function syncHigherGovOpportunities(
  options: SyncOptions = {},
  now: Date = new Date(),
): Promise<SyncResult> {
  const session = await requirePermission("opportunities:write");

  if (!isHigherGovConfigured()) {
    throw AppError.validation(
      "No opportunity feed is configured. Set HIGHERGOV_API_KEY in the environment to enable syncing.",
    );
  }

  const env = getHigherGovEnv();
  const startedAt = new Date();

  /*
   * The window comes from the stored cursor unless a caller deliberately overrides it.
   * A run therefore catches up on whatever was missed rather than asking the person
   * clicking to work out how long it has been.
   */
  const state = await syncStateRepository.findSyncState(PROVIDER);

  const dates = options.dates
    ? options.dates.filter((date) => DATE_ONLY.test(date)).slice(0, MAX_DAYS_BACK)
    : options.daysBack !== undefined
      ? buildDateWindow(now, options.daysBack)
      : buildCatchUpWindow(now, state?.lastCapturedDate ?? null, env.HIGHERGOV_OVERLAP_DAYS);

  if (dates.length === 0) {
    throw AppError.validation("No valid dates to sync. Dates must be formatted YYYY-MM-DD.");
  }

  /*
   * BOTH BUDGETS COVER THE WHOLE RUN, not one date.
   *
   * The unfiltered feed captures thousands of records a day — a single day is around
   * 68 pages at 4 seconds each. A per-date ceiling multiplied by the window into
   * minutes of sequential work inside one request, which is what made the first
   * version of this appear to hang. A run now does a bounded amount of work and says
   * so; syncing again continues.
   */
  const maxPages = options.maxPages ?? env.HIGHERGOV_MAX_PAGES;
  const maxRecords = options.maxRecords ?? env.HIGHERGOV_MAX_RECORDS;
  const pageSize = options.pageSize ?? env.HIGHERGOV_PAGE_SIZE;
  const searchId = options.searchId ?? env.HIGHERGOV_SEARCH_ID;

  /*
   * Applied after fetching, because the provider exposes no NAICS or PSC parameter.
   * It keeps the inbox relevant; it does not make the sync faster. See the note in
   * opportunity-filter.ts.
   */
  const industryFilter = options.filter ?? getOpportunityFilter();

  const counts: SyncCounts = {
    fetched: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    filtered: 0,
    pages: 0,
    reportedTotal: null,
    truncated: false,
    stoppedBy: null,
  };

  /** Stops the outer date loop as soon as either budget is spent. */
  function budgetSpent(): "pages" | "records" | null {
    if (counts.pages >= maxPages) return "pages";
    if (counts.fetched >= maxRecords) return "records";
    return null;
  }

  /*
   * Dates finished with every page stored. The cursor may only advance across a
   * CONTIGUOUS run of these from the start of the window — a date left half-imported
   * must be revisited, and skipping past it would lose its remaining records forever.
   */
  const completed = new Set<string>();

  for (const capturedDate of dates) {
    const spentBefore = budgetSpent();
    if (spentBefore !== null) {
      counts.truncated = true;
      counts.stoppedBy = spentBefore;
      break;
    }

    let page = 1;

    /*
     * Paged sequentially, not concurrently. The provider rate limits, and a 429 part
     * way through a parallel fan-out leaves an unknown subset imported — which is
     * worse than a slower run that either completes or reports where it stopped.
     */
    for (;;) {
      const result = await fetchHigherGovOpportunities({
        capturedDate,
        page,
        pageSize,
        sourceTypes: options.sourceTypes,
        searchId,
      });

      counts.pages += 1;
      counts.fetched += result.raw.length;

      /*
       * The provider's total is per date, so it is summed across the window rather
       * than overwritten — it reports how much the window holds, which is the number
       * that tells you whether a filter is needed.
       */
      if (result.totalCount !== null) {
        counts.reportedTotal = (counts.reportedTotal ?? 0) + result.totalCount;
      }

      /*
       * Stored a page at a time, not a record at a time: the batch upsert turns a
       * page into a handful of statements instead of one round trip per record. See
       * `upsertProviderOpportunities`.
       */
      const { records, skipped, filtered } = normalizePage(result.raw, industryFilter);
      counts.skipped += skipped;
      counts.filtered += filtered;

      const stored = await repository.upsertProviderOpportunities(records);
      counts.created += stored.created;
      counts.updated += stored.updated;
      counts.unchanged += stored.unchanged;
      counts.skipped += stored.failed;

      if (result.nextCursor === null) {
        // Every page for this date is stored, so it is safe to advance over.
        completed.add(capturedDate);
        break;
      }

      const spent = budgetSpent();
      if (spent !== null) {
        counts.truncated = true;
        counts.stoppedBy = spent;
        logger.warn("HigherGov sync stopped at a budget", {
          capturedDate,
          stoppedBy: spent,
          pages: counts.pages,
          maxPages,
          fetched: counts.fetched,
          maxRecords,
        });
        break;
      }

      page = Number(result.nextCursor);
    }
  }

  const finishedAt = new Date();

  const previous = state?.lastCapturedDate ?? null;
  const lastCapturedDate = nextCursorDate(dates, completed, toDateKey(now), previous);

  const result: SyncResult = {
    ...counts,
    dates,
    lastCapturedDate: lastCapturedDate ?? previous,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };

  /*
   * Recorded even when nothing was imported, and even on a truncated run: the
   * timestamp is how the settings page reports that syncing is alive, and it is
   * separate from the cursor precisely so a fruitless run cannot advance it.
   */
  await syncStateRepository.saveSyncState(PROVIDER, {
    lastCapturedDate,
    lastRunAt: finishedAt,
    summary: counts,
  });

  logger.info("HigherGov sync finished", {
    ...counts,
    dates,
    industryFilter: isFilterInactive(industryFilter) ? "none" : industryFilter.naicsPrefixes.join(","),
    cursorWas: previous,
    cursorNow: lastCapturedDate ?? previous,
    ms: finishedAt.getTime() - startedAt.getTime(),
    triggeredBy: session.userId,
  });

  return result;
}

/**
 * Normalizes a page, separating what can be stored from what cannot.
 *
 * Nothing here throws: an unusable record is counted and logged, which is what makes
 * the sync partial-safe. A run over a hundred solicitations must not be lost to one
 * malformed entry.
 */
function normalizePage(
  raw: unknown[],
  filter: IndustryFilter,
): { records: CreateOpportunityInput[]; skipped: number; filtered: number } {
  const records: CreateOpportunityInput[] = [];
  let skipped = 0;
  let filtered = 0;

  for (const entry of raw) {
    const normalized = normalize(entry as never);

    if (normalized === null) {
      logger.warn("HigherGov record skipped: missing opp_key or title");
      skipped += 1;
      continue;
    }

    /*
     * Re-validated through the universal schema even though the normalizer built it.
     * The schema is the contract for what may enter the database, and a connector is
     * exactly the kind of code that drifts from it — this is the cheap check that
     * catches an overlong field or a bad code before Postgres does.
     */
    const parsed = createOpportunitySchema.safeParse(normalized);

    if (!parsed.success) {
      logger.warn("HigherGov record skipped: failed universal validation", {
        externalId: normalized.externalId,
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      });
      skipped += 1;
      continue;
    }

    /*
     * Counted separately from `skipped`: an out-of-industry record is not a problem
     * to investigate, it is the filter doing its job. Conflating the two would make a
     * working sync look like a failing one.
     */
    if (!matchesIndustry(parsed.data, filter)) {
      filtered += 1;
      continue;
    }

    records.push(parsed.data);
  }

  return { records, skipped, filtered };
}
