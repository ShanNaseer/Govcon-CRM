/**
 * Mapping probe for the HigherGov opportunity feed.
 *
 * Fetches one page and prints, side by side, what the provider returned and what the
 * normalizer made of it. This is how you check the field mapping against reality
 * rather than against their OpenAPI document — the two do drift.
 *
 * It writes NOTHING to the database. Use the inbox's "Sync now" button or
 * POST /api/integrations/highergov/sync to actually import.
 *
 * The `--conditions=react-server` flag in the npm script is required: the client
 * imports `server-only`, whose default export throws outside a server context.
 *
 * Usage:
 *   npm run highergov:probe                      # today, 3 records
 *   npm run highergov:probe -- 2026-08-27        # a specific capture date
 *   npm run highergov:probe -- 2026-08-27 10     # ...and 10 records
 */
import "dotenv/config";

import { normalizeHigherGovOpportunity } from "../src/integrations/opportunities/highergov/highergov.normalize";
import { fetchOpportunityPage, redactApiKey } from "../src/integrations/opportunities/highergov/highergov.client";
import { getHigherGovEnv, isHigherGovConfigured } from "../src/lib/env";

const [dateArg, sizeArg] = process.argv.slice(2);

const capturedDate = dateArg ?? new Date().toISOString().slice(0, 10);
const pageSize = Number(sizeArg ?? 3);

function heading(text: string): void {
  console.log(`\n${"=".repeat(72)}\n${text}\n${"=".repeat(72)}`);
}

/** Compacts a value for one-line display, so a 20k description does not fill the screen. */
function brief(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    const oneLine = value.replace(/\s+/g, " ").trim();
    return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    return json.length > 90 ? `${json.slice(0, 90)}…` : json;
  }
  return String(value);
}

async function main(): Promise<void> {
  if (!isHigherGovConfigured()) {
    console.error(
      "HIGHERGOV_API_KEY is not set.\n" +
        "Add it to .env (see .env.example) and run this again.",
    );
    process.exitCode = 1;
    return;
  }

  const env = getHigherGovEnv();

  console.log(`captured_date = ${capturedDate}`);
  console.log(`page_size     = ${pageSize}`);
  console.log(`base url      = ${env.HIGHERGOV_BASE_URL}`);
  // Length only — never the key itself, even in a developer tool.
  console.log(`api key       = set (${env.HIGHERGOV_API_KEY.length} chars)`);

  const page = await fetchOpportunityPage({ capturedDate, pageNumber: 1, pageSize });

  const results = page.results ?? [];
  const pagination = page.meta?.pagination ?? {};

  heading("ENVELOPE");
  console.log(`meta.pagination.count = ${pagination.count ?? "(absent)"}`);
  console.log(`meta.pagination.page  = ${pagination.page ?? "(absent)"}`);
  console.log(`meta.pagination.pages = ${pagination.pages ?? "(absent)"}`);
  console.log(`links.next            = ${page.links?.next ? redactApiKey(page.links.next) : "(none)"}`);
  console.log(`results.length        = ${results.length}`);

  if (results.length === 0) {
    console.log(
      "\nNo records for that capture date. This is normal — `captured_date` filters to an\n" +
        "exact day. Try an earlier date before concluding anything is broken.",
    );
    return;
  }

  /*
   * Field names actually present across the sample, so a field the spec documents but
   * the API has stopped sending shows up as missing rather than silently as null.
   */
  heading("FIELDS PRESENT IN THE SAMPLE");
  const seen = new Set<string>();
  for (const record of results) {
    for (const key of Object.keys(record)) seen.add(key);
  }
  console.log([...seen].sort().join(", "));

  for (const [index, raw] of results.entries()) {
    heading(`RECORD ${index + 1} — RAW`);
    for (const key of Object.keys(raw).sort()) {
      console.log(`  ${key.padEnd(24)} ${brief((raw as Record<string, unknown>)[key])}`);
    }

    heading(`RECORD ${index + 1} — NORMALIZED`);
    const normalized = normalizeHigherGovOpportunity(raw, env.HIGHERGOV_BASE_URL);

    if (normalized === null) {
      console.log("  SKIPPED — no opp_key or no title, so it cannot be deduplicated or shown.");
      continue;
    }

    for (const [key, value] of Object.entries(normalized)) {
      // rawData is the whole record again; already printed above.
      if (key === "rawData") {
        console.log(`  ${key.padEnd(24)} (the raw record, retained)`);
        continue;
      }
      console.log(`  ${key.padEnd(24)} ${brief(value)}`);
    }
  }

  heading("SUMMARY");
  const normalizedAll = results.map((raw) => normalizeHigherGovOpportunity(raw, env.HIGHERGOV_BASE_URL));
  const usable = normalizedAll.filter((record) => record !== null);
  console.log(`${usable.length} of ${results.length} records normalized successfully.`);
  console.log(
    `sources: ${[...new Set(usable.map((record) => record!.source))].join(", ") || "(none)"}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? redactApiKey(error.message) : error);
  process.exitCode = 1;
});
