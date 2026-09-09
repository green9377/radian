-- Owner, 9 Sep 2026: "agula sob 30 minit porer kahini".
-- One number now governs both roads - the customer who pressed Cancel on the
-- gateway, and the one who closed the tab and produced no callback at all.
-- A shop that says "your payment failed" while you are still typing your card
-- number reads as a shop that has given up on you.
ALTER TABLE "MessagingSetting" ALTER COLUMN "unpaidAfterMinutes" SET DEFAULT 30;
UPDATE "MessagingSetting" SET "unpaidAfterMinutes" = 30 WHERE "unpaidAfterMinutes" = 15;
