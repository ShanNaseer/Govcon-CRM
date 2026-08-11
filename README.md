# GovCon CRM / RFP Intelligence Platform

An internal government contracting platform that ingests solicitations from
external sources, normalizes them into a single provider-agnostic model, matches
them against each client's capability profile, and surfaces the results in a CRM
dashboard.

This repository currently contains the **base scaffold**. No government source
integration and no AI matching are implemented — see
[Current scope](#current-scope) for exactly what does and does not exist.

## Architecture summary

The application is an opportunity intelligence engine with a CRM interface, not a
dashboard that calls SAM.gov directly. That distinction is structural:

```text
External Government Source  →  Provider Connector  →  Normalizer
        →  Universal Opportunity  →  PostgreSQL  →  Matching Engine
        →  OpportunityMatch  →  Dashboard
```

Every request flows through the same layers, each calling only the one beneath it:

```text
Route Handler / Server Component
        ↓
Zod schema           validate untrusted input
        ↓
Service              business rules, authorization, DTO mapping
        ↓
Repository           the only module that touches Prisma
        ↓
PostgreSQL
```

Full detail in [docs/architecture.md](docs/architecture.md) and
[docs/database.md](docs/database.md).

## Technology stack

| Concern        | Choice                                          |
| -------------- | ----------------------------------------------- |
| Framework      | Next.js 16 (App Router), React 19               |
| Language       | TypeScript (strict)                             |
| Styling        | Tailwind CSS v4                                 |
| Database       | PostgreSQL (AWS RDS in production)              |
| ORM            | Prisma 7 with the `@prisma/adapter-pg` driver   |
| Validation     | Zod 4                                           |
| Object storage | Amazon S3 via AWS SDK v3                        |
| Icons          | lucide-react                                    |

The backend lives in this same Next.js repository as Route Handlers. There is no
separate Express/Nest service.

## Local requirements

- **Node.js ≥ 20.9** (developed on 22.15). Next.js 16 and Prisma 7 both refuse to
  run on Node 16/18.
- **npm** ≥ 10
- **A reachable PostgreSQL instance** — local, Docker, or RDS

## Installation

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL
npm run db:generate
npm run db:migrate
npm run dev
```

`npm install` runs `prisma generate` automatically via `postinstall`, because the
Prisma Client is generated into `src/generated/prisma/` and is **not** committed.

Open <http://localhost:3000>.

### Optional sample data

```bash
npm run db:seed
```

Inserts two fictional clients and three fictional opportunities. Development only —
the seed refuses to run with `NODE_ENV=production`. **The application renders
correctly against an empty database**; the seed is a convenience, not a requirement.

## Environment setup

Copy `.env.example` to `.env`. Never commit `.env`.

| Variable                       | Required     | Purpose                                          |
| ------------------------------ | ------------ | ------------------------------------------------ |
| `DATABASE_URL`                 | yes          | PostgreSQL connection string                     |
| `DATABASE_CA_CERT_PATH`        | for RDS      | CA bundle used to verify the DB certificate      |
| `APP_URL`                      | no           | Absolute app URL (default `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_NAME`         | no           | Display name in the sidebar and title            |
| `AWS_REGION`                   | for storage  | S3 region                                        |
| `AWS_S3_BUCKET`                | for storage  | Private bucket name                              |
| `AWS_ACCESS_KEY_ID`            | local only   | Omit in AWS; use an IAM role                     |
| `AWS_SECRET_ACCESS_KEY`        | local only   | Omit in AWS; use an IAM role                     |
| `S3_PRESIGNED_URL_TTL_SECONDS` | no           | Presigned URL lifetime (default 900, max 3600)   |

`src/lib/env.ts` validates these with Zod. Base configuration is validated on
first use; storage configuration is validated **lazily**, so the app and its
migrations still run on a machine with no S3 bucket — only the storage endpoints
fail, and they return a clear `STORAGE_NOT_CONFIGURED` error.

Only `NEXT_PUBLIC_*` variables reach the browser. `src/lib/env.ts` imports
`server-only`, so importing it from a Client Component is a build error.

## PostgreSQL setup

### AWS RDS (deployed and shared environments)

```bash
npm run db:provision   # create the instance + security group, print DATABASE_URL
npm run db:ca          # download the Amazon RDS trust store to certs/
# paste DATABASE_URL into .env, then:
npm run db:check       # verify connectivity and TLS
npm run db:deploy      # apply migrations
```

`npm run db:provision` needs working AWS credentials (`aws sts get-caller-identity`)
and a default VPC. It opens tcp/5432 to **only the running machine's public IP** —
re-run it after your IP changes, or the connection will time out.

`DATABASE_CA_CERT_PATH` is required for RDS: node-postgres validates the server
certificate even at `sslmode=require`, and the Amazon RDS root CA is not in Node's
trust store. See [docs/database.md](docs/database.md) for the full TLS rationale.

### Local

Any PostgreSQL instance works. Two easy options:

**`prisma dev`** — a local PostgreSQL managed by the Prisma CLI, nothing to install:

```bash
npx prisma dev            # leave running in its own terminal
```

It prints a connection URL and a shadow-database URL; put them in `.env` as
`DATABASE_URL` and `SHADOW_DATABASE_URL`.

**Docker:**

```bash
docker run --name govcon-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=govcon -p 5432:5432 -d postgres:16

# then in .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/govcon?sslmode=disable"
```

Keep `sslmode=disable` for a local server that serves no TLS — it also switches off
the certificate verification described above. Leave `DATABASE_CA_CERT_PATH` unset
locally.

`DATABASE_URL` must point at a running database **before** any migration command.

> **Prisma 7 note:** the connection URL is read from `prisma.config.ts` (which
> loads `.env` through `dotenv/config`), not from a `url` field in
> `schema.prisma`. The datasource block intentionally has no `url`.

## Database commands

```bash
npm run db:provision  # create an AWS RDS PostgreSQL instance
npm run db:ca         # download the Amazon RDS CA bundle to certs/
npm run db:check      # probe DATABASE_URL: DNS, firewall, credentials, TLS, schema
npm run db:generate   # regenerate Prisma Client after a schema change
npm run db:migrate    # create + apply a migration (development)
npm run db:deploy     # apply existing migrations (CI / production)
npm run db:studio     # browse data
npm run db:seed       # development-only sample data
```

The initial migration is committed at `prisma/migrations/`.

## Running

```bash
npm run dev        # development server
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## AWS configuration

| Service      | Status in this scaffold                                       |
| ------------ | ------------------------------------------------------------- |
| S3           | Implemented — presigned upload/download, private bucket        |
| RDS          | Target for `DATABASE_URL`                                      |
| Lambda       | Planned — future background workers                            |
| EventBridge  | Planned — future scheduled source sync                         |
| SQS          | Planned — future async processing                              |
| CloudWatch   | Ready — the logger emits one JSON object per line              |

**Credentials.** In AWS, set no access keys; the SDK resolves an IAM role through
the default credential chain. The explicit key variables exist only for local
development. Grant the role least privilege: `s3:PutObject`, `s3:GetObject`,
`s3:DeleteObject`, `s3:HeadObject` on `arn:aws:s3:::<bucket>/*`.

**Bucket policy.** The bucket must be private, with public access blocked. The
code never sets an ACL and never uses `public-read`. All browser access goes
through short-lived presigned URLs.

**Object keys** are generated server-side and never taken from the client:

```text
opportunities/{opportunityId}/{uuid}-{safeFileName}
clients/{clientId}/documents/{uuid}-{safeFileName}
proposals/{proposalId}/{uuid}-{safeFileName}
```

A download request must name the owning record; a key outside that record's prefix
is rejected with `403`. File bytes are never stored in PostgreSQL — only metadata.

## API

| Method | Route                            | Purpose                                    |
| ------ | -------------------------------- | ------------------------------------------ |
| GET    | `/api/health`                    | Service, database and storage status       |
| GET    | `/api/clients`                   | List clients (search, status, NAICS, page)  |
| POST   | `/api/clients`                   | Create a client with its profile           |
| GET    | `/api/clients/:clientId`         | Client detail                              |
| PATCH  | `/api/clients/:clientId`         | Partial update                             |
| DELETE | `/api/clients/:clientId`         | Delete (cascades to child rows)            |
| GET    | `/api/opportunities`             | List opportunities (filters, paging)       |
| POST   | `/api/opportunities`             | Create a normalized opportunity (dev/testing) |
| GET    | `/api/opportunities/:id`         | Opportunity detail                         |
| PATCH  | `/api/opportunities/:id`         | Update internal workflow status            |
| POST   | `/api/storage/upload-url`        | Presigned upload URL                       |
| POST   | `/api/storage/download-url`      | Presigned download URL                     |

`POST /api/opportunities` is for development and manual testing of the universal
model. It is **not** the government-source ingestion mechanism.

### Update semantics

`PATCH /api/clients/:clientId` distinguishes three cases:

- **Key omitted** — field left unchanged
- **Key set to `null`** — scalar cleared
- **Array provided** — that collection is replaced wholesale, in a transaction

### Error shape

Every error response uses one shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": { "name": ["Name is required"] }
  }
}
```

Codes: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`,
`STORAGE_ERROR`, `STORAGE_NOT_CONFIGURED`, `DATABASE_ERROR`, `INTERNAL_ERROR`.
Stack traces, SQL, connection strings and AWS metadata are never returned; they
go to the structured log, which redacts sensitive keys.

