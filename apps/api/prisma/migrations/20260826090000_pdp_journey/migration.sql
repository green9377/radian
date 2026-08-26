-- DEC-PRD-054: the "How it arrives" strip - three shop-wide journey photos.
-- (Turned down by the owner the same day; 20260826110000 drops these again.
--  This file must stay: the demo database already recorded it as applied,
--  and migrate deploy refuses to run if an applied migration goes missing.)
ALTER TABLE "StorefrontSetting" ADD COLUMN "pdpJourneyImg1" TEXT;
ALTER TABLE "StorefrontSetting" ADD COLUMN "pdpJourneyImg2" TEXT;
ALTER TABLE "StorefrontSetting" ADD COLUMN "pdpJourneyImg3" TEXT;
