-- DEC-CUS-009 — a customer may have a photo; without one the initials stand in.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- DEC-CUS-010 — the year is optional. `date` stays "MM-DD" on purpose: the
-- occasion list and the one-contact-per-year rule both match on it, and a
-- birthday recurs whatever year it started. The year only lets us say
-- "10th anniversary" when the customer volunteered it.
ALTER TABLE "RecipientOccasion" ADD COLUMN IF NOT EXISTS "year" INTEGER;
