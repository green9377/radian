-- DEC-PRD-052: the reassurance line under Buy Now, editable from the admin.
ALTER TABLE "StorefrontSetting" ADD COLUMN "pdpUnderBuyText" TEXT;
ALTER TABLE "StorefrontSetting" ADD COLUMN "pdpUnderBuyPreorderText" TEXT;
