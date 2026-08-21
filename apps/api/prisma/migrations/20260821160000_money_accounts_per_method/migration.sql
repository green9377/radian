-- DEC-GBL-006 — a shop has several bKash numbers and several bank accounts.
-- Each is a money account of the same METHOD; the ledger already had one per
-- method, so the extras are simply more rows on the same table.

ALTER TABLE "FinanceAccount" ADD COLUMN IF NOT EXISTS "accountRef" TEXT;

ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "PurchasePayment"    ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "SupplierPayment"    ADD COLUMN IF NOT EXISTS "accountId" TEXT;
