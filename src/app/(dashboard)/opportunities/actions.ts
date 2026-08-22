"use server";

import { revalidatePath } from "next/cache";

import { updateOpportunityStatus } from "@/features/opportunities/opportunity.service";
import { opportunityIdSchema } from "@/features/opportunities/opportunity.schemas";
import { OpportunityStatus } from "@/generated/prisma/enums";
import { describeError, logger } from "@/lib/logger";

/**
 * Triage actions for the opportunities inbox.
 *
 * Each maps one card button onto a workflow status transition. The underlying
 * service calls `requireSession()` before it writes, so these inherit the same
 * authorization as every other mutation — nothing here needs its own check, and
 * nothing here may skip one.
 */

export type TriageResult = { ok: true } | { ok: false; error: string };

const TRIAGE_TRANSITIONS = {
  /** "Assign to My Queue" — flags intent to pursue, ahead of a full qualification. */
  assign: OpportunityStatus.INTERESTED,
  /** "Mark Reviewed" — seen and triaged, no decision yet. */
  review: OpportunityStatus.REVIEWING,
  /** "Pass" — declined. */
  pass: OpportunityStatus.PASSED,
} as const;

export type TriageAction = keyof typeof TRIAGE_TRANSITIONS;

async function triage(action: TriageAction, rawId: string): Promise<TriageResult> {
  const parsed = opportunityIdSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, error: "That opportunity reference is not valid." };

  try {
    await updateOpportunityStatus(parsed.data, { status: TRIAGE_TRANSITIONS[action] });
  } catch (error) {
    logger.error("Triage action failed", { action, ...describeError(error) });
    return { ok: false, error: "Could not update that opportunity. Please try again." };
  }

  /*
   * The list, its summary cards and the dashboard's counts all read this status,
   * so revalidate both routes rather than only the one the click came from.
   */
  revalidatePath("/opportunities");
  revalidatePath("/");

  return { ok: true };
}

export async function assignToQueue(id: string): Promise<TriageResult> {
  return triage("assign", id);
}

export async function markReviewed(id: string): Promise<TriageResult> {
  return triage("review", id);
}

export async function passOpportunity(id: string): Promise<TriageResult> {
  return triage("pass", id);
}
