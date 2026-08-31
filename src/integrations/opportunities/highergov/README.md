# HigherGov connector

Pulls government opportunities from the [HigherGov external API](https://www.highergov.com/api-external/docs/)
into the universal `Opportunity` model.

```
HigherGov API → highergov.client → highergov.normalize → opportunity.sync.service → upsert → PostgreSQL → inbox
```

## Files

| File | Responsibility |
| --- | --- |
| `highergov.types.ts` | HigherGov's own response model, transcribed from their OpenAPI document. **Never leaves this directory.** |
| `highergov.client.ts` | HTTP only. Builds the URL, maps status codes onto `AppError`, redacts the key from logs. |
| `highergov.normalize.ts` | Pure mapping onto `NormalizedOpportunity`. No I/O, no clock. |
| `highergov.provider.ts` | Wires the two together and adapts to the `OpportunityProvider` interface. |

The orchestration — paging, counting, idempotent storage — lives outside this
directory in `src/features/opportunities/opportunity.sync.service.ts`, because it is
provider-agnostic.

## Configuration

```
HIGHERGOV_API_KEY=...          # required to sync; absent means the feed is simply off
HIGHERGOV_SEARCH_ID=...        # strongly recommended — see "Volume" below
HIGHERGOV_BASE_URL=...         # optional, defaults to https://www.highergov.com
HIGHERGOV_PAGE_SIZE=100        # optional, API maximum is 100
HIGHERGOV_MAX_PAGES=3          # optional, pages per RUN (not per day)
HIGHERGOV_MAX_RECORDS=300      # optional, records per RUN
HIGHERGOV_OVERLAP_DAYS=1       # optional, days re-covered on every sync (1 = today)
```

## Industry filter

Imports are filtered to IT by NAICS or PSC before being stored. Measured on a live
page of 100 records: **7 kept, 93 dropped** — which is what an IT company's share of
an unfiltered government feed actually looks like.

The filter lives in `src/features/opportunities/opportunity-filter.ts`, outside this
directory, because it is a business rule rather than anything to do with HigherGov.
Two prefixes were tried against real data and removed for false positives: NAICS 8112
matched laboratory equipment maintenance, and PSC 5820 matched portable radios.

**It reduces what is STORED, not what is FETCHED.** The endpoint has no NAICS or PSC
parameter — see the parameter list above — so filtering server-side is only possible
through `search_id`. Configure it with `OPPORTUNITY_NAICS_PREFIXES` /
`OPPORTUNITY_PSC_PREFIXES`, or turn it off with `OPPORTUNITY_FILTER_ENABLED=false`.

## Catching up

`captured_date` is an EXACT-DAY filter, not "since" — verified against the live API,
where an earlier date returns *fewer* records rather than more. A day nobody syncs is
therefore a permanent hole.

So the connector keeps a cursor in `ProviderSyncState`, and "Sync now" means "catch
up": it covers every date from the last fully-imported one through today. Nobody has
to know how long it has been since the last run, and a scheduler that misses two days
recovers on its next tick.

Three rules make that safe, all in `sync-window.ts`:

- **The cursor names a FINISHED date**, so a run resumes at the day after it.
- **It advances only across a contiguous run of fully-imported dates.** A date cut
  short by the record budget is revisited; stepping past it would lose its remaining
  records permanently.
- **It never advances onto today.** Records arrive all day, so "every page we could
  see at 10am" is not "every page there will be".

`HIGHERGOV_OVERLAP_DAYS` (default 1 — today only) re-covers the most recent days on
every run. Raising it catches two things a today-only run cannot: records captured
after the last run finished, and amendments, which are re-captured under a later date.
Re-covering is nearly free to store because `sourceVersion` skips unchanged records —
though it still costs one fetch per page. Catching up on a missed run happens
regardless of this setting.

## Volume — read this before syncing

Measured against the live API on 2026-08-27: **6,709 opportunities captured in one
day, across 68 pages.** That is the entire federal, DIBBS, SBIR, grant and
state/local output of the US government. Almost none of it is any one company's
pipeline.

So a run is deliberately bounded (`HIGHERGOV_MAX_PAGES` / `HIGHERGOV_MAX_RECORDS`)
and reports what it left behind. The fix for the volume is not a bigger budget, it is
**`HIGHERGOV_SEARCH_ID`**: create a saved search in the HigherGov UI with your NAICS,
PSC, agency, keyword and value filters, and the feed narrows to records worth
triaging. Every sync then applies it.

Measured timings per 100 records, which is where the budget defaults come from:

| | time |
| --- | --- |
| fetch one page (100 records) | ~4.3 s |
| normalize 100 records | ~12 ms |
| store 100 **new** records | ~9.5 s |
| store 100 **unchanged** records | ~0.75 s |

Unchanged records are cheap because `sourceVersion` (HigherGov's `version_key`) is
compared first and the write is skipped entirely — a routine re-sync costs almost
nothing, which is what makes polling viable.

For a bulk backfill use the API route rather than the button: raise
`HIGHERGOV_MAX_RECORDS`, and a long runtime is nobody's problem there.

## Running a sync

- **Manually** — "Sync now" on the opportunities inbox, with a window selector
  (today / 3 / 7 days). Needs `opportunities:write`.
- **Unattended** — `POST /api/integrations/highergov/sync?days=1`. Authenticates via
  the session cookie, like every other route; see the note in that file about
  machine-to-machine tokens.

## Field mapping

| HigherGov | Universal model | Note |
| --- | --- | --- |
| `opp_key` | `externalId` | Dedup key. Stable across amendments, unlike `version_key`. |
| `source_type` | `source` | `sam`→SAM_GOV, `dibbs`→DIBBS, `sbir`→SBIR, `grant`→GRANTS, `sled`→STATE_PORTAL, else OTHER. |
| `title` | `title` | Required; a record without one is skipped. |
| `description_text` | `description` | Falls back to `ai_summary`, labelled as generated. |
| `source_id` | `solicitationNumber` | The agency's own number. |
| `agency.agency_name` | `agency` | |
| `posted_date` | `postedDate` | Date-only, parsed at UTC midnight. |
| `due_date` | `responseDeadline` | Same. |
| `set_aside` | `setAside` | |
| `opp_type.description` | `contractType` | Falls back to `vehicle`. |
| `val_est_low` / `val_est_high` | `estimatedValueMin` / `Max` | Decimal strings; negatives dropped. |
| `pop_city` / `pop_state` / `pop_country` | `placeCity` / `placeState` / `placeCountry` | |
| `naics_code.naics_code` | `naicsCodes[]` | Dropped unless 2–6 digits. |
| `psc_code.psc_code` | `pscCodes[]` | Dropped unless 2–6 alphanumeric. |
| `source_path` / `path` | `sourceUrl` | Relative upstream; resolved against the host. |
| `dibbs_status` | `sourceStatus` | Only source type that reports one. |
| `version_key` | `sourceVersion` | Changes on amendment. Lets a re-sync skip unchanged records. |
| *whole record* | `rawData` | Kept for traceability and re-normalization. |

Fields with no column — `nsn`, the contacts, the other DIBBS flags — survive in
`rawData`.

## Three rules worth not breaking

**A re-sync never touches workflow state.** `upsertProviderOpportunities` writes only
source-owned fields. `status`, `assignedToId`, `assignedAt` and `probabilityOfWin` are
the team's, so an amended solicitation cannot pull a record out of someone's queue or
reset one they already passed on.

**One bad record is never fatal.** `normalize` returns `null` for anything unusable
and the sync counts it as skipped. A run over 100 solicitations must not be lost to
one malformed entry.

**No interactive transactions.** `DATABASE_URL` points at a connection pooler, which
does not hand out the dedicated session a Prisma interactive transaction needs — a
per-record `$transaction` fails with P2028 under any real load. The upsert is
set-shaped instead: a handful of statements per page rather than one transaction per
record.

## Verifying the mapping

`captured_date` filters to an exact day, so today's window is often empty — widen it
before concluding the connector is broken. `meta.pagination.count` in the response
tells you how many records the window actually holds.
