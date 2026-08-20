-- DEC-POS-020 (owner, 21 Aug) — the counter bill carries its own date, a note
-- and the name of whoever sold it. placedAt and internalNote already exist; only
-- the salesperson is new. A snapshot, so old rows simply have none.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "salespersonName" TEXT;
