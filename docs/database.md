# Database

PostgreSQL, accessed through Prisma ORM. AWS RDS PostgreSQL in deployed
environments; any PostgreSQL instance works locally via `DATABASE_URL`.

## Running locally

Either `npx prisma dev` (a PostgreSQL managed by the Prisma CLI — no install, prints
both a connection URL and a shadow-database URL) or a Docker container. Use
`sslmode=disable` in `DATABASE_URL` and leave `DATABASE_CA_CERT_PATH` unset; the
TLS upgrade described below then does nothing. See the README for the commands.

`SHADOW_DATABASE_URL` is optional. `prisma migrate dev` needs a scratch database to
detect drift and creates one itself by default; set the variable when the database
user has no `CREATE DATABASE` permission (common on managed instances) or when
using `prisma dev`, which publishes its own.

## Connecting to AWS RDS

```bash
npm run db:provision   # create the RDS instance + security group, print DATABASE_URL
npm run db:ca          # download the Amazon RDS trust store to certs/
# paste DATABASE_URL into .env, then:
npm run db:check       # verify connectivity and TLS before touching the schema
npm run db:deploy      # apply migrations
npm run db:seed        # optional sample data
```

`scripts/aws/provision-rds.sh` is idempotent and reads its settings from environment
variables (`DB_INSTANCE_ID`, `DB_NAME`, `DB_USER`, `DB_INSTANCE_CLASS`,
`DB_ENGINE_VERSION`, `AWS_REGION`). It creates a publicly-accessible `db.t4g.micro`
with encrypted gp3 storage and a security group that allows **only the running
machine's current public IP** on tcp/5432. After an IP change — or to add another
developer — re-run the script or add the rule by hand; the symptom of a missing
rule is a connection timeout, not a refusal.

### TLS

Two settings, deliberately separate:

| Variable | Value | Used by |
| -------- | ----- | ------- |
| `DATABASE_URL` | `…?sslmode=require` | Prisma CLI (migrate, studio) **and** the app |
| `DATABASE_CA_CERT_PATH` | `certs/rds-global-bundle.pem` | the app only |

`DATABASE_URL` stays at `sslmode=require` because the Prisma CLI's schema engine
does not accept libpq's `verify-full`.

The CA bundle is **not optional for RDS**. node-postgres does not interpret
`sslmode=require` the way libpq does — it still validates the certificate chain
against Node's trust store, which does not contain the Amazon RDS root CA. With
`DATABASE_CA_CERT_PATH` set, `src/lib/db/connection-string.ts` rewrites the runtime
connection string to `sslmode=verify-full` with that bundle as the root, so both
the chain and the hostname are verified. The bundle is a public certificate and is
committed (a `.gitignore` exception to the blanket `*.pem` rule) so deployments
have it without a build-time download.

Leaving `sslmode=disable` in the URL disables the rewrite, so a local PostgreSQL
serving no TLS still works.

## Conventions

- **Identifiers** — every model uses an application-generated `cuid()` string
  primary key. No database sequences, so records can be created offline and in
  workers without a round trip.
- **Timestamps** — `createdAt` on every table; `updatedAt` on every mutable one.
- **Normalization** — multi-valued attributes are child tables, never delimited
  strings. `naicsCodes = "541511, 541512"` cannot be indexed, joined, or filtered;
  `ClientNaicsCode[]` can.
- **Money** — `Decimal(14,2)`. Floating point is never used for currency. Values
  are serialized to exact decimal strings at the API boundary.
- **Cascades** — child rows use `onDelete: Cascade`, so deleting a Client or an
  Opportunity cannot leave orphans.

## Prisma 7 notes

This project uses Prisma 7, which differs from earlier versions:

- The datasource block carries **no `url`**. The connection string comes from
  `prisma.config.ts`, which loads `.env` via `dotenv/config`.
- A **driver adapter is required**. `PrismaPg` from `@prisma/adapter-pg` is wired
  up in `src/lib/db/prisma.ts`.
- The client is generated as TypeScript source into `src/generated/prisma/`
  (git-ignored, rebuilt by `postinstall`). Import from `@/generated/prisma/client`
  and `@/generated/prisma/enums` — not from `@prisma/client`.

## Entity overview

### Client

The company profile that opportunities are matched against. Scalar fields cover
general information, GovCon identifiers (CAGE, UEI), contact details, and the
matching thresholds. Everything multi-valued is a child table:

