-- Category.zone — which zone's homepage shows this category's rail card.
-- null = both zones (the behaviour every existing row keeps).
ALTER TABLE "Category" ADD COLUMN "zone" TEXT;
