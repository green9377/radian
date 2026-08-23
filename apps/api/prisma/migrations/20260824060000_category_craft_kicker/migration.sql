-- DEC-WEB-011, second half — the small line above the band's heading is the
-- shop's to write too.
--
-- Owner, one message after the heading was made editable: *"Why buy from us —
-- ataw jen customizable hoy sevabe thik kro."* The same fault, one line up:
-- "WHY BUY FROM US" was wording I chose, printed on his shop, unchangeable.
--
-- NULL on purpose. A blank kicker draws no kicker, so no category inherits a
-- label nobody picked.

ALTER TABLE "Category" ADD COLUMN "craftKicker" TEXT;
