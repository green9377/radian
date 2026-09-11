-- Orders: why a delivery failed and what staff decided (audit 11 Sep 2026, item 19).
-- POST /orders/:id/fail accepted { reason, note, decision } from the screen and
-- stored none of it; the CANCEL decision in particular did nothing at all when
-- the order had no active DeliveryAssignment to carry it. Three nullable
-- columns, mirroring DeliveryAssignment.failReason / failDecision so the two
-- records of the same event read the same way.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "failReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "failNote" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "failDecision" TEXT;

-- The All-orders list pages and filters in the database now (audit, P2 server
-- paging). These two indexes are what stop that paging from turning into a
-- sequential scan of every order the shop has ever taken.
CREATE INDEX IF NOT EXISTS "Order_placedAt_idx" ON "Order" ("placedAt");
CREATE INDEX IF NOT EXISTS "Order_deliveredAt_idx" ON "Order" ("deliveredAt");
