-- DEC-WEB-011 — the heading over the promise band becomes the shop's to write.
--
-- It shipped as the sentence "Why Dhaka sends flowers with Radian" hardcoded
-- in the component, and the owner caught it the same day: *"why from us a
-- frontend ja ja show krche agula kichui to akhane customizible option show
-- krse na."* House rule 7 — no business wording lives in code.
--
-- Left NULL on purpose. A blank heading draws no heading, so no category
-- silently inherits a sentence nobody chose; each one is written when the shop
-- decides what it wants to say.

ALTER TABLE "Category" ADD COLUMN "craftTitle" TEXT;
