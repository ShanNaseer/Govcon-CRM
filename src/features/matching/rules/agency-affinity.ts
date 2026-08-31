import type { MatchableClient, MatchableOpportunity, StageScore } from "@/features/matching/matching.types";

/**
 * Rewards solicitations from agencies the client already targets.
 *
 * Past performance with an agency is a real advantage in federal capture — the
 * incumbent relationship, the security paperwork and the contract vehicles are
 * already in place.
 *
 * Matched by containment in both directions and case-insensitively, because agency
 * names arrive in every possible form: a client may list "VA" against a solicitation
 * from "Department of Veterans Affairs", or "GSA" against "General Services
 * Administration". Short entries are required to match as whole words so "VA" does
 * not match "Nevada".
 */

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Whole-word containment, so a two-letter abbreviation cannot match inside a word. */
function containsAgency(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i").test(haystack);
}

export function scoreAgencyAffinity(
  client: MatchableClient,
  opportunity: MatchableOpportunity,
): StageScore {
  if (client.preferredAgencies.length === 0 || opportunity.agency === null) {
    // No opinion rather than zero — see the note in keyword-match.ts.
    return { score: -1, reasons: [], risks: [] };
  }

  const agency = normalize(opportunity.agency);

  const matched = client.preferredAgencies.find((preferred) => {
    const candidate = normalize(preferred);
    return containsAgency(agency, candidate) || containsAgency(candidate, agency);
  });

  if (matched === undefined) return { score: 0, reasons: [], risks: [] };

  return {
    score: 100,
    reasons: [`${opportunity.agency} is a target agency for this client`],
    risks: [],
  };
}
