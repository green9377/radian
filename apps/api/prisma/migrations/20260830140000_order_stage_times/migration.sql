-- DEC-SAL-016 - when each step of an order actually happened.
--
-- The two status columns say WHERE an order is; these say WHEN it got there.
-- Needed by the customer's own order page (which had no live status at all),
-- by promisedBy's own on-time comparison, and by DEC-DLV-023's missed-promise
-- list.
--
-- Every existing order gets NULL. That is honest: nobody recorded these
-- moments, so nothing here may pretend to know them. A NULL reads as "not
-- reached" everywhere, which for a delivered old order means its tracker
-- shows the step without a time rather than an invented one.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmedAt"      TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "preparingAt"      TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "outForDeliveryAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt"      TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelledAt"      TIMESTAMP(3);