| Table                    | Purpose                                | Notable fields          |
| ------------------------ | -------------------------------------- | ----------------------- |
| `ClientNaicsCode`        | NAICS codes                            | `code`, `isPrimary`     |
| `ClientPscCode`          | Product/service codes                  | `code`                  |
| `ClientCapability`       | Core capabilities                      | `name`, `description`   |
| `ClientKeyword`          | Matching keywords                      | `type` POSITIVE/NEGATIVE, `weight` |
| `ClientCertification`    | Certifications                         | `expiresAt`             |
| `ClientSetAside`         | Set-aside qualifications               | `code`, `label`         |
| `ClientContractVehicle`  | Contract vehicles                      | `contractNumber`        |
| `ClientPreferredAgency`  | Preferred agencies                     | `name`                  |

Each child table has a `@@unique([clientId, <natural key>])` so a profile cannot
accumulate duplicates.

Set-asides are stored as a **code plus optional label** rather than an enum,
because SBA programs change; a new program must not require a migration.

### Opportunity

The universal, provider-agnostic solicitation model. It is deliberately *not*
shaped like any single provider's response.

Two status fields exist, and conflating them would be a modelling error:

| Field          | Type                | Meaning                                                     |
| -------------- | ------------------- | ----------------------------------------------------------- |
| `status`       | `OpportunityStatus` | **Internal business workflow** — NEW → … → WON/LOST          |
| `sourceStatus` | `String?`           | Publication status as reported by the provider (e.g. active) |

`@@unique([source, externalId])` prevents duplicate imports; the future ingestion
pipeline upserts against it.

`rawData` (JSON) retains the normalized source payload so a mapping change can be
replayed without re-fetching from the provider.

### OpportunityMatch

The client × opportunity join produced by the matching pipeline, unique on
`[clientId, opportunityId]`.

All four score columns are **nullable by design**. Rule scoring lands first;
semantic and AI scores fill in later. A null score means *not yet assessed* and
the UI renders "Not scored" — it must never be displayed as a zero, which would
read as a deliberate negative assessment.

`matchReasons` and `risks` are `String[]`, so every score can be explained.

### OpportunityAttachment

File **metadata only** — `fileName`, `contentType`, `fileSize`, `s3Bucket`,
`s3Key`. Bytes live in S3. `@@unique([s3Bucket, s3Key])` keeps the metadata row
and the object one-to-one.

## Enums

| Enum                    | Values                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `ClientStatus`          | ACTIVE, PROSPECT, INACTIVE, ARCHIVED                                                      |
| `KeywordType`           | POSITIVE, NEGATIVE                                                                        |
| `OpportunitySourceType` | SAM_GOV, BIDNET, STATE_PORTAL, MANUAL, OTHER                                              |
| `OpportunityStatus`     | NEW, MATCHED, REVIEWING, INTERESTED, PASSED, PURSUING, PROPOSAL_IN_PROGRESS, SUBMITTED, WON, LOST |
| `MatchRecommendation`   | PURSUE, REVIEW, PASS                                                                      |
| `MatchStatus`           | NEW, REVIEWING, SHORTLISTED, DISMISSED                                                    |

## Indexes

Beyond primary and unique keys, indexes target the queries the dashboard actually
runs: `Client.status`, `Client.name`, `Opportunity.status`,
`Opportunity.responseDeadline`, `Opportunity.postedDate`, `Opportunity.agency`,
`OpportunityMatch.[clientId, overallScore]`, and every child table's `code`
column (the matching engine will join on these).

## Commands

```bash
npm run db:provision  # create an AWS RDS PostgreSQL instance (see above)
npm run db:ca         # download the Amazon RDS CA bundle
npm run db:check      # probe DATABASE_URL: DNS, firewall, credentials, TLS, schema
npm run db:generate   # regenerate Prisma Client after a schema change
npm run db:migrate    # create and apply a migration (development)
npm run db:deploy     # apply existing migrations (CI / production)
npm run db:studio     # browse data
npm run db:seed       # development-only sample data
```

`DATABASE_URL` must point at a reachable PostgreSQL instance before any migration
command will work.

## Future schema work

Deliberately absent for now, with an extension point ready for each:

- `pgvector` embedding columns for semantic matching
- `PastPerformance`, `Contact`, `Deal`, `Project` models
- A `Source` / `OpportunitySource` table, if provider metadata outgrows the enum
- Proposal and document-generation models
