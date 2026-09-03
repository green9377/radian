-- INV-RULE-012 / DEC-INV-006, enforced by the database (3 Sep 2026).
--
-- One OPENING per item x warehouse. The service has checked it twice since
-- 30 July and neither check can hold it: assertUntouched asks whether a
-- movement EXISTS, and rows that do not exist yet cannot be locked. Under
-- READ COMMITTED two openings arriving together both read untouched, both
-- insert, both commit - the selftest proves it, stock counted twice.
--
-- WHY PARTIAL: only OPENING is unique per pair. PURCHASE, SALE, ADJUSTMENT
-- repeat and must stay free - an Adjustment is how a wrong opening is
-- corrected, so narrowing to OPENING keeps that door open.
--
-- SAFE ON EXISTING DATA: checked on DEV first - 13 OPENING rows, 13 distinct
-- pairs, zero duplicates. Movements are never soft-deleted, an OPENING is
-- never reversed. Rollback is DROP INDEX.

CREATE UNIQUE INDEX "InventoryMovement_one_opening_per_item_warehouse"
  ON "InventoryMovement" ("itemId", "warehouseId")
  WHERE reason = 'OPENING';
