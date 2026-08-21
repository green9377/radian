-- DEC-POS-021 (owner, 21 Aug) — the payment methods a shop takes belong to the
-- shop, not to the screen. Empty means all of them, so nothing changes for a
-- till that has never been told otherwise.
ALTER TABLE "PosSetting" ADD COLUMN IF NOT EXISTS "enabledMethods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
