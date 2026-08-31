import "server-only";

/**
 * "What day is it" for deadline filtering.
 *
 * NOT AS SIMPLE AS `new Date()`. Response deadlines arrive from the feed as calendar
 * dates with no time — "due 2026-09-01" — and are stored at UTC midnight to represent
 * that date. Deciding whether such a date is "today" therefore needs a timezone, and
 * the server's UTC clock is the wrong one: at 19:40 UTC it is already tomorrow in
 * Karachi, so a UTC-based "today" would leave a solicitation the viewer considers
 * closed sitting at the top of their queue.
 *
 * The zone is configuration, not a guess per request. A single-tenant CRM has one
 * business calendar, and reading it from the environment keeps the answer identical
 * across a page render and the summary counts beside it.
 */

/**
 * IANA zone the business day is measured in.
 *
 * Defaults to the runtime's own zone, which is right for a development machine and
 * for a server deliberately configured to the business's locale. Deployments that run
 * in UTC should set this explicitly — most obviously to `America/New_York`, since
 * federal solicitation deadlines are stated in Eastern time.
 */
function businessTimeZone(): string {
  const configured = process.env.APP_TIMEZONE;
  if (configured !== undefined && configured !== "") return configured;

  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Today's calendar date in the business zone, as YYYY-MM-DD. */
export function businessToday(now: Date = new Date()): string {
  try {
    // `en-CA` formats as YYYY-MM-DD, which avoids assembling the parts by hand.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: businessTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // A mistyped APP_TIMEZONE must not take the page down; UTC is the safe fallback.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The earliest deadline still considered open — midnight UTC on the day AFTER the
 * business day.
 *
 * Compared against deadlines stored at UTC midnight, this excludes anything due today
 * or earlier. Today is excluded deliberately: a solicitation closing today cannot
 * realistically be worked, so leaving it in a triage queue is noise.
 */
export function startOfNextBusinessDayUtc(now: Date = new Date()): Date {
  const [year, month, day] = businessToday(now).split("-").map(Number);

  // Date.UTC normalizes a day past the month end, so no month-length special cases.
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
}
