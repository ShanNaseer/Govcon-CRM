import type { CreateOpportunityInput } from "@/features/opportunities/opportunity.schemas";
import type { OpportunitySourceType } from "@/generated/prisma/enums";

/**
 * Contract every external opportunity source must implement.
 *
 * The critical rule: a provider's own response model must never escape its own
 * directory. A connector fetches raw records, normalizes them into
 * `NormalizedOpportunity`, and only that shape travels onward. This is what keeps
 * the domain, the database and the UI independent of any single government API.
 *
 *   External Source → Provider Connector → Normalizer → Universal Opportunity → PostgreSQL
 */

/** A provider's normalized output is exactly the universal create payload. */
export type NormalizedOpportunity = CreateOpportunityInput;

/** Window and paging parameters a connector supports. Providers ignore what they cannot honour. */
export type FetchOpportunitiesParams = {
  /** Only records posted at or after this instant — the incremental-sync cursor. */
  postedSince?: Date;
  naicsCodes?: string[];
  limit?: number;
  cursor?: string;
};

export type FetchOpportunitiesResult<TRaw = unknown> = {
  /** Provider-native records. Never persisted or rendered as-is. */
  raw: TRaw[];
  /** Cursor for the next page, or null when the result set is exhausted. */
  nextCursor: string | null;
};

export interface OpportunityProvider<TRaw = unknown> {
  readonly source: OpportunitySourceType;

  /** Retrieves provider-native records. */
  fetchOpportunities(params: FetchOpportunitiesParams): Promise<FetchOpportunitiesResult<TRaw>>;

  /**
   * Maps one native record onto the universal model. Returns null when a record
   * cannot be normalized (missing identifier or title) so a single malformed
   * entry cannot abort an entire sync.
   */
  normalize(raw: TRaw): NormalizedOpportunity | null;
}
