-- Vendor products + the number shown on the website. Owner's rulings, 1 Aug 2026.
--
-- Additive only: one enum, four nullable/defaulted columns, one FK. Nothing is
-- dropped, no existing column changes meaning, and every product already in the
-- database keeps behaving exactly as it does today (supplierId NULL,
-- displayQty NULL, isHandmade false, stockDisplay STOCK).
--
--   1. Product.supplierId  — THE VENDOR. Not Item.supplierId; see below.
--   2. Product.displayQty  — the number the website shows, when it is not the
--                            real one.
--
-- ⚠️ TWO MORE COLUMNS WERE DRAFTED HERE AND REMOVED BEFORE THIS RAN.
-- `isHandmade` and `stockDisplay` asked the product page a question it had
-- already been asked: Basics decides Readymade vs Crafted, and Crafted IS
-- handmade. A second switch for the same fact is a second answer waiting to
-- disagree with the first. Daily capacity will read `productType` +
-- `categoryId` instead, and it belongs to its own module, not to one product.
--
-- ⚠️ WHY A SECOND supplierId, WHEN Item ALREADY HAS ONE.
-- They answer different questions and the owner had to say so twice before it
-- landed:
--     Item.supplierId    = "who do we BUY this material from"  (we hold stock)
--     Product.supplierId = "who MAKES this listing for us"     (we hold nothing)
-- A vendor product never becomes an Item, is never counted, and never appears
-- in a stocktake. Routing it through Item would have forced a stockroom record
-- for a cake that is baked in someone else's kitchen.

ALTER TABLE "Product" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "Product" ADD COLUMN "displayQty" INTEGER;

CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- RESTRICT, deliberately. Deleting a vendor who still has live listings should
-- stop and name them, not quietly turn their products into ours.
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
