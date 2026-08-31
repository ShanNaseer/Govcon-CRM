import "server-only";

import type { HigherGovOpportunityPage } from "@/integrations/opportunities/highergov/highergov.types";
import { AppError } from "@/lib/api/errors";
import { getHigherGovEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * HTTP access to the HigherGov external API.
 *
 * The only module that talks to highergov.com. It returns the provider's own page
 * shape and does no mapping — normalization is a separate concern with separate
 * tests, and mixing them would make a field-mapping change indistinguishable from a
 * transport change.
 *
 * AUTHENTICATION IS A QUERY PARAMETER, not a header — that is how the API is
 * specified. Two consequences are handled deliberately below: the key must never
 * reach a log line, and it must never reach an error message that could surface in
 * the UI.
 */

/** Documented per-request ceiling; a larger `page_size` is rejected upstream. */
export const MAX_PAGE_SIZE = 100;

/**
 * Per-request timeout.
 *
 * A full page of 100 records measures around 4–5 seconds, so 30 covers a slow
 * response with room to spare while still failing fast on a connection that has
 * stopped responding. Without this, `fetch` waits indefinitely and a sync appears
 * hung with no way to tell a stalled socket from a slow provider.
 */
const REQUEST_TIMEOUT_MS = 30_000;

export type FetchPageParams = {
  /**
   * `captured_date` — the date HigherGov ingested the record. The docs name this as
   * the "Update Check Field", so it is the right cursor for incremental polling: a
   * record amended today is re-captured today, whereas `posted_date` never moves.
   */
  capturedDate: string;
  pageNumber: number;
  pageSize: number;
  /** `source_type`, comma-separated. Omitted to take every upstream system. */
  sourceTypes?: string[];
  /**
   * `search_id` — a saved search created in the HigherGov UI.
   *
   * The single most useful parameter here. Unfiltered, this feed captures thousands
   * of solicitations a day; a saved search moves the NAICS, PSC, agency and value
   * filtering to the provider, so what arrives is a pipeline rather than a firehose.
   */
  searchId?: string;
  signal?: AbortSignal;
};

/**
 * Strips the API key from anything about to be logged or thrown.
 *
 * The key travels in the query string, so a bare `url` in a log line would persist a
 * live credential to disk. Replacing rather than deleting keeps the log readable —
 * it is still obvious that the parameter was present.
 */
export function redactApiKey(value: string): string {
  return value.replace(/([?&]api_key=)[^&]*/gi, "$1<redacted>");
}

function buildUrl(params: FetchPageParams): string {
  const env = getHigherGovEnv();
  const url = new URL("/api-external/opportunity/", env.HIGHERGOV_BASE_URL);

  url.searchParams.set("api_key", env.HIGHERGOV_API_KEY);
  url.searchParams.set("captured_date", params.capturedDate);
  url.searchParams.set("page_size", String(Math.min(params.pageSize, MAX_PAGE_SIZE)));
  url.searchParams.set("page_number", String(params.pageNumber));

  /*
   * A stable order matters for paging: without it the API is free to return the
   * same record on two different pages, or none at all. Ascending capture date is
   * the natural order for a single-day window.
   */
  url.searchParams.set("ordering", "captured_date");

  if (params.sourceTypes && params.sourceTypes.length > 0) {
    url.searchParams.set("source_type", params.sourceTypes.join(","));
  }

  if (params.searchId) url.searchParams.set("search_id", params.searchId);

  return url.toString();
}

/** Maps a provider HTTP status onto an AppError whose message is safe to show. */
function errorForStatus(status: number, safeUrl: string): AppError {
  if (status === 403) {
    return AppError.validation(
      "HigherGov rejected the API key. Check HIGHERGOV_API_KEY in the environment.",
    );
  }

  if (status === 404) {
    return AppError.notFound("HigherGov opportunity feed");
  }

  if (status === 429) {
    return AppError.validation(
      "HigherGov is rate limiting this account. Wait a moment and sync again.",
    );
  }

  logger.error("HigherGov request failed", { status, url: safeUrl });
  return AppError.validation(
    `HigherGov returned an unexpected status (${status}). The sync was stopped.`,
  );
}

/**
 * Fetches one page of opportunities.
 *
 * `cache: "no-store"` because this runs inside a sync, not a render: a cached page
 * would silently make an incremental poll a no-op.
 */
export async function fetchOpportunityPage(
  params: FetchPageParams,
): Promise<HigherGovOpportunityPage> {
  const url = buildUrl(params);
  const safeUrl = redactApiKey(url);

  logger.info("HigherGov fetch", {
    url: safeUrl,
    page: params.pageNumber,
    pageSize: params.pageSize,
  });

  let response: Response;

  /*
   * The caller's cancellation and our own deadline both have to be able to abort the
   * request, so they are combined rather than one replacing the other.
   */
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = params.signal ? AbortSignal.any([params.signal, timeout]) : timeout;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (timeout.aborted) {
      logger.error("HigherGov request timed out", { url: safeUrl, timeoutMs: REQUEST_TIMEOUT_MS });
      throw AppError.validation(
        `HigherGov did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. The sync was stopped.`,
      );
    }

    /*
     * A network failure carries the full URL in its message on some runtimes, so it
     * is never forwarded verbatim — that would leak the key into an error boundary.
     */
    logger.error("HigherGov request could not be sent", {
      url: safeUrl,
      reason: error instanceof Error ? redactApiKey(error.message) : "unknown",
    });
    throw AppError.validation("Could not reach HigherGov. Check network access and try again.");
  }

  if (!response.ok) throw errorForStatus(response.status, safeUrl);

  const body: unknown = await response.json();

  /*
   * A shallow guard, not a full schema parse. The field-level types are all optional
   * (see highergov.types.ts) and the normalizer rejects records it cannot use, so the
   * only thing worth failing hard on here is a body that is not an object at all —
   * which would mean the endpoint or the key is wrong, not that one record is odd.
   */
  if (body === null || typeof body !== "object") {
    throw AppError.validation("HigherGov returned a response that was not a JSON object.");
  }

  return body as HigherGovOpportunityPage;
}
