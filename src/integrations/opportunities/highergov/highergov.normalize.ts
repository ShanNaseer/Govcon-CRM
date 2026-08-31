import { OpportunitySourceType, OpportunityStatus } from "@/generated/prisma/enums";
import type { HigherGovOpportunity } from "@/integrations/opportunities/highergov/highergov.types";
import type { NormalizedOpportunity } from "@/integrations/opportunities/provider.types";

/**
 * Maps a HigherGov record onto the universal Opportunity model.
 *
 * Pure and synchronous — no I/O, no database, no clock — so the mapping can be
 * exercised against a captured payload without a network or a schema.
 *
 * The guiding rule is that a single bad record must never abort a sync: anything
 * unusable returns null and the caller counts it as skipped. Only two fields are
 * genuinely required (an identifier and a title); everything else degrades to null,
 * because a solicitation with no stated deadline is still worth showing.
 */

/** Deliberately not localised: the API returns date-only strings. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * HigherGov's `source_type` onto our source enum.
 *
 * The enum names the government system that published the solicitation, not the
 * aggregator — so the inbox's Source filter reads "SAM.gov", not "HigherGov". See
 * the comment on `OpportunitySourceType` in the schema.
 *
 * "grant" is singular upstream and plural here, which is the kind of mismatch worth
 * a table rather than a clever transform.
 */
const SOURCE_TYPES: Record<string, OpportunitySourceType> = {
  sam: OpportunitySourceType.SAM_GOV,
  dibbs: OpportunitySourceType.DIBBS,
  sbir: OpportunitySourceType.SBIR,
  grant: OpportunitySourceType.GRANTS,
  sled: OpportunitySourceType.STATE_PORTAL,
};

/** An unrecognised source type lands in OTHER rather than dropping the record. */
export function mapSourceType(sourceType: string | null | undefined): OpportunitySourceType {
  if (!sourceType) return OpportunitySourceType.OTHER;
  return SOURCE_TYPES[sourceType.trim().toLowerCase()] ?? OpportunitySourceType.OTHER;
}

