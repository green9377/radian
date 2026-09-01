-- DEC-RTN-015 (owner, 31 Aug 2026) — how much of one bill store credit may pay
-- for. Returns owns CustomerCredit, so Returns owns the rule; POS and the
-- website both read it. 10000 = the whole bill; 5000 = half.
ALTER TABLE "ReturnSetting" ADD COLUMN "storeCreditMaxBillBps" INTEGER NOT NULL DEFAULT 5000;
