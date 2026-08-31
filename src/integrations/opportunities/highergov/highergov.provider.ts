import "server-only";

import { OpportunitySourceType } from "@/generated/prisma/enums";
import { fetchOpportunityPage } from "@/integrations/opportunities/highergov/highergov.client";
import { normalizeHigherGovOpportunity } from "@/integrations/opportunities/highergov/highergov.normalize";
import type { HigherGovOpportunity } from "@/integrations/opportunities/highergov/highergov.types";
import type {
  FetchOpportunitiesResult,
  NormalizedOpportunity,
  OpportunityProvider,
} from "@/integrations/opportunities/provider.types";
import { getHigherGovEnv } from "@/lib/env";

/**
 * The HigherGov connector.
 *
 * HigherGov is an aggregator: one endpoint carries SAM.gov, DIBBS, SBIR, grants and
 * state/local solicitations, and each record names its own upstream system. So the
 * `source` a record ends up with is decided per record by the normalizer, not by the
 * connector.
 *
 * That is a genuine mismatch with `OpportunityProvider.source`, which assumes one
 * connector maps to one source. The interface field is set to OTHER — the registry
 * key, not a claim about the data — and the registry is bypassed by the sync service,
 * which imports this provider directly. Reconciling the interface properly means
 * letting a provider declare several sources; that is worth doing when a second
 * aggregator arrives, and not before.
 */

/** Paging cursor: this API pages by number, so the cursor is a page number. */
function nextCursor(page: HigherGovOpportunityPageMeta, current: number): string | null {
  const pages = page.pages;
  if (typeof pages !== "number") return null;
  return current < pages ? String(current + 1) : null;
}

type HigherGovOpportunityPageMeta = { page?: number | null; pages?: number | null; count?: number | null };

export type HigherGovFetchParams = {
  /** `captured_date`, as YYYY-MM-DD. */
  capturedDate: string;
  /** Page number; 1-based, as the API expects. Defaults to the first page. */
  page?: number;
  pageSize?: number;
  sourceTypes?: string[];
  /** Saved-search id from the HigherGov UI — see FetchPageParams.searchId. */
  searchId?: string;
  signal?: AbortSignal;
};

export type HigherGovFetchResult = FetchOpportunitiesResult<HigherGovOpportunity> & {
  /** Total matching records the provider reports, for progress reporting. */
  totalCount: number | null;
  totalPages: number | null;
};

/** Retrieves one page of provider-native records. */
export async function fetchHigherGovOpportunities(
  params: HigherGovFetchParams,
): Promise<HigherGovFetchResult> {
  const env = getHigherGovEnv();
  const page = params.page ?? 1;

  const body = await fetchOpportunityPage({
    capturedDate: params.capturedDate,
    pageNumber: page,
    pageSize: params.pageSize ?? env.HIGHERGOV_PAGE_SIZE,
    sourceTypes: params.sourceTypes,
    searchId: params.searchId ?? env.HIGHERGOV_SEARCH_ID,
    signal: params.signal,
  });

  const pagination: HigherGovOpportunityPageMeta = body.meta?.pagination ?? {};

  return {
    raw: body.results ?? [],
    /*
     * Derived from the page counter rather than read from `links.next`: that link
     * carries the API key, and threading a live credential through a cursor value
     * would put it somewhere it does not belong.
     */
    nextCursor: nextCursor(pagination, page),
    totalCount: pagination.count ?? null,
    totalPages: pagination.pages ?? null,
  };
}

export function normalize(raw: HigherGovOpportunity): NormalizedOpportunity | null {
  return normalizeHigherGovOpportunity(raw, getHigherGovEnv().HIGHERGOV_BASE_URL);
}

/**
 * Registry-shaped adapter.
 *
 * Present so `getProvider()` can find this connector; the sync service calls the
 * functions above directly because it needs the page metadata the generic interface
 * has no room for.
 */
export const higherGovProvider: OpportunityProvider<HigherGovOpportunity> = {
  source: OpportunitySourceType.OTHER,

  async fetchOpportunities(params) {
    // The generic interface offers `postedSince`; this API's cursor field is
    // `captured_date`, so that date is what a caller's window maps onto.
    const capturedDate = (params.postedSince ?? new Date()).toISOString().slice(0, 10);

    return fetchHigherGovOpportunities({
      capturedDate,
      page: params.cursor ? Number(params.cursor) : 1,
      pageSize: params.limit,
    });
  },

  normalize,
};
