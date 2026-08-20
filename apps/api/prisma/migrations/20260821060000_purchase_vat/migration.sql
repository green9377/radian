-- DEC-PUR-012 (owner, 21 Aug) — a supplier bill carries VAT, so the purchase
-- screen gets the same four doors as the counter. Old rows keep 0 on both.
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "taxRateBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "vatPaisa" INTEGER NOT NULL DEFAULT 0;
