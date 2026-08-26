-- The "How it arrives" strip was proposed, built, and turned down by the owner
-- the same day ("ata dorkar nai"). The columns leave with it. IF EXISTS on
-- both sides: demo already ran the add-migration, a fresh database never will.
ALTER TABLE "StorefrontSetting" DROP COLUMN IF EXISTS "pdpJourneyImg1";
ALTER TABLE "StorefrontSetting" DROP COLUMN IF EXISTS "pdpJourneyImg2";
ALTER TABLE "StorefrontSetting" DROP COLUMN IF EXISTS "pdpJourneyImg3";
