-- DEC-ITM-024 (owner, 20 Aug 2026) — "We sell it" and "Sell online" are two doors.
--
-- isSaleable already means the shop sells it (the counter). This says whether the
-- same item may also reach the website's product page. Default true so nothing
-- disappears from a picker the day this ships; the owner switches off the
-- counter-only things (wrapping, decoration) himself.
ALTER TABLE "Item" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT true;
