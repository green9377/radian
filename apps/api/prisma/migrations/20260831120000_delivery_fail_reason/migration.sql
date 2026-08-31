-- DEC-DLV-022 - why a delivery failed, picked from a list the owner keeps.
--
-- The owner, 30 Aug 2026: a failed delivery and a reschedule stay ONE action,
-- with the reason recorded. The parcel did not arrive either way; separating
-- them at the door asks staff to make a judgement they cannot make, and the
-- reports can split them afterwards.
--
-- No new table: ReasonMaster already exists and is scoped by `purpose`
-- (WASTAGE and GIFT belong to Inventory). Delivery takes DELIVERY_FAIL and
-- reads nothing else.
--
-- `failReason` stays exactly as it is - it becomes the label snapshot plus any
-- note, so renaming a reason never rewrites what an old parcel said. Existing
-- rows keep their free text and a NULL id, which is honest: nobody picked a
-- reason from a list that did not exist.

ALTER TABLE "DeliveryAssignment" ADD COLUMN IF NOT EXISTS "failReasonId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryAssignment_failReasonId_fkey'
  ) THEN
    ALTER TABLE "DeliveryAssignment"
      ADD CONSTRAINT "DeliveryAssignment_failReasonId_fkey"
      FOREIGN KEY ("failReasonId") REFERENCES "ReasonMaster"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DeliveryAssignment_failReasonId_idx"
  ON "DeliveryAssignment"("failReasonId");

-- The starting list, in the owner's own words (30 Aug): the customer was out,
-- the phone was off, the address was wrong. Plus one for everything else,
-- because a list with no way out gets the nearest wrong answer picked.
-- All four are editable in the admin like any other master (house rule 7).
INSERT INTO "ReasonMaster" ("id", "purpose", "label", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('rsn_dlv_not_home',   'DELIVERY_FAIL', 'Customer was not there',        true, 10, NOW(), NOW()),
  ('rsn_dlv_phone_off',  'DELIVERY_FAIL', 'Phone off / unreachable',       true, 20, NOW(), NOW()),
  ('rsn_dlv_bad_addr',   'DELIVERY_FAIL', 'Address wrong or not found',    true, 30, NOW(), NOW()),
  ('rsn_dlv_refused',    'DELIVERY_FAIL', 'Customer refused the parcel',   true, 40, NOW(), NOW()),
  ('rsn_dlv_other',      'DELIVERY_FAIL', 'Something else (write it down)',true, 90, NOW(), NOW())
ON CONFLICT ("purpose", "label") DO NOTHING;
