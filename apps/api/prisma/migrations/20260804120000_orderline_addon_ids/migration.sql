-- Owner's ruling, 4 Aug 2026: an add-on is sold only if its stock exists.
-- The line must therefore remember WHICH add-ons it carries, by id.
ALTER TABLE "OrderLine" ADD COLUMN "addonIds" TEXT[] NOT NULL DEFAULT '{}';
