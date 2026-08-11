import "server-only";

import type {
  MatchableClient,
  MatchableOpportunity,
  MatchResult,
  MatchingWeights,
} from "@/features/matching/matching.types";
import { DEFAULT_MATCHING_WEIGHTS } from "@/features/matching/matching.types";

/**
 * Matching engine — NOT IMPLEMENTED.
 *
 * This module is the seam the pipeline will be built into. It deliberately
 * produces no scores: a fabricated number is worse than an absent one, because
 * the UI would present it as a real assessment. `runMatch` therefore returns
 * nulls, and the UI renders "Not scored" for them.
 *
 * Implementation order (see docs/architecture.md):
 *   1. Hard filters      — rules/hard-filters.ts
 *   2. Rule-based scoring — rules/rule-scoring.ts
 *   3. Semantic similarity — requires an embedding store (pgvector)
 *   4. AI qualification    — requires an LLM provider
 */

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
 * TODO(matching): implement the four stages. Until then this returns an unscored
 * result rather than a placeholder number.
 */
export async function runMatch(
  client: MatchableClient,
  opportunity: MatchableOpportunity,
): Promise<MatchResult> {
  return {
    clientId: client.id,
    opportunityId: opportunity.id,
    ruleScore: null,
    semanticScore: null,
    aiScore: null,
    overallScore: null,
    recommendation: null,
    matchReasons: [],
    risks: [],
  };
}
