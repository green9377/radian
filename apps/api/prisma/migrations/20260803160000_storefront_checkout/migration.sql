-- Storefront checkout: online payment attempts (gateway <-> order bridge)

CREATE TYPE "PaymentSessionStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'CANCELLED');

CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "tranId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SSLCOMMERZ',
    "amountPaisa" INTEGER NOT NULL,
    "status" "PaymentSessionStatus" NOT NULL DEFAULT 'INITIATED',
    "valId" TEXT,
    "bankTranId" TEXT,
    "cardType" TEXT,
    "raw" JSONB,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentSession_tranId_key" ON "PaymentSession"("tranId");
CREATE INDEX "PaymentSession_orderId_idx" ON "PaymentSession"("orderId");
CREATE INDEX "PaymentSession_status_idx" ON "PaymentSession"("status");

ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- the storefront's own sales channel (DEC-SAL-001) — idempotent
INSERT INTO "Channel" ("id", "slug", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES ('chn_website', 'website', 'Website', true, 0, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
