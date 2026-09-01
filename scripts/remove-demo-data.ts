/**
 * Removes the development seed's fictional opportunities.
 *
 * `prisma/seed.ts` inserts five clearly-labelled placeholder solicitations
 * (SEED-RFP-2026-000x) so the dashboard has something to render before a real feed is
 * connected. Once one is connected they stop being helpful and start being wrong:
 * they carry hand-written win probabilities, so they are the only records feeding the
 * Awards & Forecast panel, which then reports a $9.5M forecast that does not exist.
 *
 * DESTRUCTIVE and irreversible. Matches and tasks attached to these records go with
 * them, by the schema's cascade. Run it deliberately.
 *
 * Usage: npm run db:remove-demo-data
 */
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { resolveDatabaseUrl } from "../src/lib/db/connection-string";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: resolveDatabaseUrl(databaseUrl, process.env.DATABASE_CA_CERT_PATH),
  }),
});

/**
 * Identified by the seed's own solicitation prefix, not by source or status.
 * `MANUAL` is a legitimate source for a hand-entered real opportunity, so deleting on
 * that would take genuine records with it.
 */
const SEED_PREFIX = "SEED-RFP-";

async function main(): Promise<void> {
  const doomed = await prisma.opportunity.findMany({
    where: { solicitationNumber: { startsWith: SEED_PREFIX } },
    select: { id: true, title: true, solicitationNumber: true, status: true },
  });

  if (doomed.length === 0) {
    console.log("No seed opportunities found. Nothing to do.");
    return;
  }

  console.log(`Deleting ${doomed.length} seed opportunit${doomed.length === 1 ? "y" : "ies"}:`);
  for (const row of doomed) {
    console.log(`  ${row.solicitationNumber}  ${row.status.padEnd(10)}  ${row.title}`);
  }

  const { count } = await prisma.opportunity.deleteMany({
    where: { solicitationNumber: { startsWith: SEED_PREFIX } },
  });

  console.log(`\nDeleted ${count}. Matches and tasks attached to them cascaded away.`);
  console.log(`Remaining opportunities: ${await prisma.opportunity.count()}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
