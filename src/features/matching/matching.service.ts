import "server-only";

import type {
  MatchableClient,
  MatchableOpportunity,
  MatchResult,
  MatchingWeights,
} from "@/features/matching/matching.types";
import { DEFAULT_MATCHING_WEIGHTS } from "@/features/matching/matching.types";
import { applyHardFilters } from "@/features/matching/rules/hard-filters";
import { scoreAgencyAffinity } from "@/features/matching/rules/agency-affinity";
import { scoreCodeOverlap } from "@/features/matching/rules/naics-overlap";
import { scoreKeywords } from "@/features/matching/rules/keyword-match";
import { MatchRecommendation } from "@/generated/prisma/enums";

/**
 * Matching engine.
 *
 * Stages 1 and 2 are implemented; 3 and 4 are not:
 *   1. Hard filters       — rules/hard-filters.ts          IMPLEMENTED
 *   2. Rule-based scoring — rules/{naics-overlap,keyword-match,agency-affinity}.ts
 *                                                          IMPLEMENTED
 *   3. Semantic similarity — needs an embedding store (pgvector)   not implemented
 *   4. AI qualification    — needs an LLM provider                 not implemented
 *
 * The unimplemented stages return null rather than a placeholder, and `combineScores`
 * renormalizes across whatever ran. A rule-only result is therefore a real 0–100
 * figure, not a number diluted toward zero by two stages that never executed.
 */

/**
 * Relative weight of each rule within the rule stage.
 *
 * Industry classification dominates, and by a wide margin, because it is the
 * government's own statement of what the work is. Keywords and agency affinity
 * corroborate — a keyword hit on a solicitation in the wrong industry is a
 * coincidence, not a lead.
 *
 * CALIBRATED AGAINST THE REAL FEED, not chosen for tidiness. At 0.55/0.27/0.18 a
 * solicitation under a NAICS code the client is actually registered under scored 55
 * whenever it happened to use none of their keywords — below the review threshold,
 * so the single strongest signal available could not on its own produce a lead. That
 * is backwards. At 0.7 an exact code match reaches 70 unaided, which is what a
 * capture manager would expect to see at the top of the list, and the remaining 0.3
 * separates the good matches from each other.
 */
const RULE_WEIGHTS = {
  codes: 0.7,
  keywords: 0.2,
  agency: 0.1,
} as const;

/** A stage returning -1 means "no opinion" and is dropped from the average. */
const NO_OPINION = -1;

/** Combines the rule sub-scores, renormalizing over the ones that had an opinion. */
function combineRuleScores(
  parts: Array<{ score: number; weight: number }>,
): number | null {
  const scored = parts.filter((part) => part.score !== NO_OPINION);
  if (scored.length === 0) return null;

  const totalWeight = scored.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) return null;

  const weighted = scored.reduce((sum, part) => sum + part.score * part.weight, 0);
  return Math.round(weighted / totalWeight);
}

/**
 * Contract value and place of performance, reported as risks rather than scored.
 *
 * Neither is reliable enough to move a number. Agencies routinely omit or understate
 * estimated value, and place of performance is often blank or nominal for work that
 * is delivered remotely. They are worth SAYING, so a capture manager sees them on the
 * card — they are not worth pretending to quantify.
 */
function assessFit(client: MatchableClient, opportunity: MatchableOpportunity): string[] {
  const risks: string[] = [];

  const oppMax = opportunity.estimatedValueMax ?? opportunity.estimatedValueMin;
  const oppMin = opportunity.estimatedValueMin ?? opportunity.estimatedValueMax;

  if (oppMax !== null && client.minContractValue !== null && oppMax < client.minContractValue) {
    risks.push(
      `Estimated value is below the client's ${formatMoney(client.minContractValue)} minimum`,
    );
  }

  if (oppMin !== null && client.maxContractValue !== null && oppMin > client.maxContractValue) {
    risks.push(
      `Estimated value exceeds the client's ${formatMoney(client.maxContractValue)} ceiling`,
    );
  }

  if (oppMin === null && oppMax === null) {
    risks.push("No estimated value published");
  }

  if (
    client.geographicPreferences.length > 0 &&
    opportunity.placeState !== null &&
    !client.geographicPreferences.some(
      (preference) =>
        preference.trim().toLowerCase() === "nationwide" ||
        preference.trim().toLowerCase() === opportunity.placeState!.trim().toLowerCase(),
    )
  ) {
    risks.push(`Place of performance (${opportunity.placeState}) is outside the client's preferred areas`);
  }

  return risks;
}

