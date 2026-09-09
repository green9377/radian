-- The customer who closes the gateway tab (owner, 9 Sep 2026).
-- SSLCommerz calls back on success, on failure and on the Cancel button, but a
-- closed tab produces nothing -- so the commonest way to abandon a payment was
-- also the only one the shop never heard about. After this many minutes with
-- the money still missing, the recovery message goes anyway.
ALTER TABLE "MessagingSetting"
  ADD COLUMN IF NOT EXISTS "unpaidAfterMinutes" INTEGER NOT NULL DEFAULT 15;
