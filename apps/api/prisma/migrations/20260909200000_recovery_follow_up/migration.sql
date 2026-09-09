-- Orders -> Lost orders: what staff did about a lost order (owner, 9 Sep 2026).
CREATE TYPE "RecoveryOutcome" AS ENUM ('CALLED', 'NO_ANSWER', 'WILL_PAY', 'NOT_INTERESTED', 'ORDERED', 'CLOSED');

CREATE TABLE "RecoveryFollowUp" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "orderId" TEXT,
    "outcome" "RecoveryOutcome" NOT NULL,
    "note" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryFollowUp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecoveryFollowUp_leadId_idx" ON "RecoveryFollowUp"("leadId");
CREATE INDEX "RecoveryFollowUp_orderId_idx" ON "RecoveryFollowUp"("orderId");
CREATE INDEX "RecoveryFollowUp_createdAt_idx" ON "RecoveryFollowUp"("createdAt");
