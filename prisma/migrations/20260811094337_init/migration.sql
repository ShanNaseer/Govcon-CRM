-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PROSPECT', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KeywordType" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "OpportunitySourceType" AS ENUM ('SAM_GOV', 'BIDNET', 'STATE_PORTAL', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'MATCHED', 'REVIEWING', 'INTERESTED', 'PASSED', 'PURSUING', 'PROPOSAL_IN_PROGRESS', 'SUBMITTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "MatchRecommendation" AS ENUM ('PURSUE', 'REVIEW', 'PASS');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('NEW', 'REVIEWING', 'SHORTLISTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT,
    "industry" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT',
    "cageCode" TEXT,
    "uei" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "capabilityDescription" TEXT,
    "securityClearance" TEXT,
    "geographicPreferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minContractValue" DECIMAL(14,2),
    "maxContractValue" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNaicsCode" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientNaicsCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPscCode" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPscCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCapability" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientKeyword" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "type" "KeywordType" NOT NULL,
    "weight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCertification" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientSetAside" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSetAside_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContractVehicle" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contractNumber" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientContractVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPreferredAgency" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPreferredAgency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "source" "OpportunitySourceType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "solicitationNumber" TEXT,
    "agency" TEXT,
    "subAgency" TEXT,
    "office" TEXT,
    "postedDate" TIMESTAMP(3),
    "responseDeadline" TIMESTAMP(3),
    "setAside" TEXT,
    "contractType" TEXT,
    "estimatedValueMin" DECIMAL(14,2),
    "estimatedValueMax" DECIMAL(14,2),
    "placeCity" TEXT,
    "placeState" TEXT,
    "placeCountry" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "sourceStatus" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityNaicsCode" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityNaicsCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityPscCode" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityPscCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityAttachment" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "fileSize" INTEGER,
    "s3Bucket" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityMatch" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "ruleScore" DOUBLE PRECISION,
    "semanticScore" DOUBLE PRECISION,
    "aiScore" DOUBLE PRECISION,
    "overallScore" DOUBLE PRECISION,
    "recommendation" "MatchRecommendation",
    "matchReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "MatchStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_uei_key" ON "Client"("uei");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "ClientNaicsCode_code_idx" ON "ClientNaicsCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ClientNaicsCode_clientId_code_key" ON "ClientNaicsCode"("clientId", "code");

-- CreateIndex
CREATE INDEX "ClientPscCode_code_idx" ON "ClientPscCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPscCode_clientId_code_key" ON "ClientPscCode"("clientId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCapability_clientId_name_key" ON "ClientCapability"("clientId", "name");

-- CreateIndex
CREATE INDEX "ClientKeyword_keyword_idx" ON "ClientKeyword"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "ClientKeyword_clientId_keyword_type_key" ON "ClientKeyword"("clientId", "keyword", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCertification_clientId_name_key" ON "ClientCertification"("clientId", "name");

-- CreateIndex
CREATE INDEX "ClientSetAside_code_idx" ON "ClientSetAside"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ClientSetAside_clientId_code_key" ON "ClientSetAside"("clientId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ClientContractVehicle_clientId_name_key" ON "ClientContractVehicle"("clientId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPreferredAgency_clientId_name_key" ON "ClientPreferredAgency"("clientId", "name");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Opportunity_responseDeadline_idx" ON "Opportunity"("responseDeadline");

-- CreateIndex
CREATE INDEX "Opportunity_postedDate_idx" ON "Opportunity"("postedDate");

-- CreateIndex
CREATE INDEX "Opportunity_agency_idx" ON "Opportunity"("agency");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_source_externalId_key" ON "Opportunity"("source", "externalId");

-- CreateIndex
CREATE INDEX "OpportunityNaicsCode_code_idx" ON "OpportunityNaicsCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityNaicsCode_opportunityId_code_key" ON "OpportunityNaicsCode"("opportunityId", "code");

-- CreateIndex
CREATE INDEX "OpportunityPscCode_code_idx" ON "OpportunityPscCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityPscCode_opportunityId_code_key" ON "OpportunityPscCode"("opportunityId", "code");

-- CreateIndex
CREATE INDEX "OpportunityAttachment_opportunityId_idx" ON "OpportunityAttachment"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityAttachment_s3Bucket_s3Key_key" ON "OpportunityAttachment"("s3Bucket", "s3Key");

-- CreateIndex
CREATE INDEX "OpportunityMatch_clientId_overallScore_idx" ON "OpportunityMatch"("clientId", "overallScore");

-- CreateIndex
CREATE INDEX "OpportunityMatch_opportunityId_idx" ON "OpportunityMatch"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityMatch_status_idx" ON "OpportunityMatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityMatch_clientId_opportunityId_key" ON "OpportunityMatch"("clientId", "opportunityId");

-- AddForeignKey
ALTER TABLE "ClientNaicsCode" ADD CONSTRAINT "ClientNaicsCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPscCode" ADD CONSTRAINT "ClientPscCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCapability" ADD CONSTRAINT "ClientCapability_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientKeyword" ADD CONSTRAINT "ClientKeyword_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCertification" ADD CONSTRAINT "ClientCertification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSetAside" ADD CONSTRAINT "ClientSetAside_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContractVehicle" ADD CONSTRAINT "ClientContractVehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPreferredAgency" ADD CONSTRAINT "ClientPreferredAgency_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityNaicsCode" ADD CONSTRAINT "OpportunityNaicsCode_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPscCode" ADD CONSTRAINT "OpportunityPscCode_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityAttachment" ADD CONSTRAINT "OpportunityAttachment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityMatch" ADD CONSTRAINT "OpportunityMatch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityMatch" ADD CONSTRAINT "OpportunityMatch_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
