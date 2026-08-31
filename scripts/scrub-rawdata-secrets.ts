/**
 * Removes API keys from `Opportunity.rawData`.
 *
 * WHY THIS EXISTS. HigherGov's `document_path` is a ready-made URL with the account's
 * live `api_key` in its query string. Early ingestion stored the provider record
 * verbatim, so that credential was written into every imported row — and from there
 * into every backup and export. The connector now redacts on write
 * (highergov.redact.ts); this repairs rows written before it did.
 *
 * Idempotent, so it is safe to re-run — for instance after restoring an older backup.
 *
 * Usage: npm run db:scrub-secrets
 */
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { redactApiKeyDeep } from "../src/integrations/opportunities/highergov/highergov.redact";
import { resolveDatabaseUrl } from "../src/lib/db/connection-string";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: resolveDatabaseUrl(databaseUrl, process.env.DATABASE_CA_CERT_PATH),
  }),
});

/** Rows per page. Bounded so the whole table is never held in memory at once. */
const PAGE_SIZE = 200;

async function main(): Promise<void> {
  let scanned = 0;
  let cleaned = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.opportunity.findMany({
      select: { id: true, rawData: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor === undefined ? {} : { skip: 1, cursor: { id: cursor } }),
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      if (row.rawData === null) continue;

      const before = JSON.stringify(row.rawData);
      const after = JSON.stringify(redactApiKeyDeep(row.rawData));

      // Only written when something actually changed, so a re-run costs no writes.
      if (before === after) continue;

      await prisma.opportunity.update({
        where: { id: row.id },
        data: { rawData: JSON.parse(after) as object },
      });
      cleaned += 1;
    }

    cursor = rows[rows.length - 1].id;
    process.stdout.write(`  scanned ${scanned}, cleaned ${cleaned}\r`);
  }

  console.log(`\nscanned ${scanned} rows, redacted ${cleaned}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
