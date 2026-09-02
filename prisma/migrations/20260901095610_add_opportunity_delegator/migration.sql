-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "assignedById" TEXT;

-- CreateIndex
CREATE INDEX "Opportunity_assignedById_idx" ON "Opportunity"("assignedById");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
