# SAM.gov connector

**Not implemented.** This directory is reserved for the SAM.gov provider, which is
Phase 2 of the project. No SAM.gov API call exists anywhere in the current codebase.

## Planned contents

| File               | Responsibility                                                             |
| ------------------ | -------------------------------------------------------------------------- |
| `sam.types.ts`     | SAM.gov's native response shapes. **Must not be imported outside this dir.** |
| `sam.client.ts`    | HTTP client: API key handling, paging, rate limiting, retries               |
| `sam.normalizer.ts`| Maps a native record onto `NormalizedOpportunity`                           |
| `sam.provider.ts`  | Implements `OpportunityProvider`, composing the client and normalizer       |

## Rules for the implementation

1. **Never call SAM.gov from a browser component.** The connector runs server-side
   only — inside a background worker, or a Route Handler at minimum.
2. **The API key is a server secret.** It belongs in `src/lib/env.ts` as
   `SAM_GOV_API_KEY`, never with a `NEXT_PUBLIC_` prefix.
3. **Normalize at the boundary.** A `SamOpportunityResponse` must never reach the
   service layer, the database, or the UI.
4. **Deduplicate on `(source, externalId)`.** The unique constraint already exists;
   the sync should upsert rather than fail on a repeated import.
5. **Preserve the payload.** Store the normalized source record in
   `Opportunity.rawData` so a mapping change can be replayed without re-fetching.
6. **Sync incrementally.** Track the last successful `postedSince` cursor rather
   than re-scanning the full catalogue on every run.

## Target flow

```text
EventBridge Scheduler → Lambda → SAM.gov API
                                     ↓
                             SAM Provider (fetch)
                                     ↓
                             Normalizer (map)
                                     ↓
                        Universal Opportunity model
                                     ↓
                            RDS PostgreSQL (upsert)
                                     ↓
                              SQS → Matching worker
```
