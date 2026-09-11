-- POS audit, 11 Sep 2026 — the three things the money fixes need a column for.
-- Idempotent: this branch is applied by hand on developer machines.

-- §1 #1 — one attempt, one bill. The unique index IS the guarantee; a
-- lookup-then-insert races itself and a browser guard dies on reload.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "posIdempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_posIdempotencyKey_key"
  ON "Order" ("posIdempotencyKey");

-- §1 #7 — who approved an over-cap counter discount. Checked and then thrown
-- away until today, so the answer was written down nowhere.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountApprovedBy" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountApprovedById" TEXT;

-- §1 #7 — the server-issued, one-shot approval the sale must present. Replaces
-- MANAGER_PIN = "1234" in the browser bundle and the "any non-empty string"
-- check on the server.
CREATE TABLE IF NOT EXISTS "PosDiscountApproval" (
  "id"               TEXT NOT NULL,
  "token"            TEXT NOT NULL,
  "approvedById"     TEXT NOT NULL,
  "approvedByName"   TEXT NOT NULL,
  "requestedPercent" INTEGER,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "usedAt"           TIMESTAMP(3),
  "usedOrderId"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- only so the soft-delete client extension has a column to filter on
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "PosDiscountApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PosDiscountApproval_token_key"
  ON "PosDiscountApproval" ("token");
CREATE INDEX IF NOT EXISTS "PosDiscountApproval_expiresAt_idx"
  ON "PosDiscountApproval" ("expiresAt");

-- §3 #11 — change given at the counter. The recorded payments are what the shop
-- KEPT (never more than the bill); this is what was handed back, so a reprint
-- can say the same thing the first slip said.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "posChangePaisa" INTEGER NOT NULL DEFAULT 0;
