-- DEC-POS-024: the unit a POS line was sold in, plus the qty converted to the
-- item's counting unit (milli), snapshotted at sale time like PUR-R03.
ALTER TABLE "OrderLine" ADD COLUMN "unitId" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "unitLabel" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "unitQtyMilli" INTEGER;
