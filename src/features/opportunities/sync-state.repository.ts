import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Reads and writes a provider's sync cursor.
 *
 * Separate from opportunity.repository.ts because it is about the sync process, not
 * about opportunities — nothing that renders a card ever touches this table.
 */

export type SyncState = {
  provider: string;
  /** Last capture date fully imported (YYYY-MM-DD), or null before the first run. */
  lastCapturedDate: string | null;
  lastRunAt: Date | null;
};

export async function findSyncState(provider: string): Promise<SyncState | null> {
  const row = await prisma.providerSyncState.findUnique({
    where: { provider },
    select: { provider: true, lastCapturedDate: true, lastRunAt: true },
  });

  return row;
}

/**
 * Records the outcome of a run.
 *
 * `lastCapturedDate` is only ever moved FORWARD, and only when the caller passes one.
 * A run that imported nothing new, or that stopped at its budget, records the
 * timestamp and the counts but leaves the cursor where it was — otherwise a truncated
 * run would step over records it never fetched, and they would never be seen again.
 */
export async function saveSyncState(
  provider: string,
  update: { lastCapturedDate?: string; lastRunAt: Date; summary: unknown },
): Promise<void> {
  const data = {
    ...(update.lastCapturedDate === undefined
      ? {}
      : { lastCapturedDate: update.lastCapturedDate }),
    lastRunAt: update.lastRunAt,
    lastRunSummary: (update.summary ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };

  await prisma.providerSyncState.upsert({
    where: { provider },
    create: { provider, ...data },
    update: data,
  });
}
