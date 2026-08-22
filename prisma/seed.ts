/**
 * DEVELOPMENT SEED — do not run against a production database.
 *
 * Inserts two clearly fictional clients and five fictional opportunities so the
 * dashboard has something to render locally. The application is designed to work
 * with an empty database; this is a convenience, not a requirement.
 *
 * Run with: npm run db:seed
 */

import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  ClientStatus,
  KeywordType,
  MatchRecommendation,
  MatchStatus,
  OpportunitySourceType,
  OpportunityStatus,
} from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";

import { resolveDatabaseUrl } from "../src/lib/db/connection-string";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env before seeding.");
}

// Same TLS handling as the app, so seeding a managed instance (RDS) works too.
const connectionString = resolveDatabaseUrl(databaseUrl, process.env.DATABASE_CA_CERT_PATH);

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run the development seed with NODE_ENV=production.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Days from now, as an absolute date. Keeps seeded deadlines meaningful whenever it runs. */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

async function main(): Promise<void> {
  console.log("Seeding development data…");

  // Idempotent: re-seeding replaces the sample records rather than duplicating them.
  await prisma.opportunityMatch.deleteMany({});
  await prisma.opportunity.deleteMany({ where: { source: OpportunitySourceType.MANUAL } });
  await prisma.client.deleteMany({ where: { name: { in: ["Northwind Federal Systems", "Cascade Analytics Group"] } } });

  const northwind = await prisma.client.create({
    data: {
      name: "Northwind Federal Systems",
      initials: "NF",
      industry: "IT Services",
      status: ClientStatus.ACTIVE,
      cageCode: "1A2B3",
      uei: "ZZZ111222333",
      website: "https://example.com",
      email: "contracts@example.com",
      phone: "+1 202 555 0142",
      city: "Arlington",
      state: "VA",
      capabilityDescription:
        "Cloud migration, secure software development, and 24/7 network operations support for federal civilian agencies.",
      securityClearance: "Facility clearance: Secret",
      geographicPreferences: ["VA", "MD", "DC"],
      minContractValue: "250000.00",
      maxContractValue: "15000000.00",
      naicsCodes: {
        create: [
          { code: "541512", title: "Computer Systems Design Services", isPrimary: true },
          { code: "541519", title: "Other Computer Related Services" },
        ],
      },
      pscCodes: { create: [{ code: "D307", title: "IT and Telecom - IT Systems Development" }] },
      capabilities: {
        create: [
          { name: "Cloud Migration", description: "AWS and Azure workload migration for federal systems." },
          { name: "Network Operations", description: "24/7 NOC and SOC support." },
        ],
      },
      keywords: {
        create: [
          { keyword: "cloud migration", type: KeywordType.POSITIVE, weight: 10 },
          { keyword: "cybersecurity", type: KeywordType.POSITIVE, weight: 8 },
          { keyword: "construction", type: KeywordType.NEGATIVE, weight: 10 },
        ],
      },
      certifications: { create: [{ name: "ISO 9001:2015", issuedBy: "ANAB" }] },
      setAsides: { create: [{ code: "SDVOSB", label: "Service-Disabled Veteran-Owned Small Business" }] },
      contractVehicles: { create: [{ name: "GSA MAS", contractNumber: "GS-00F-000AA" }] },
      preferredAgencies: {
        create: [{ name: "Department of Veterans Affairs" }, { name: "General Services Administration" }],
      },
    },
  });

  const cascade = await prisma.client.create({
    data: {
      name: "Cascade Analytics Group",
      initials: "CA",
      industry: "Data & Analytics",
      status: ClientStatus.PROSPECT,
      cageCode: "9Z8Y7",
      uei: "AAA444555666",
      city: "Portland",
      state: "OR",
      capabilityDescription:
        "Data engineering, statistical analysis, and program evaluation support for federal research programs.",
      geographicPreferences: ["OR", "WA", "Remote"],
      minContractValue: "100000.00",
      maxContractValue: "4000000.00",
      naicsCodes: { create: [{ code: "541690", title: "Other Scientific Consulting Services", isPrimary: true }] },
      capabilities: { create: [{ name: "Program Evaluation", description: "Mixed-methods evaluation studies." }] },
      keywords: { create: [{ keyword: "data analytics", type: KeywordType.POSITIVE, weight: 9 }] },
      setAsides: { create: [{ code: "WOSB", label: "Woman-Owned Small Business" }] },
    },
  });

  const cloudRfp = await prisma.opportunity.create({
    data: {
      source: OpportunitySourceType.MANUAL,
      externalId: "SEED-0001",
      title: "Enterprise Cloud Migration and Sustainment Services",
      description:
        "Fictional sample record. The agency seeks contractor support to migrate legacy applications to a FedRAMP-authorized cloud environment and provide ongoing sustainment.",
      solicitationNumber: "SEED-RFP-2026-0001",
      agency: "Department of Veterans Affairs",
      subAgency: "Office of Information and Technology",
      postedDate: daysFromNow(-9),
      responseDeadline: daysFromNow(12),
      setAside: "SDVOSB Set-Aside",
      contractType: "Firm Fixed Price",
      estimatedValueMin: "1200000.00",
      estimatedValueMax: "6500000.00",
      probabilityOfWin: 65,
      placeCity: "Washington",
      placeState: "DC",
      placeCountry: "USA",
      status: OpportunityStatus.MATCHED,
      sourceStatus: "active",
      naicsCodes: { create: [{ code: "541512", title: "Computer Systems Design Services", isPrimary: true }] },
      pscCodes: { create: [{ code: "D307" }] },
    },
  });

  const analyticsRfp = await prisma.opportunity.create({
    data: {
      source: OpportunitySourceType.MANUAL,
      externalId: "SEED-0002",
      title: "Program Evaluation and Data Analytics Support",
      description: "Fictional sample record used for local development.",
      solicitationNumber: "SEED-RFP-2026-0002",
      agency: "Department of Health and Human Services",
      postedDate: daysFromNow(-3),
      responseDeadline: daysFromNow(26),
      setAside: "Woman-Owned Small Business",
      contractType: "Time and Materials",
      estimatedValueMin: "300000.00",
      estimatedValueMax: "900000.00",
      probabilityOfWin: 40,
      placeState: "OR",
      placeCountry: "USA",
      status: OpportunityStatus.NEW,
      sourceStatus: "active",
      naicsCodes: { create: [{ code: "541690", isPrimary: true }] },
    },
  });

  await prisma.opportunity.create({
    data: {
      source: OpportunitySourceType.MANUAL,
      externalId: "SEED-0003",
      title: "Facility Maintenance and Grounds Keeping",
      description: "Fictional sample record that should not match either seeded client.",
      solicitationNumber: "SEED-RFP-2026-0003",
      agency: "General Services Administration",
      postedDate: daysFromNow(-20),
      responseDeadline: daysFromNow(4),
      contractType: "Firm Fixed Price",
      placeState: "TX",
      status: OpportunityStatus.NEW,
      sourceStatus: "active",
      naicsCodes: { create: [{ code: "561730", isPrimary: true }] },
    },
  });

  // Two further records so the dashboard exercises the later lifecycle stages:
  // without a submitted and an awarded opportunity, the pipeline panel, the award
  // forecast and the win-rate figure all render empty and cannot be eyeballed.
  await prisma.opportunity.create({
    data: {
      source: OpportunitySourceType.MANUAL,
      externalId: "SEED-0004",
      title: "Cybersecurity Operations Center Support",
      description: "Fictional sample record used for local development.",
      solicitationNumber: "SEED-RFP-2026-0004",
      agency: "Department of Homeland Security",
      postedDate: daysFromNow(-45),
      responseDeadline: daysFromNow(30),
      setAside: "Small Business",
      contractType: "Cost Plus Fixed Fee",
      estimatedValueMin: "4000000.00",
      estimatedValueMax: "9500000.00",
      probabilityOfWin: 72,
      placeState: "VA",
      placeCountry: "USA",
      status: OpportunityStatus.SUBMITTED,
      sourceStatus: "active",
      naicsCodes: { create: [{ code: "541512", isPrimary: true }] },
    },
  });

  await prisma.opportunity.create({
    data: {
      source: OpportunitySourceType.MANUAL,
      externalId: "SEED-0005",
      title: "Logistics Modernization and Sustainment",
      description: "Fictional sample record used for local development.",
      solicitationNumber: "SEED-RFP-2026-0005",
      agency: "Department of Defense",
      postedDate: daysFromNow(-120),
      responseDeadline: daysFromNow(-60),
      contractType: "IDIQ",
      estimatedValueMin: "2500000.00",
      estimatedValueMax: "3200000.00",
      probabilityOfWin: 100,
      placeState: "MD",
      placeCountry: "USA",
      status: OpportunityStatus.WON,
      sourceStatus: "awarded",
      naicsCodes: { create: [{ code: "541614", isPrimary: true }] },
    },
  });

  // Sample matches. Scores are hand-written illustrative values for local UI work —
  // the matching engine is not implemented, so nothing computes these yet.
  await prisma.opportunityMatch.createMany({
    data: [
      {
        clientId: northwind.id,
        opportunityId: cloudRfp.id,
        ruleScore: 88,
        overallScore: 88,
        recommendation: MatchRecommendation.PURSUE,
        matchReasons: [
          "Primary NAICS 541512 matches the solicitation",
          "SDVOSB set-aside matches a client qualification",
          "Estimated value falls inside the client's contract range",
        ],
        risks: ["Response deadline is inside 14 days"],
        status: MatchStatus.SHORTLISTED,
      },
      {
        clientId: cascade.id,
        opportunityId: analyticsRfp.id,
        ruleScore: 71,
        overallScore: 71,
        recommendation: MatchRecommendation.REVIEW,
        matchReasons: ["Primary NAICS 541690 matches", "WOSB set-aside matches a client qualification"],
        risks: ["No past performance recorded with this agency"],
        status: MatchStatus.NEW,
      },
    ],
  });

  // Counted rather than hard-coded, so the summary cannot drift from the inserts.
  const [clientCount, opportunityCount, matchCount] = await Promise.all([
    prisma.client.count(),
    prisma.opportunity.count(),
    prisma.opportunityMatch.count(),
  ]);

  console.log(
    `Seed complete: ${clientCount} clients, ${opportunityCount} opportunities, ${matchCount} matches.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
