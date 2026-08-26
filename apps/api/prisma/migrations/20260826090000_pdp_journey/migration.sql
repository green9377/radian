-- DEC-PRD-054: the "How it arrives" strip - three shop-wide journey photos.
ALTER TABLE "StorefrontSetting" ADD COLUMN "pdpJourneyImg1" TEXT;
ALTER TABLE "StorefrontSetting" ADD COLUMN "pdpJourneyImg2" TEXT;
ALTER TABLE "StorefrontSetting" ADD COLUMN "pdpJourneyImg3" TEXT;
