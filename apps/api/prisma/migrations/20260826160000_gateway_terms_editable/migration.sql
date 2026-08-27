-- Rule 7 - the gateway's terms are SSLCommerz's to change, so they are ours to
-- edit rather than to hardcode. Both were sitting in finance-gateway.service.ts.
--
-- gatewayPayoutMinPaisa: they hold the money until this much has built up
-- (Tk 2,500, read from the merchant panel 26 Aug 2026). Explains a quiet week
-- on the gateway screen; blocks nothing.
--
-- gatewayFeeRateBps: what we EXPECT them to keep (250 = 2.5%).
-- ⚠️ It never computes money - the charge booked on a payment is always the
-- gateway's own `store_amount` (DEC-FIN-029). This is a watchdog: a payment
-- where more was kept than this rate predicts gets flagged for a human.
ALTER TABLE "FinanceSetting" ADD COLUMN IF NOT EXISTS "gatewayPayoutMinPaisa" INTEGER NOT NULL DEFAULT 250000;
ALTER TABLE "FinanceSetting" ADD COLUMN IF NOT EXISTS "gatewayFeeRateBps" INTEGER NOT NULL DEFAULT 250;
