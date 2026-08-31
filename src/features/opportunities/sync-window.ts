/**
 * Which capture dates a sync run should cover.
 *
 * Pure date arithmetic, in its own module with no server imports, so it can be
 * exercised directly — the reasoning here is fiddly (month ends, leap days, a cursor
 * ahead of the clock) and it is the part of syncing that silently loses records when
 * it is wrong.
 *
 * Everything is UTC and date-only. The provider's `captured_date` parameter has no
 * time component, so introducing one locally would only create a timezone bug in a
 * value that does not have a timezone.
 */

/** The most days one run may cover, so a long gap cannot page for hours. */
export const MAX_DAYS_BACK = 30;

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** UTC date-only string, the format `captured_date` takes. */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Dates from `now` backwards, oldest first. Used for an explicit backfill. */
export function buildDateWindow(now: Date, daysBack: number): string[] {
  const days = Math.min(Math.max(daysBack, 1), MAX_DAYS_BACK);
  const dates: string[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dates.push(toDateKey(new Date(now.getTime() - offset * 86_400_000)));
  }

  return dates;
}

/**
 * The dates a catch-up run should cover, oldest first.
 *
 * Two rules, and the reasons matter:
 *
 * 1. START FROM THE CURSOR, NOT FROM TODAY. `captured_date` is an exact-day filter —
 *    verified against the live API, where an earlier date returns fewer records rather
 *    than more — so a day nobody synced is a permanent hole. Beginning at the last
 *    fully-imported date closes any gap left by a missed run, an outage or a weekend.
 *
 * 2. ALWAYS RE-COVER THE LAST FEW DAYS. Records are captured throughout the day, so a
 *    run at 10am cannot have seen what arrived at 3pm, and an amendment re-captures a
 *    record under a later date. The overlap catches both. It is nearly free to store
 *    (an unchanged record is skipped on `sourceVersion`) though it still costs a fetch
 *    per page.
 *
 * With no cursor at all — a fresh installation — the overlap alone is the window,
 * which is why its default is a useful first run rather than just today.
 */
export function buildCatchUpWindow(
  now: Date,
  lastCapturedDate: string | null,
  overlapDays: number,
): string[] {
  const today = toDateKey(now);

  const overlapStart = toDateKey(
    new Date(now.getTime() - Math.max(overlapDays - 1, 0) * 86_400_000),
  );

  /*
   * The cursor names a date that is FINISHED, so the gap resumes at the day after it —
   * starting on the cursor itself would re-fetch a day already known to be complete,
   * which the overlap will do anyway if it is recent enough to matter.
   */
  const resumeFrom =
    lastCapturedDate === null
      ? null
      : toDateKey(new Date(Date.parse(`${lastCapturedDate}T00:00:00.000Z`) + 86_400_000));

  /*
   * Whichever reaches further back wins: the resume point when a run was missed, the
   * overlap when everything is up to date. Plain string comparison is exact for ISO
   * date-only values, and avoids parsing just to compare.
   */
  let start = resumeFrom !== null && resumeFrom < overlapStart ? resumeFrom : overlapStart;

  // A clock skew or a hand-edited cursor could ask to start after today.
  if (start > today) start = today;

  const dates: string[] = [];

  /*
   * Stepped in UTC milliseconds rather than by incrementing a day number, so month
   * ends and leap days need no special cases.
   */
  for (
    let cursor = Date.parse(`${start}T00:00:00.000Z`);
    toDateKey(new Date(cursor)) <= today && dates.length < MAX_DAYS_BACK;
    cursor += 86_400_000
  ) {
    dates.push(toDateKey(new Date(cursor)));
  }

  return dates;
}

/**
 * How far the cursor may advance after a run.
 *
 * Only across a CONTIGUOUS run of fully-imported dates from the start of the window,
 * and never onto today. A date left half-imported by a budget must be revisited, and
 * stepping past it would lose its remaining records permanently; today is still
 * accumulating records, so "every page we could see" is not "every page there will be".
 *
 * Returns undefined when the cursor should not move — which is also what a run that
 * imported nothing should do.
 */
export function nextCursorDate(
  dates: string[],
  completed: ReadonlySet<string>,
  today: string,
  previous: string | null,
): string | undefined {
  let advanceTo: string | undefined;

  for (const date of dates) {
    if (!completed.has(date) || date >= today) break;
    advanceTo = date;
  }

  if (advanceTo === undefined) return undefined;

  // Never backwards: a narrow manual backfill must not undo real progress.
  return previous === null || advanceTo > previous ? advanceTo : undefined;
}
