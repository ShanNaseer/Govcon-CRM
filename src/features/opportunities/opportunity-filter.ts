import type { CreateOpportunityInput } from "@/features/opportunities/opportunity.schemas";

/**
 * Which imported opportunities are worth keeping.
 *
 * Pure and free of server imports so the classification can be exercised directly —
 * this decides what never reaches the inbox, and a filter that is silently too tight
 * is indistinguishable from a broken feed.
 *
 * WHY THIS IS LOCAL RATHER THAN A QUERY PARAMETER. The HigherGov opportunity endpoint
 * accepts only agency_key, captured_date, opp_key, ordering, paging, posted_date,
 * search_id, source_id, source_type and version_key — there is no NAICS or PSC
 * parameter. NAICS filtering is reachable server-side only through `search_id`, a
 * saved search built in their UI. So this filter reduces what is STORED, not what is
 * FETCHED: it keeps the inbox relevant but does not make a sync faster. Narrowing the
 * fetch still needs HIGHERGOV_SEARCH_ID.
 */

export type IndustryFilter = {
  /** NAICS prefixes to keep. Empty means "do not filter on NAICS". */
  naicsPrefixes: string[];
  /** PSC prefixes to keep, upper-cased. Empty means "do not filter on PSC". */
  pscPrefixes: string[];
  /**
   * Whether to keep a record carrying no NAICS and no PSC at all.
   *
   * False by default. An unclassified record cannot be shown to match the filter, and
   * on this feed most of them are state/local notices with no codes — letting them
   * through would defeat the filter for the majority of the volume.
   */
  keepUnclassified: boolean;
};

/**
 * NAICS prefixes for an IT services company.
 *
 * Prefixes rather than exact codes because NAICS is hierarchical and the government
 * re-numbers it: software publishing was 511210 in the 2017 edition and 513210 in
 * 2022, and a feed aggregating several systems carries both. Matching on the
 * four-digit industry group survives that.
 *
 *   5415  Computer systems design and related services — the core of federal IT
 *         (541511 custom programming, 541512 systems design, 541513 facilities
 *         management, 541519 other, which is where most GovCon IT work sits)
 *   5182  Data processing, hosting and related services
 *   5112  Software publishers (2017 edition)
 *   5132  Software publishers (2022 edition)
 *   5162  Computing infrastructure providers / web search portals (2022)
 *   5192  Web search portals and other information services (2022)
 *   517   Telecommunications — wired, wireless and satellite. Included because
 *         federal IT contracts routinely bundle network services; drop it if that
 *         brings in more circuit-installation work than you want.
 *   3341    Computer and peripheral equipment manufacturing
 *   423430  Computer and software merchant wholesalers — the reseller side of IT
 *   6114    Computer and management training
 *
 * Two candidates were tried against a live page and REMOVED, because each let in work
 * that is plainly not IT:
 *
 *   8112  Electronic and precision equipment repair. The 2022 edition consolidated
 *         computer repair (811212) into the general 811210, which also covers
 *         laboratory and medical equipment — it matched a chemical and biological
 *         equipment maintenance contract. There is no longer a code that isolates
 *         computer repair, so this brings in more noise than work.
 */
export const IT_NAICS_PREFIXES = [
  "5415",
  "5182",
  "5112",
  "5132",
  "5162",
  "5192",
  "517",
  "3341",
  "423430",
  "6114",
] as const;

/**
 * PSC prefixes for IT.
 *
 *   D     IT and telecommunications SERVICES — the D3xx series, the single most
 *         important IT classification in federal contracting
 *   70    General-purpose information technology equipment
 *   7A-7J The newer IT product structure (7A software, 7B hardware, and so on)
 *
 * Note the absence of a bare "7": that would sweep in 71 (furniture), 72
 * (housekeeping), 73 (food preparation) and 74 (office machines), none of which are
 * IT. The two-character prefixes are deliberate.
 *
 * 5820 and 5895 (communication equipment) were tried and REMOVED: they matched a
 * portable-radio purchase. Land mobile radio is telecommunications in the federal
 * catalogue but is not what an IT services company bids on.
 */
export const IT_PSC_PREFIXES = [
  "D",
  "70",
  "7A",
  "7B",
  "7C",
  "7D",
  "7E",
  "7F",
  "7G",
  "7H",
  "7J",
] as const;

/** The default filter: an IT services company's slice of the feed. */
export const IT_FILTER: IndustryFilter = {
  naicsPrefixes: [...IT_NAICS_PREFIXES],
  pscPrefixes: [...IT_PSC_PREFIXES],
  keepUnclassified: false,
};

/** A filter that keeps everything — what an empty configuration means. */
export const NO_FILTER: IndustryFilter = {
  naicsPrefixes: [],
  pscPrefixes: [],
  keepUnclassified: true,
};

/** True when no criteria are set, so the filter would keep everything anyway. */
export function isFilterInactive(filter: IndustryFilter): boolean {
  return filter.naicsPrefixes.length === 0 && filter.pscPrefixes.length === 0;
}

function matchesAnyPrefix(code: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => code.startsWith(prefix));
}

/**
 * Whether an opportunity belongs to the configured industry.
 *
 * NAICS **or** PSC, not both: the two classify different things (what the contractor
 * does versus what is being bought) and a given solicitation often carries only one.
 * Requiring both would reject most of the feed.
 */
export function matchesIndustry(
  record: Pick<CreateOpportunityInput, "naicsCodes" | "pscCodes">,
  filter: IndustryFilter,
): boolean {
  if (isFilterInactive(filter)) return true;

  const naicsCodes = record.naicsCodes.map((entry) => entry.code);
  const pscCodes = record.pscCodes.map((entry) => entry.code.toUpperCase());

  if (naicsCodes.length === 0 && pscCodes.length === 0) return filter.keepUnclassified;

  if (naicsCodes.some((code) => matchesAnyPrefix(code, filter.naicsPrefixes))) return true;
  if (pscCodes.some((code) => matchesAnyPrefix(code, filter.pscPrefixes))) return true;

  return false;
}

/** Parses a comma-separated environment value into trimmed, upper-cased prefixes. */
export function parsePrefixes(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;

  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
}
