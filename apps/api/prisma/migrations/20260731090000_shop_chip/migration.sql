-- The small card floating over the shop photograph.
ALTER TABLE "StorefrontSetting" ADD COLUMN IF NOT EXISTS "shopChipTitle" TEXT;
ALTER TABLE "StorefrontSetting" ADD COLUMN IF NOT EXISTS "shopChipSub" TEXT;

UPDATE "StorefrontSetting" SET
  "shopChipTitle" = 'Dhanmondi, Dhaka',
  "shopChipSub"   = 'Watch your gift arranged by hand'
WHERE "id" = 'singleton' AND "shopChipTitle" IS NULL;
