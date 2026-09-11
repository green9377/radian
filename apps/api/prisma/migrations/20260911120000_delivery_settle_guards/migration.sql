-- (audit 11 Sep 2026) Delivery settle / assignment guards
--   P0 #4  customerChargedAt: the retry fare reaches the customer's order once
--   P0 #3  feeKeptFromCash on a remittance line: net the fee only when the rider kept it
--   P2     shortPaisa / shortNote: cash received short of the COD, recorded per line
--   P1 #24 one ACTIVE assignment per order, enforced by a partial unique index

ALTER TABLE "DeliveryAssignment" ADD COLUMN IF NOT EXISTS "customerChargedAt" TIMESTAMP(3);

ALTER TABLE "CarrierRemittanceLine" ADD COLUMN IF NOT EXISTS "feeKeptFromCash" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CarrierRemittanceLine" ADD COLUMN IF NOT EXISTS "shortPaisa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CarrierRemittanceLine" ADD COLUMN IF NOT EXISTS "shortNote" TEXT;

-- Before the index can exist, no order may hold two active assignments. Where
-- it does (a race that this index now prevents), every one but the NEWEST is
-- switched off — its status is left untouched so the record still says what
-- happened to it; only the "active" flag was ever the lie.
UPDATE "DeliveryAssignment" a
SET "isActive" = false
WHERE a."isActive" = true
  AND a."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "DeliveryAssignment" b
    WHERE b."orderId" = a."orderId"
      AND b."isActive" = true
      AND b."deletedAt" IS NULL
      AND (b."assignedAt" > a."assignedAt" OR (b."assignedAt" = a."assignedAt" AND b."id" > a."id"))
  );

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryAssignment_one_active_per_order"
  ON "DeliveryAssignment" ("orderId")
  WHERE "isActive" = true AND "deletedAt" IS NULL;
