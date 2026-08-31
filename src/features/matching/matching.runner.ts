import "server-only";

import * as repository from "@/features/matching/matching.repository";
import { runMatch } from "@/features/matching/matching.service";
import { AppError } from "@/lib/api/errors";
import { requirePermission } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/**
 * Scores every open opportunity against every active client and stores the results.
 *
 * Separate from matching.service.ts, which holds the pure pipeline: this module is
 * the orchestration — permissions, batching, persistence, reporting — and keeping the
 * two apart is what lets the scoring rules be exercised without a database.
 */

export type MatchingRunResult = {
  clientsScored: number;
  opportunitiesConsidered: number;
  matchesStored: number;
  /** Scored at or above the PURSUE threshold. */
  pursue: number;
  /** Between the REVIEW and PURSUE thresholds. */
  review: number;
  /** Below REVIEW, including everything a hard filter rejected. */
  pass: number;
  /** True when the opportunity cap stopped the run short. */
  truncated: boolean;
  ms: number;
};

/**
 * Ceiling on opportunities per run.
 *
 * The scoring itself is pure and fast; the cost is reading the projections and
 * writing the results. Two thousand covers this workspace several times over while
 * bounding a run that would otherwise grow with the feed.
 */
const MAX_OPPORTUNITIES = 2_000;

/**
 * Runs the pipeline.
 *
 * Requires `opportunities:write`: matching rewrites what the whole team sees at the
 * top of the inbox, which is the same class of change as triaging.
 */
export async function runMatching(
  options: { openOnly?: boolean } = {},
  now: Date = new Date(),
): Promise<MatchingRunResult> {
  const session = await requirePermission("opportunities:write");
  const startedAt = Date.now();

  const openOnly = options.openOnly ?? true;

  const [clients, opportunities] = await Promise.all([
    repository.findMatchableClients(),
    repository.findMatchableOpportunities({ openOnly, now, take: MAX_OPPORTUNITIES + 1 }),
  ]);

  if (clients.length === 0) {
    throw AppError.validation(
      "There are no active clients to match against. Add a client profile first.",
    );
  }

  const truncated = opportunities.length > MAX_OPPORTUNITIES;
  const considered = truncated ? opportunities.slice(0, MAX_OPPORTUNITIES) : opportunities;

  let matchesStored = 0;
  let pursue = 0;
  let review = 0;
  let pass = 0;

  for (const client of clients) {
    const results = [];

    for (const opportunity of considered) {
      const result = await runMatch(client, opportunity);
      results.push(result);

      if (result.recommendation === "PURSUE") pursue += 1;
      else if (result.recommendation === "REVIEW") review += 1;
      else pass += 1;
    }

    matchesStored += await repository.replaceMatchesForClient(client.id, results);
  }

  const ms = Date.now() - startedAt;

  logger.info("Matching run finished", {
    clients: clients.length,
    opportunities: considered.length,
    matchesStored,
    pursue,
    review,
    pass,
    truncated,
    ms,
    triggeredBy: session.userId,
  });

  return {
    clientsScored: clients.length,
    opportunitiesConsidered: considered.length,
    matchesStored,
    pursue,
    review,
    pass,
    truncated,
    ms,
  };
}