## Authentication

**Not implemented, and the application fails closed.**

`src/lib/auth/session.ts` is the single seam where a provider is wired in. No
custom password handling has been invented.

- In **development**, `getSession()` returns a placeholder identity so the app is
  usable locally.
- In **production**, it returns `null`. API routes then return `401`, and the
  dashboard renders "Authentication is not configured" instead of data.

The authorization check lives in the **service layer**, not just the dashboard
layout. This is deliberate: a Server Component's data is serialized into the RSC
payload even when a parent layout declines to render it, so a layout-only check
leaks records. The check sits next to the data access, which is the boundary that
actually holds.

Before deploying, wire a provider into `getSession()` and replace the production
`null` with a real lookup.

## Folder structure

```text
src/
├── app/
│   ├── (dashboard)/            dashboard shell + pages
│   │   ├── clients/
│   │   ├── opportunities/
│   │   └── settings/
│   └── api/                    route handlers
├── components/
│   ├── layout/                 sidebar, header, page header
│   ├── clients/                domain components
│   ├── opportunities/
│   └── ui/                     reusable primitives
├── features/
│   ├── clients/                schemas, types, repository, service
│   ├── opportunities/
│   ├── storage/
│   └── matching/               pipeline contracts (not implemented)
├── integrations/
│   └── opportunities/          provider interface + registry
│       └── sam/                reserved for Phase 2
├── lib/
│   ├── api/                    error contract + response helpers
│   ├── aws/                    S3 client + service
│   ├── auth/                   authentication boundary
│   ├── db/                     Prisma singleton
│   ├── env.ts  logger.ts  utils.ts
└── generated/prisma/           Prisma Client (git-ignored)

prisma/       schema, migrations, development seed
docs/         architecture and database documentation
```

