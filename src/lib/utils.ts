/**
 * Shared, framework-agnostic helpers. Safe to import from both Server and
 * Client Components — must stay free of any server-only dependency.
 */

/** Joins conditional class names. Keeps `className` composition readable without a dependency. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** "Waterstone Digital" -> "WD". Used when a Client has no explicit initials. */
export function deriveInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Formats a decimal-string money value. Returns a dash for absent values. */
export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return currencyFormatter.format(numeric);
}

/**
 * Formats an amount in millions, as the dashboard design does: `$6872.4M`.
 *
 * Always millions with one decimal — never scaled up to billions — because the
 * design's KPI row compares four figures side by side, and a unit that changes
 * with magnitude makes them unreadable at a glance.
 */
export function formatMillions(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "$0.0M";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "$0.0M";
  return `$${(numeric / 1_000_000).toFixed(1)}M`;
}

/** Formats a min/max pair as a range, tolerating either bound being absent. */
export function formatCurrencyRange(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
): string {
  const hasMin = min !== null && min !== undefined && min !== "";
  const hasMax = max !== null && max !== undefined && max !== "";

  if (!hasMin && !hasMax) return "—";
  if (hasMin && !hasMax) return `${formatCurrency(min)}+`;
  if (!hasMin && hasMax) return `Up to ${formatCurrency(max)}`;
  return `${formatCurrency(min)} – ${formatCurrency(max)}`;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Formats an ISO timestamp in UTC. UTC keeps server and client renders identical. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

/**
 * Whole days from `now` until `value`. Negative when the date has passed.
 * `now` is injected so callers control the clock and server/client agree.
 */
export function daysUntil(value: string | Date | null | undefined, now: Date): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

/** Turns an enum member such as `PROPOSAL_IN_PROGRESS` into `Proposal In Progress`. */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Strips path separators and unusual characters from a user-supplied file name.
 * Never sufficient on its own for an S3 key — see `buildObjectKey` in the S3 service.
 */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : "file";
}
