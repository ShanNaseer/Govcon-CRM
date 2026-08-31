import type { MatchableClient, MatchableOpportunity, StageScore } from "@/features/matching/matching.types";
import { mentions, searchableText } from "@/features/matching/rules/text";

/**
 * Scores the client's positive keywords against the solicitation text.
 *
 * Negative keywords are NOT handled here — they disqualify outright, which is the
 * hard-filter stage's job. Splitting them keeps "this is a poor fit" and "this client
 * cannot take this work" from being expressed as the same number.
 *
 * Scored by how many distinct keywords appear, with sharply diminishing returns: the
 * difference between zero hits and one is meaningful, between five and six is noise.
 */

/** Hits beyond this add nothing. Chosen so a focused profile can still reach 100. */
const SATURATION = 3;

export function scoreKeywords(
  client: MatchableClient,
  opportunity: MatchableOpportunity,
): StageScore {
  const reasons: string[] = [];

  if (client.positiveKeywords.length === 0) {
    /*
     * No keywords configured is not a zero — it is an absence of evidence. Returning 0
     * would drag every overall score down for a client who simply has not filled this
     * in, so the stage reports no opinion and the pipeline drops it from the average.
     */
    return { score: -1, reasons, risks: [] };
  }

  const haystack = searchableText([
    opportunity.title,
    opportunity.description,
    opportunity.agency,
  ]);

  const hits = client.positiveKeywords.filter((keyword) => mentions(haystack, keyword));

  for (const hit of hits.slice(0, SATURATION)) {
    reasons.push(`Mentions "${hit}"`);
  }

  if (hits.length > SATURATION) {
    reasons.push(`…and ${hits.length - SATURATION} other tracked terms`);
  }

  const score = Math.round(Math.min(hits.length / SATURATION, 1) * 100);

  return { score, reasons, risks: [] };
}
