/**
 * HigherGov's own response model for GET /api-external/opportunity/.
 *
 * Transcribed from the published OpenAPI document at
 * https://www.highergov.com/api-external/schema/ (title "HigherGov API", v1.2).
 *
 * THESE TYPES MUST NOT LEAVE THIS DIRECTORY. Everything here uses HigherGov's field
 * names; the normalizer is the only thing that reads them, and what travels onward
 * is the universal `NormalizedOpportunity`. See provider.types.ts for why.
 *
 * Every field the spec marks nullable is `| null` here, and every field is optional
 * on top of that: a live API can add or drop fields between versions, and a
 * connector that assumes presence turns a shape change into a crash instead of a
 * skipped record.
 */

/** `agency` — AgencySimple. */
export type HigherGovAgency = {
  agency_key?: number | null;
  agency_name?: string | null;
  agency_abbreviation?: string | null;
  agency_type?: string | null;
  path?: string | null;
};

/** `naics_code` — Naics, reduced to the code by this endpoint's serializer. */
export type HigherGovNaics = {
  naics_code?: string | null;
};

/** `psc_code` — Psc, likewise. */
export type HigherGovPsc = {
  psc_code?: string | null;
};

/** `opp_type` — LookupComboOpportunityType. Carries only a description. */
export type HigherGovOpportunityType = {
  description?: string | null;
};

/** `primary_contact_email` / `secondary_contact_email` — PeopleSimple. */
export type HigherGovPerson = {
  people_name?: string | null;
  people_email?: string | null;
  path?: string | null;
};

export type HigherGovOpportunity = {
  /**
   * Stable HigherGov identifier for the opportunity, unique across their whole
   * corpus. This is the dedup key — NOT `version_key`, which changes every time the
   * agency amends the solicitation, and not `source_id`, which is only unique within
   * one upstream system.
   */
  opp_key?: string | null;
  /** Changes per amendment. Kept in rawData; useful later for change detection. */
  version_key?: string | null;

  /** Upstream system: "sam", "dibbs", "sbir", "grant", "sled". */
  source_type?: string | null;
  /** The agency's own solicitation number, e.g. "47PG1024R1000". */
  source_id?: string | null;
  source_id_version?: string | null;

  opp_cat?: string | null;
  title?: string | null;
  description_text?: string | null;
  /** HigherGov's generated summary. Used as a fallback when the full text is absent. */
  ai_summary?: string | null;

  /** All three are date-only strings (YYYY-MM-DD), not timestamps. */
  captured_date?: string | null;
  posted_date?: string | null;
  due_date?: string | null;

  agency?: HigherGovAgency | null;
  naics_code?: HigherGovNaics | null;
  psc_code?: HigherGovPsc | null;
  opp_type?: HigherGovOpportunityType | null;

  vehicle?: string | null;
  set_aside?: string | null;
  nsn?: Array<string | null> | null;

  /** Decimal strings, not numbers. */
  val_est_low?: string | null;
  val_est_high?: string | null;

  pop_country?: string | null;
  pop_state?: string | null;
  pop_city?: string | null;
  pop_zip?: string | null;

  primary_contact_email?: HigherGovPerson | null;
  secondary_contact_email?: HigherGovPerson | null;

  sole_source_flag?: boolean | null;
  product_service?: string | null;

  /** DIBBS-only fields. Present but null for every other source type. */
  dibbs_status?: string | null;
  dibbs_quantity?: number | null;
  dibbs_days_to_deliver?: number | null;
  dibbs_fast_award_flag?: boolean | null;
  dibbs_aidc_flag?: boolean | null;
  dibbs_tech_docs_flag?: boolean | null;
  dibbs_delivery_fob?: string | null;

  /** Relative path on highergov.com; `source_path` points at the upstream posting. */
  path?: string | null;
  source_path?: string | null;
  document_path?: string | null;
};

/** `PaginatedOpportunityList` — note the envelope is meta/links, not count/next. */
export type HigherGovOpportunityPage = {
  results?: HigherGovOpportunity[] | null;
  meta?: {
    pagination?: {
      page?: number | null;
      pages?: number | null;
      count?: number | null;
    } | null;
  } | null;
  links?: {
    first?: string | null;
    last?: string | null;
    next?: string | null;
    prev?: string | null;
  } | null;
};
