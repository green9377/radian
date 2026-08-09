-- DEC-PRD-040 - two more conditions an add-on rule can use.
-- PRICE_RANGE: values = [minPaisa, maxPaisa], either may be empty.
-- PRODUCT:     values = product ids, hand-picked.
ALTER TYPE "AddOnRuleField" ADD VALUE IF NOT EXISTS 'PRICE_RANGE';
ALTER TYPE "AddOnRuleField" ADD VALUE IF NOT EXISTS 'PRODUCT';
