-- DEC-PRD-061 - the customer's own photograph, on the line it belongs to.
--
-- Product.persoImage (the switch) and the product page's upload box have been
-- there since 2 August; the middle never was. "Tap to upload" put the file
-- NAME into the browser's cart, no file left the device, and this table had no
-- column to hold one - so a product with "photo required" switched on took
-- orders without a photo, because there was nothing to check.
--
-- Old rows get NULL, which reads as "no photo" everywhere. Correct: none of
-- them ever had one.

ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "persoImageUrl" TEXT;
