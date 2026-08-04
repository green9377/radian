-- DEC-PRD-014 follow-up: an OrderLine now records WHICH variant was sold,
-- so stock deduction can hit the variant's own shelf instead of the product's.

ALTER TABLE "OrderLine" ADD COLUMN "variantId" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "variantLabel" TEXT;

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OrderLine_variantId_idx" ON "OrderLine"("variantId");
