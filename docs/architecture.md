# Architecture

## Guiding principle

This application is a **government opportunity intelligence engine with a CRM user
interface** — not a dashboard that calls SAM.gov. That distinction drives every
structural decision below.

The long-term data flow is fixed:

```text
External Government Source   (SAM.gov, BidNet, state portals, …)
          ↓
Provider Connector           src/integrations/opportunities/<provider>/
          ↓
Normalizer                   provider-native → universal model
          ↓
Universal Opportunity        src/features/opportunities/
          ↓
PostgreSQL                   prisma/schema.prisma
          ↓
Matching Engine              src/features/matching/
          ↓
OpportunityMatch             client × opportunity, with scores and reasons
          ↓
Dashboard                    src/app/(dashboard)/
```

Provider-specific response shapes must never travel past the normalizer. Adding a
second source must not require a change to the database schema, the service layer,
or any page.

## Layering

Every request follows the same path, and each layer may only call the one beneath it:

```text
Route Handler / Server Component     transport concerns only
        ↓
Zod schema                           validate untrusted input
        ↓
Service                              business rules, DTO mapping, domain errors
        ↓
Repository                           the only module that talks to Prisma
        ↓
Prisma / PostgreSQL
```

Rules this enforces:

- No Prisma query lives in a component or a route handler.
- A Client Component never imports a service, a repository, or anything server-only.
- Services return DTOs, never Prisma rows. `Decimal` becomes an exact decimal
  string and `Date` becomes an ISO string, so values survive JSON and the
  Server → Client boundary without loss of precision.
- Repositories return rows; they contain no business rules.

`server-only` is imported by every server module. Importing one from a Client
Component is a **build error**, not a runtime surprise — this is what
mechanically guarantees no credential reaches the browser bundle.

## Directory map

| Path                            | Responsibility                                                |
| ------------------------------- | ------------------------------------------------------------- |
| `src/app/(dashboard)/`          | Dashboard pages; the authentication boundary for the UI       |
| `src/app/api/`                  | Route Handlers — the HTTP transport layer                     |
| `src/components/ui/`            | Presentational primitives, no domain knowledge                |
| `src/components/layout/`        | Application shell: sidebar, header, page header               |
| `src/components/{clients,opportunities}/` | Domain-aware presentational components             |
| `src/features/<domain>/`        | Schemas, types, repository and service for one domain          |
| `src/features/matching/`        | Matching pipeline contracts (not implemented)                 |
| `src/integrations/opportunities/` | Provider connectors and the provider registry               |
| `src/lib/`                      | Cross-cutting: env, logging, database, AWS, API errors, auth  |
| `prisma/`                       | Schema, migrations, development seed                          |

## Error handling

`AppError` carries a stable machine-readable code and an HTTP status. Every route
handler is wrapped in `withRouteErrorHandling`, which is the single place that
converts a thrown value into a response:

| Thrown                                  | Response                                    |
| --------------------------------------- | ------------------------------------------- |
| `AppError`                              | Its own code and status                     |
| `z.ZodError`                            | 400 `VALIDATION_ERROR` with field details   |
| `PrismaClientKnownRequestError` P2002   | 409 `CONFLICT`                              |
| `PrismaClientKnownRequestError` P2025   | 404 `NOT_FOUND`                             |
| `PrismaClientInitializationError`       | 503 `DATABASE_ERROR`                        |
| anything else                           | 500 `INTERNAL_ERROR`                        |

Response bodies never contain a stack trace, SQL, a connection string, or AWS
metadata. Details go to the structured logger, which redacts known-sensitive keys
at any nesting depth.

Server Components use `safeQuery` instead, which turns a read failure into a
rendered error state — the scaffold must stay usable before PostgreSQL exists.

## Storage

Object storage follows three rules:

1. **The bucket is private.** No ACL is ever set. Access is exclusively via
   short-lived presigned URLs.
2. **The server owns the key.** An upload key is generated as
   `<scope>/<ownerId>/<uuid>-<sanitized-name>`. The caller supplies a file name,
   which only ever contributes a sanitized suffix — it can neither escape its
   prefix nor overwrite an existing object.
3. **Keys are validated against their owner.** A download request names a scope
   and an owner record; `assertKeyInScope` rejects any key outside that record's
   prefix, so editing the request body cannot reach another client's documents.

Key conventions:

```text
opportunities/{opportunityId}/{uuid}-{safeFileName}
clients/{clientId}/documents/{uuid}-{safeFileName}
proposals/{proposalId}/{uuid}-{safeFileName}
```

File bytes never enter PostgreSQL; only metadata rows do.

## Authentication boundary

Authentication is **not implemented**, and no custom password handling has been
invented. `src/lib/auth/session.ts` is the single seam. Three call sites must be
protected before deployment:

1. `src/app/(dashboard)/layout.tsx` — all dashboard routes
2. Every handler under `src/app/api/` — each already calls `requireSession()`
3. The storage endpoints — highest risk, since they mint object credentials

`getSession()` returns a development placeholder locally and `null` in production,
so an unauthenticated build fails closed rather than silently exposing data.

## Background processing (future)

Worker code stays out of the request path. Nothing here is built yet:

```text
EventBridge Scheduler
        ↓
Lambda (sam-sync)
        ↓
SAM.gov / other providers
        ↓
Normalize → RDS PostgreSQL
        ↓
SQS
        ↓
Matching worker / document worker
        ↓
CloudWatch (logs and metrics)
```

Planned layout, to be created when the first worker is implemented:

```text
workers/
├── sam-sync/
├── opportunity-matcher/
└── document-processor/
```

The structured JSON logger already emits one object per line specifically so
CloudWatch Logs Insights can query these workers without further work.
