-- DEC-POS-018 (owner, 20 Aug 2026) — the counter sells Items, never Products.
--
-- A website order line points at a Product. A counter line points at an Item:
-- everything marked "We sell it", services included, and a service never has a
-- Product. So productId becomes optional and itemId joins it; exactly one of the
-- two is set on any line. Existing rows keep their productId — history is not
-- rewritten, and every old POS sale still reads exactly as it did.

ALTER TABLE "OrderLine" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "OrderLine" ADD COLUMN "itemId" TEXT;

ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OrderLine_itemId_idx" ON "OrderLine"("itemId");

-- a line has to be one thing or the other; neither, or both, is a bug we want
-- to hear about at write time rather than discover in a report
ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_product_or_item"
  CHECK (("productId" IS NOT NULL) <> ("itemId" IS NOT NULL));

-- a return line follows whatever the order line was
ALTER TABLE "SalesReturnLine" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "SalesReturnLine" ADD COLUMN "itemId" TEXT;

-- and a discount cap can now be written against an item or its stockroom category,
-- because that is what a counter line is. Rules already written keep working.
ALTER TABLE "PosDiscountRule" ADD COLUMN "itemId" TEXT;
ALTER TABLE "PosDiscountRule" ADD COLUMN "itemCategoryId" TEXT;
CREATE INDEX "PosDiscountRule_itemId_idx" ON "PosDiscountRule"("itemId");
CREATE INDEX "PosDiscountRule_itemCategoryId_idx" ON "PosDiscountRule"("itemCategoryId");
