-- DEC-WEB-006 — which account a website review came from. The phone is what
-- the shopper's session claimed; customerId is set by the SERVER by matching
-- that phone against the customer book, never by the form.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
