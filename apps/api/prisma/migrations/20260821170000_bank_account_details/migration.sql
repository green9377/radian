-- DEC-GBL-006 second pass (owner, 21 Aug) — a bank account is not just a
-- number: which bank, whose name, which branch, what routing.

ALTER TABLE "FinanceAccount" ADD COLUMN IF NOT EXISTS "accountHolder" TEXT;
ALTER TABLE "FinanceAccount" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "FinanceAccount" ADD COLUMN IF NOT EXISTS "branchName" TEXT;
ALTER TABLE "FinanceAccount" ADD COLUMN IF NOT EXISTS "routingNo" TEXT;
