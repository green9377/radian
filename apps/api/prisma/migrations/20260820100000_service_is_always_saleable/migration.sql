-- ITM-R13 (owner, 20 Aug 2026) — a service exists to be sold.
--
-- "basorghor" was created as a SERVICE and sat there with isSaleable = false, so
-- the till could not see it. A service that cannot be sold is not a thing: it is
-- not bought, not counted and not stocked, so "We sell it" is the only reason it
-- exists at all. The service layer now forces the flag on write; this straightens
-- out the rows that were saved before that rule existed.
UPDATE "Item" SET "isSaleable" = true WHERE "itemType" = 'SERVICE' AND "isSaleable" = false;
