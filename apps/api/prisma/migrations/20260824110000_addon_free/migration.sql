-- DEC-PRD-049 — an add-on can be given away on purpose, and a ৳0 one that
-- nobody meant stops being offered.
--
-- Owner, 24 August 2026: *"add on 0 holeo show kre — ata somossa. add on free
-- dewar option o kra lagbe; kichu add on thakbe jegula customer chaile select
-- krle free te pabe."*
--
-- The product page was printing "+৳ 0" on four of six add-ons, every one of
-- them simply not priced yet. Price alone cannot tell "free" from "forgotten",
-- so the shop says which it is.
--
-- FALSE for everything that exists: nothing was deliberately free before this
-- switch existed. A ৳0 add-on therefore disappears from the storefront until
-- the shop either prices it or ticks Free — which is the honest way round,
-- because the other way gives goods away by accident.

ALTER TABLE "AddOn" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;
