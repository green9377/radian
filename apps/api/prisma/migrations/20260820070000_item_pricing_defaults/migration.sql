-- DEC-ITM-023 (owner, 20 Aug 2026) — the counter price follows the cost.
--
-- sell = average cost + profit %. The percent is the shop default below; an item
-- may carry its own (markupBp), and an item may still fix an exact price
-- (sellingPricePaisa, added in the previous migration) which then wins over both.

ALTER TABLE "Item" ADD COLUMN "markupBp" INTEGER;

CREATE TABLE "ItemSetting" (
  "id"              TEXT NOT NULL DEFAULT 'singleton',
  "defaultMarkupBp" INTEGER NOT NULL DEFAULT 2000,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemSetting_pkey" PRIMARY KEY ("id")
);
