-- DEC-PRD-039 - an add-on may be counted by a stockroom Item, exactly as a
-- product variant can be (DEC-PRD-032). Null = counted by hand, or unlimited.
ALTER TABLE "AddOn" ADD COLUMN "itemId" TEXT;
ALTER TABLE "AddOn" ADD CONSTRAINT "AddOn_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AddOn_itemId_idx" ON "AddOn"("itemId");
