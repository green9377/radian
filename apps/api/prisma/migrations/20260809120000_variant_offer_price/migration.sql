-- DEC-PRD-032 - a variant's own optional offer price. When set, the customer
-- pays this and pricePaisa shows struck through. Unrelated to the product's
-- discount (DEC-PRD-031).
ALTER TABLE "ProductVariant" ADD COLUMN "offerPricePaisa" INTEGER;