function formatMoney(amount: number): string {
  return amount >= 1_000_000
    ? `$${(amount / 1_000_000).toFixed(1)}M`
    : `$${Math.round(amount).toLocaleString()}`;
}

/**
 * Score bands for the recommendation.
 *
 * PURSUE is set high deliberately. The point of this engine is to shorten a list of
 * hundreds to the handful worth a capture manager's afternoon; a generous threshold
 * would recreate the problem it exists to solve.
 */
export const PURSUE_THRESHOLD = 70;
export const REVIEW_THRESHOLD = 40;

function recommendationFor(overall: number | null): MatchRecommendation | null {
  if (overall === null) return null;
  if (overall >= PURSUE_THRESHOLD) return MatchRecommendation.PURSUE;
  if (overall >= REVIEW_THRESHOLD) return MatchRecommendation.REVIEW;
  return MatchRecommendation.PASS;
}

/**
 * Combines the per-stage scores into an overall figure.
 *
 * Only stages that produced a score contribute, and the weights are renormalized
 * across them — so a rule-only result is not diluted toward zero by the two
 * stages that have not run yet.
 */
export function combineScores(
  scores: { rule: number | null; semantic: number | null; ai: number | null },
  weights: MatchingWeights = DEFAULT_MATCHING_WEIGHTS,
): number | null {
  const contributions = [
    { value: scores.rule, weight: weights.rule },
    { value: scores.semantic, weight: weights.semantic },
    { value: scores.ai, weight: weights.ai },
  ].filter((entry): entry is { value: number; weight: number } => entry.value !== null);

  if (contributions.length === 0) return null;

  const totalWeight = contributions.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return null;

  const weighted = contributions.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  return Math.round((weighted / totalWeight) * 100) / 100;
}

/**
 * Runs the pipeline for one client/opportunity pair.
 *
 * Synchronous work behind an async signature: stages 3 and 4 will do I/O, and
 * changing the signature later would ripple through every caller.
 */
export async function runMatch(
  client: MatchableClient,
  opportunity: MatchableOpportunity,
): Promise<MatchResult> {
  const base = {
    clientId: client.id,
    opportunityId: opportunity.id,
    semanticScore: null,
    aiScore: null,
  };

  /*
   * A hard-filtered pair is recorded with score 0 and PASS rather than skipped. The
   * absence of a row is indistinguishable from "not yet matched", whereas a stored
   * rejection carries the reason — which is what lets someone ask why a solicitation
   * they expected never appeared.
   */
  const filtered = applyHardFilters(client, opportunity);

  if (!filtered.passed) {
    return {
      ...base,
      ruleScore: 0,
      overallScore: 0,
      recommendation: MatchRecommendation.PASS,
      matchReasons: [],
      risks: filtered.rejectionReasons,
    };
  }

  const codes = scoreCodeOverlap(client, opportunity);
  const keywords = scoreKeywords(client, opportunity);
  const agency = scoreAgencyAffinity(client, opportunity);

  const ruleScore = combineRuleScores([
    { score: codes.score, weight: RULE_WEIGHTS.codes },
    { score: keywords.score, weight: RULE_WEIGHTS.keywords },
    { score: agency.score, weight: RULE_WEIGHTS.agency },
  ]);

  const overallScore = combineScores({ rule: ruleScore, semantic: null, ai: null });

  return {
    ...base,
    ruleScore,
    overallScore,
    recommendation: recommendationFor(overallScore),
    matchReasons: [...codes.reasons, ...keywords.reasons, ...agency.reasons],
    risks: [...codes.risks, ...keywords.risks, ...agency.risks, ...assessFit(client, opportunity)],
  };
}
