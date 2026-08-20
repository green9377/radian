-- DEC-ADM-012 (owner, 20 Aug 2026) — "See cost prices" is a permission of its own.
--
-- Access nodes answer "which screens". This answers a different question: on the
-- screens a person already has, does the buying price appear at all. The counter
-- forced it — a cashier needs the selling price and has no business knowing the
-- margin, while a manager haggling needs both.
--
-- Default false: nobody sees cost until the owner says so. The owner's own
-- template is opened here, because ADM-RULE-004 says it can never be cut back.
ALTER TABLE "Position" ADD COLUMN "canSeeCost" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Position" SET "canSeeCost" = true WHERE "isOwner" = true;
