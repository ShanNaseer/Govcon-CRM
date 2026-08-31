import type { MatchableClient, MatchableOpportunity, StageScore } from "@/features/matching/matching.types";

/**
 * Scores the NAICS and PSC intersection.
 *
 * The strongest rule-based signal available: a solicitation's NAICS code is the
 * government's own statement of what industry the work belongs to.
 *
 * Graded rather than binary, because NAICS is hierarchical. 541511 (custom
 * programming) and 541512 (systems design) are different codes but the same line of
 * work, and a client registered under one is a genuine candidate for the other. The
 * shared prefix length is how close they are:
 *
 *   6 digits — the same industry              full credit
 *   4 digits — the same industry group        most of the credit
 *   3 digits — the same subsector             partial
 *   2 digits — the same sector, e.g. all of   ignored: "professional services" is
 *              "Professional Services"        too broad to mean anything
 */

/** Length of the shared leading digits of two codes. */
function sharedPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let shared = 0;
  while (shared < limit && a[shared] === b[shared]) shared += 1;
  return shared;
}

/** 0–100 for one opportunity code against the client's registered codes. */
function bestNaicsScore(opportunityCode: string, clientCodes: string[]): number {
  let best = 0;

  for (const clientCode of clientCodes) {
    const shared = sharedPrefixLength(opportunityCode, clientCode);

    const score =
      shared >= 6 ? 100 : shared >= 4 ? 75 : shared >= 3 ? 40 : 0;

    if (score > best) best = score;
  }

  return best;
}

/**
 * PSC is alphanumeric and its hierarchy is shallower: the first character is the
 * broad class (D = IT services), the first two are the family (D3 = IT and telecom).
 */
function bestPscScore(opportunityCode: string, clientCodes: string[]): number {
  let best = 0;

  for (const clientCode of clientCodes) {
    const a = opportunityCode.toUpperCase();
    const b = clientCode.toUpperCase();

    const score = a === b ? 100 : sharedPrefixLength(a, b) >= 2 ? 65 : a[0] === b[0] ? 35 : 0;

    if (score > best) best = score;
  }

  return best;
}

export function scoreCodeOverlap(
  client: MatchableClient,
  opportunity: MatchableOpportunity,
): StageScore {
  const reasons: string[] = [];
  const risks: string[] = [];

  const naicsScores = opportunity.naicsCodes.map((code) => ({
    code,
    score: bestNaicsScore(code, client.naicsCodes),
  }));
  const pscScores = opportunity.pscCodes.map((code) => ({
    code,
    score: bestPscScore(code, client.pscCodes),
  }));

  const bestNaics = naicsScores.reduce((best, entry) => Math.max(best, entry.score), 0);
  const bestPsc = pscScores.reduce((best, entry) => Math.max(best, entry.score), 0);

  for (const entry of naicsScores) {
    if (entry.score >= 100) reasons.push(`NAICS ${entry.code} is one the client is registered under`);
    else if (entry.score >= 75) reasons.push(`NAICS ${entry.code} is in the client's industry group`);
    else if (entry.score >= 40) reasons.push(`NAICS ${entry.code} is in a related subsector`);
  }

  for (const entry of pscScores) {
    if (entry.score >= 100) reasons.push(`PSC ${entry.code} matches the client's service codes`);
    else if (entry.score >= 65) reasons.push(`PSC ${entry.code} is in a family the client serves`);
  }

  if (opportunity.naicsCodes.length === 0 && opportunity.pscCodes.length === 0) {
    risks.push("The solicitation carries no NAICS or PSC code, so the industry fit is unverified");
  }

  /*
   * The better of the two signals, not their average. A solicitation usually carries
   * one classification properly and the other loosely or not at all; averaging would
   * punish a perfect NAICS match for having an unrelated PSC.
   */
  return { score: Math.max(bestNaics, bestPsc), reasons, risks };
}
