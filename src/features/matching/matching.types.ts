import type { MatchRecommendation } from "@/generated/prisma/enums";

/**
 * Contracts for the matching pipeline.
 *
 * NOTHING HERE IS IMPLEMENTED YET. These types exist so the schema, the API and
 * the UI already agree on the shape of a match result; the scoring stages land in
 * a later phase.
 *
 * Planned pipeline:
 *
 *   Opportunity
 *       ↓
 *   Hard Filters        — disqualify outright (set-aside, value range, geography)
 *       ↓
 *   Rule-Based Scoring  — NAICS/PSC overlap, keyword hits, agency preference
 *       ↓
 *   Semantic Similarity — embedding comparison against capability text
 *       ↓
 *   AI Qualification    — LLM review producing reasons and risks
 *       ↓
 *   OpportunityMatch
 */

/** Minimal client profile the matching stages read. Decoupled from Prisma rows. */
export type MatchableClient = {
  id: string;
  naicsCodes: string[];
  pscCodes: string[];
  setAsideCodes: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  preferredAgencies: string[];
  geographicPreferences: string[];
  capabilityDescription: string | null;
  minContractValue: number | null;
  maxContractValue: number | null;
};

/** Minimal opportunity projection the matching stages read. */
export type MatchableOpportunity = {
  id: string;
  title: string;
  description: string | null;
  agency: string | null;
  setAside: string | null;
  naicsCodes: string[];
  pscCodes: string[];
  placeState: string | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
};

/** Outcome of the hard-filter stage. A rejection carries its reasons for auditability. */
export type HardFilterResult = {
  passed: boolean;
  rejectionReasons: string[];
};

/** A single scoring stage's contribution, in the range 0–100. */
export type StageScore = {
  score: number;
  reasons: string[];
  risks: string[];
};

export type MatchResult = {
  clientId: string;
  opportunityId: string;
  ruleScore: number | null;
  semanticScore: number | null;
  aiScore: number | null;
  overallScore: number | null;
  recommendation: MatchRecommendation | null;
  matchReasons: string[];
  risks: string[];
};

/** Implemented by each scoring stage so the pipeline can compose them uniformly. */
export interface MatchingStage {
  readonly name: string;
  score(client: MatchableClient, opportunity: MatchableOpportunity): Promise<StageScore>;
}

/** Relative contribution of each stage to `overallScore`. Must sum to 1. */
export type MatchingWeights = {
  rule: number;
  semantic: number;
  ai: number;
};

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  rule: 0.5,
  semantic: 0.3,
  ai: 0.2,
};
