"use server";

import { revalidatePath } from "next/cache";

import {
  assignOpportunityTo,
  claimOpportunity,
  releaseOpportunity,
  updateOpportunityStatus,
} from "@/features/opportunities/opportunity.service";
import { opportunityIdSchema } from "@/features/opportunities/opportunity.schemas";
import { syncHigherGovOpportunities } from "@/features/opportunities/opportunity.sync.service";
import { OpportunityStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/api/errors";
import { describeError, logger } from "@/lib/logger";

/**
 * Triage actions for the opportunities inbox and for My Queue.
 *
 * Each maps one card button onto a transition. The underlying service calls
 * `requirePermission("opportunities:write")` before it writes, so these inherit the
 * same authorization as every other mutation — nothing here needs its own check,
 * and nothing here may skip one.
 */

export type TriageResult = { ok: true } | { ok: false; error: string };

const TRIAGE_TRANSITIONS = {
  /** "Mark Reviewed" — seen and triaged, no decision yet. Stays in the inbox. */
  review: OpportunityStatus.REVIEWING,
  /** "Pass" — declined. */
  pass: OpportunityStatus.PASSED,
} as const;

export type TriageAction = keyof typeof TRIAGE_TRANSITIONS;

/**
 * Revalidates every route whose numbers depend on a triage.
 *
 * All four, not just the one the click came from: the inbox and its summary cards
 * read the unclaimed pool, My Queue reads the claimed one, and the dashboard's
 * pipeline panel reads status. A claim changes what all of them should show.
 */
function revalidateTriageRoutes(): void {
  revalidatePath("/opportunities");
  revalidatePath("/queue");
  revalidatePath("/");
}

/** Turns a thrown service error into a message the card can render. */
function toError(action: string, error: unknown, fallback: string): TriageResult {
  // AppError messages are written for users — a claim race says so by name.
  if (error instanceof AppError) return { ok: false, error: error.message };

  logger.error("Triage action failed", { action, ...describeError(error) });
  return { ok: false, error: fallback };
}

async function triage(action: TriageAction, rawId: string): Promise<TriageResult> {
  const parsed = opportunityIdSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, error: "That opportunity reference is not valid." };

  try {
    await updateOpportunityStatus(parsed.data, { status: TRIAGE_TRANSITIONS[action] });
  } catch (error) {
    return toError(action, error, "Could not update that opportunity. Please try again.");
  }

  revalidateTriageRoutes();
  return { ok: true };
}

/**
 * "Assign to My Queue" — moves the card out of the shared inbox and into the
 * caller's own queue. The service takes no user id, so this can only ever claim for
 * whoever clicked.
 */
export async function assignToQueue(id: string): Promise<TriageResult> {
  const parsed = opportunityIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "That opportunity reference is not valid." };

  try {
    await claimOpportunity(parsed.data);
  } catch (error) {
    return toError("assign", error, "Could not add that to your queue. Please try again.");
  }

  revalidateTriageRoutes();
  return { ok: true };
}

/**
 * Hands an opportunity to another team member's queue.
 *
 * Requires `opportunities:assign`, checked in the service. The assignee is
 * validated there against the same list the picker was built from, so a replayed
 * call cannot park work on a deactivated account or on someone whose role has no
 * opportunity access.
 */
export async function assignOwnerAction(
  id: string,
  assigneeId: string,
): Promise<TriageResult> {
  const parsedId = opportunityIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "That opportunity reference is not valid." };

  const parsedAssignee = opportunityIdSchema.safeParse(assigneeId);
  if (!parsedAssignee.success) return { ok: false, error: "That team member is not valid." };

  try {
    await assignOpportunityTo(parsedId.data, parsedAssignee.data);
  } catch (error) {
    return toError("assign-owner", error, "Could not reassign that opportunity. Please try again.");
  }

  revalidateTriageRoutes();
  return { ok: true };
}

/** "Return to Inbox" — the inverse, so a misclick on Assign is recoverable. */
export async function returnToInbox(id: string): Promise<TriageResult> {
  const parsed = opportunityIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "That opportunity reference is not valid." };

  try {
    await releaseOpportunity(parsed.data);
  } catch (error) {
    return toError("release", error, "Could not return that to the inbox. Please try again.");
  }

  revalidateTriageRoutes();
  return { ok: true };
}

/**
 * Pulls the latest opportunities from HigherGov.
 *
 * Returns the counts rather than a bare ok, because "the sync worked" and "the sync
 * imported nothing" look identical otherwise, and on a feed that publishes in
 * bursts the second is common and not an error.
 */
export type SyncActionResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

export async function syncOpportunitiesAction(): Promise<SyncActionResult> {
  try {
    /*
     * No window argument. The service works it out from the stored cursor, so a run
     * catches up on whatever was missed instead of asking whoever clicked to remember
     * how long it has been since the last one.
     */
    const result = await syncHigherGovOpportunities();

    /*
     * Worded from the reader's point of view, in the order they care about: what
     * arrived, then what was left behind.
     *
     * "Imported" means stored, NOT fetched. An earlier version said "Imported 300 of
     * 4,797" after storing 17 of them, because it reported the fetch count — which
     * made a correctly working industry filter look like a broken import.
     */
    const stored = result.created + result.updated;

    const window =
      result.dates.length === 1
        ? result.dates[0]
        : `${result.dates[0]} to ${result.dates[result.dates.length - 1]}`;

    if (result.fetched === 0) {
      revalidateTriageRoutes();
      return { ok: true, summary: `No opportunities were captured on ${window}.` };
    }

    const detail = [`${result.created} new`, `${result.updated} updated`];
    if (result.unchanged > 0) detail.push(`${result.unchanged} already current`);

    const headline =
      stored === 0 && result.unchanged === 0
        ? `Nothing matched your industry in the ${result.fetched} records captured ${window}.`
        : `Imported ${stored} opportunit${stored === 1 ? "y" : "ies"} (${detail.join(", ")}) ` +
          `from ${result.fetched} records captured ${window}.`;

    /*
     * The filter's work is stated as a fact about the feed, not buried in a list of
     * counts: on an IT-filtered feed most of what arrives is correctly discarded, and
     * a user who does not know that reads "283" as records the app lost.
     */
    const filtered =
      result.filtered > 0
        ? ` ${result.filtered} were outside your industry filter.`
        : "";

    const skipped = result.skipped > 0 ? ` ${result.skipped} could not be read.` : "";

    /*
     * Only mentioned when there is genuinely more to fetch. `reportedTotal` is the
     * provider's count for the whole window, so it says how much of the day remains
     * unexamined — which is the number that tells someone to narrow the feed rather
     * than to keep clicking.
     */
    const remaining =
      result.truncated && result.reportedTotal !== null
        ? ` Scanned ${result.fetched} of ${result.reportedTotal.toLocaleString()} records in this window — sync again to continue, or set HIGHERGOV_SEARCH_ID to a HigherGov saved search so only relevant records are fetched.`
        : result.truncated
          ? " Stopped at this run's limit — sync again to continue."
          : "";

    const summary = `${headline}${filtered}${skipped}${remaining}`;

    revalidateTriageRoutes();
    return { ok: true, summary };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };

    logger.error("Opportunity sync failed", describeError(error));
    return { ok: false, error: "The sync could not be completed. Please try again." };
  }
}

export async function markReviewed(id: string): Promise<TriageResult> {
  return triage("review", id);
}

export async function passOpportunity(id: string): Promise<TriageResult> {
  return triage("pass", id);
}
