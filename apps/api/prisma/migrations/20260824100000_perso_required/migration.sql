-- DEC-PRD-048 — "required" becomes a real switch, per product, per box.
--
-- The product page printed the word "required" beside the personalisation
-- section. It was a word written in the code, with no switch behind it and
-- nothing enforcing it: the buttons worked, and the server took the order.
--
-- Owner, 24 August 2026: *"ata asol somossa. required thakar poreo buy now ba
-- add to cart krtache, ata thik krte hobe."*
--
-- FALSE for everything that already exists — that is what those products have
-- always meant, whatever the page said.

ALTER TABLE "Product" ADD COLUMN "persoTextRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "persoImageRequired" BOOLEAN NOT NULL DEFAULT false;
