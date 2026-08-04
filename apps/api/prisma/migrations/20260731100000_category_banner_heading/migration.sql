-- The big line on the category page (31 Jul 2026).
--
-- The banner was rendering `metaTitle || name`. `metaTitle` is the line written
-- for Google's results page, and `name` is the label in every menu on the site.
-- Neither is the sentence the design asks for — "Send a little get-well warmth"
-- — so there was nowhere to type it.
--
-- Nullable, and the page falls back to `name`, so no category is left blank.
ALTER TABLE "Category" ADD COLUMN "bannerHeading" TEXT;
