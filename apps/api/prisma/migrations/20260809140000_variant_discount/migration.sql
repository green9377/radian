-- DEC-PRD-032 rev - a variant carries its own discount, in the product's own
-- shape: PERCENT in basis points (1000 = 10%), FLAT in paisa. The product's
-- discount never applies on top of it (DEC-PRD-031).
ALTER TABLE "ProductVariant" ADD COLUMN "discountType" "DiscountType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "ProductVariant" ADD COLUMN "discountValue" INTEGER NOT NULL DEFAULT 0;