/** Trims, and treats blank or whitespace-only strings as absent. */
function text(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Trims to a maximum length, so an overlong upstream value cannot fail validation. */
function clamped(value: string | null | undefined, max: number): string | undefined {
  const trimmed = text(value);
  if (trimmed === undefined) return undefined;
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/**
 * Date-only string to a Date at UTC midnight.
 *
 * Parsed explicitly rather than with `new Date(value)`: that constructor reads a
 * bare "YYYY-MM-DD" as UTC but "YYYY-MM-DDTHH:mm" as local, and a deadline that
 * shifts by a day depending on the server's timezone is a real bug in a system
 * whose whole job is deadlines.
 */
export function parseProviderDate(value: string | null | undefined): Date | null {
  const raw = text(value);
  if (raw === undefined || !DATE_ONLY.test(raw)) return null;

  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Decimal string to a non-negative amount, or null.
 *
 * Negative and non-finite values are dropped rather than clamped: a negative
 * contract value is bad data, and recording it as zero would assert something the
 * provider never said.
 */
export function parseMoney(value: string | null | undefined): string | null {
  const raw = text(value);
  if (raw === undefined) return null;

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return amount.toFixed(2);
}

/**
 * NAICS must be 2–6 digits to satisfy the universal schema.
 *
 * A code that fails the pattern is dropped, not coerced — attaching a wrong NAICS
 * to a record would corrupt the matching engine's input, and no code at all is the
 * honest state.
 */
function naicsCodes(raw: HigherGovOpportunity): NormalizedOpportunity["naicsCodes"] {
  const code = text(raw.naics_code?.naics_code);
  if (code === undefined || !/^\d{2,6}$/.test(code)) return [];

  // The endpoint returns a single NAICS, so it is the primary one by construction.
  return [{ code, isPrimary: true }];
}

/** PSC must be 2–6 alphanumeric characters; same drop-rather-than-coerce rule. */
function pscCodes(raw: HigherGovOpportunity): NormalizedOpportunity["pscCodes"] {
  const code = text(raw.psc_code?.psc_code);
  if (code === undefined || !/^[A-Za-z0-9]{2,6}$/.test(code)) return [];

  return [{ code: code.toUpperCase() }];
}

/**
 * Absolute URL for the posting.
 *
 * `path` and `source_path` are relative, and the universal schema requires a real
 * URL, so a relative value is resolved against the provider host. Anything that
 * still will not parse is omitted rather than stored broken.
 */
function resolveUrl(path: string | null | undefined, baseUrl: string): string | undefined {
  const raw = text(path);
  if (raw === undefined) return undefined;

  try {
    const resolved = new URL(raw, baseUrl).toString();
    return resolved.length <= 1000 ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The description shown in the app.
 *
 * Full agency text when there is any, falling back to HigherGov's `ai_summary`.
 * The fallback is marked, because a generated summary and an agency's own words are
 * not the same thing and a user reading a requirement needs to know which they have.
 */
function description(raw: HigherGovOpportunity): string | undefined {
  const full = text(raw.description_text);
  if (full !== undefined) return clamped(full, 20_000);

  const summary = text(raw.ai_summary);
  if (summary === undefined) return undefined;

  return clamped(`[HigherGov AI summary — the agency's full text was not provided]\n\n${summary}`, 20_000);
}

export function normalizeHigherGovOpportunity(
  raw: HigherGovOpportunity,
  baseUrl: string,
): NormalizedOpportunity | null {
  /*
   * `opp_key` is the dedup key: unique across HigherGov's corpus and stable across
   * amendments, unlike `version_key` (new on every amendment) and `source_id` (only
   * unique within one upstream system). Without it a record cannot be deduplicated,
   * so it cannot be stored.
   */
  const externalId = clamped(raw.opp_key, 200);
  const title = clamped(raw.title, 500);

  if (externalId === undefined || title === undefined) return null;

  return {
    source: mapSourceType(raw.source_type),
    externalId,
    // `source_path` first: a link to the agency's own posting beats a link to the
    // aggregator when both exist.
    sourceUrl: resolveUrl(raw.source_path, baseUrl) ?? resolveUrl(raw.path, baseUrl),

    title,
    description: description(raw),
    solicitationNumber: clamped(raw.source_id, 120),

    agency: clamped(raw.agency?.agency_name, 250),
    // The endpoint exposes one agency level, so sub-agency and office stay unset
    // rather than being guessed at from the abbreviation.
    subAgency: undefined,
    office: undefined,

    postedDate: parseProviderDate(raw.posted_date),
    responseDeadline: parseProviderDate(raw.due_date),

    setAside: clamped(raw.set_aside, 120),
    // `opp_type.description` is the contract vehicle type ("Solicitation", "Award
    // Notice", …); `vehicle` names a specific IDIQ and is not the same field.
    contractType: clamped(raw.opp_type?.description, 120) ?? clamped(raw.vehicle, 120),

    estimatedValueMin: parseMoney(raw.val_est_low),
    estimatedValueMax: parseMoney(raw.val_est_high),

    placeCity: clamped(raw.pop_city, 120),
    placeState: clamped(raw.pop_state, 60),
    placeCountry: clamped(raw.pop_country, 60),

    /*
     * Always NEW. The internal workflow status belongs to this team, and an import
     * must never assert where a solicitation sits in their pipeline. On a re-sync the
     * upsert leaves the existing status alone entirely — see `upsertProviderOpportunity`.
     */
    status: OpportunityStatus.NEW,
    // DIBBS is the only source type that reports a publication status.
    sourceStatus: clamped(raw.dibbs_status, 60),

    /*
     * `version_key` changes when the agency amends the solicitation and is stable
     * otherwise, which is exactly what the upsert needs to skip rewriting a record
     * nothing has happened to.
     */
    sourceVersion: clamped(raw.version_key, 200),

    /*
     * The untouched provider record, kept for traceability and for re-normalization
     * when this mapping improves. It is also where the fields the universal model has
     * no column for survive — `version_key`, the NSN list, the contacts, the DIBBS
     * flags, and the fact that the record arrived via HigherGov at all.
     */
    rawData: { provider: "highergov", record: raw },

    naicsCodes: naicsCodes(raw),
    pscCodes: pscCodes(raw),
  };
}
