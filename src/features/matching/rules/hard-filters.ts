import type {
  HardFilterResult,
  MatchableClient,
  MatchableOpportunity,
} from "@/features/matching/matching.types";
import { mentions, searchableText } from "@/features/matching/rules/text";

/**
 * Disqualifying checks, run before any scoring.
 *
 * A hard filter answers "could this client bid at all?", not "is this a good fit?".
 * Only two things earn that: a set-aside the client is not eligible for, and an
 * explicit negative keyword. Both mean the answer is no regardless of how well
 * everything else scores.
 *
 * DELIBERATELY NOT HARD FILTERS, despite the original plan naming them:
 *
 *   Contract value — an opportunity below the client's stated minimum is a weak fit,
 *                    not an impossibility, and agencies routinely under-state value.
 *                    Rejecting on it would empty the pipeline over an estimate.
 *   Geography      — place of performance is frequently blank or nominal, and remote
 *                    delivery is normal for IT work.
 *
 * Both are reported as risks by the scoring stage instead, so they surface on the
 * card without silently hiding the record.
 */

/**
 * Set-aside strings that mean "anyone may bid".
 *
 * The feed carries free text rather than codes, and every provider words this
 * differently. Anything not recognised here is treated as RESTRICTED — the safe
 * direction, since wrongly treating a restricted solicitation as open wastes a
 * capture manager's time on something they cannot win.
 */
const UNRESTRICTED_SET_ASIDES = [
  "",
  "none",
  "n/a",
  "na",
  "full and open",
  "full & open",
  "unrestricted",
  "open",
  "no set aside used",
  "no set-aside used",
];

/**
 * Canonical set-aside codes, mapped from the many ways the feed spells them.
 *
 * Matching on a normalized code rather than the raw string: a client holding
 * "SDVOSB" must match an opportunity reading "Service-Disabled Veteran-Owned Small
 * Business Set-Aside", and string equality never would.
 */
const SET_ASIDE_ALIASES: Array<{ code: string; patterns: RegExp[] }> = [
  { code: "8A", patterns: [/\b8\s*\(?a\)?\b/i] },
  { code: "HUBZONE", patterns: [/hubzone/i, /hub\s*zone/i] },
  { code: "SDVOSB", patterns: [/sdvosb/i, /service[- ]disabled/i] },
  { code: "VOSB", patterns: [/\bvosb\b/i, /veteran[- ]owned/i] },
  { code: "EDWOSB", patterns: [/edwosb/i, /economically disadvantaged women/i] },
  { code: "WOSB", patterns: [/\bwosb\b/i, /women[- ]owned/i] },
  { code: "SDB", patterns: [/\bsdb\b/i, /small disadvantaged/i] },
  { code: "SB", patterns: [/total small business/i, /small business set[- ]aside/i, /\bsba\b/i] },
];

/** Normalizes a free-text set-aside to a code, or null when it is unrestricted. */
export function normalizeSetAside(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (UNRESTRICTED_SET_ASIDES.includes(value.toLowerCase())) return null;

  for (const alias of SET_ASIDE_ALIASES) {
    if (alias.patterns.some((pattern) => pattern.test(value))) return alias.code;
  }

  // Unrecognised but non-empty: restricted, under a code derived from the text so the
  // rejection reason still names what it was.
  return value.toUpperCase();
}

/** The set-aside codes a client can claim. "NONE" means they hold no certifications. */
function clientSetAsideCodes(client: MatchableClient): Set<string> {
  const codes = new Set<string>();

  for (const raw of client.setAsideCodes) {
    const normalized = normalizeSetAside(raw);
    if (normalized !== null) codes.add(normalized);
  }

  return codes;
}

export function applyHardFilters(
  client: MatchableClient,
  opportunity: MatchableOpportunity,
): HardFilterResult {
  const rejectionReasons: string[] = [];

  const required = normalizeSetAside(opportunity.setAside);

  if (required !== null && !clientSetAsideCodes(client).has(required)) {
    rejectionReasons.push(
      `Reserved for ${required} and this client does not hold that set-aside`,
    );
  }

  const haystack = searchableText([opportunity.title, opportunity.description]);

  for (const keyword of client.negativeKeywords) {
    if (mentions(haystack, keyword)) {
      rejectionReasons.push(`Excluded by the negative keyword "${keyword}"`);
    }
  }

  return { passed: rejectionReasons.length === 0, rejectionReasons };
}
