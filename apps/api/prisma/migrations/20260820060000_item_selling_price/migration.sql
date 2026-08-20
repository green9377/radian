-- DEC-ITM-022 (owner, 20 Aug 2026) — the counter price lives on the Item.
--
-- Everything marked "We sell it" is sellable at the counter, including the
-- services that never get a web listing. The Item therefore needs the price the
-- shop sells at; a Product keeps its own price for the website.
--
-- Nullable on purpose: existing items have no counter price yet, and a made-up
-- number would be worse than an empty box.
ALTER TABLE "Item" ADD COLUMN "sellingPricePaisa" INTEGER;