> Route groups such as `clients/(list)/` do not affect URLs. They scope the
> `loading.tsx` Suspense boundary to the list page only — without that, the
> streamed response would force a `200` on a missing detail record instead of a
> `404`.

## Current scope

**Implemented**

- Dashboard shell: sidebar, header, responsive layout
- Dashboard, Clients list/detail, Opportunities list/detail, Settings pages
- Full Client domain with a normalized GovCon and matching profile
- Universal Opportunity model with match, attachment and code relations
- Clients, Opportunities, Storage and Health APIs
- Repository/service separation with Zod validation throughout
- S3 service with presigned URLs and key-scope enforcement
- Structured logging with redaction, and a consistent API error contract
- Initial Prisma migration and a development seed

**Not implemented (deliberate extension points)**

- SAM.gov or any other provider connector
- Embeddings, pgvector, LLM calls, AI-generated scores
- PDF parsing, OCR, Textract
- Proposal generation, notifications, billing, multi-tenancy
- Lambda / EventBridge / SQS deployment
- Authentication provider
- Client create/edit forms (the API supports both; the UI does not yet)

Sidebar entries and detail tabs for unbuilt modules render **disabled** rather
than linking to a dead route.

## Next phase

Phase 2, to begin only on separate instruction:

```text
SAM.gov Connector → Raw Ingestion → Normalization → Deduplication
      → PostgreSQL → First Rule-Based Client Matching
```

Start at `src/integrations/opportunities/sam/README.md`, which documents the
required structure and constraints.
