-- CreateTable
CREATE TABLE "ProviderSyncState" (
    "provider" TEXT NOT NULL,
    "lastCapturedDate" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastRunSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSyncState_pkey" PRIMARY KEY ("provider")
);
