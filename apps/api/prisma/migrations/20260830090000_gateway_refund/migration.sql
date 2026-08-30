-- DEC-FIN-031 - a refund may go back through the gateway, not only by hand.
--
-- ⚠️ A gateway refund is ASYNCHRONOUS. SSLCommerz answers "success" when it has
-- ACCEPTED the request, not when the customer has the money; it becomes
-- "refunded" later and only a separate query says so. These two columns are
-- what let the screen show "sent" and "arrived" as different things, instead of
-- telling somebody their money is back before it is.
--
-- Both stay NULL on every hand-sent refund — those leave no trail at the
-- gateway, and that absence is itself the honest record.
ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "gatewayRefundId" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "gatewayRefundStatus" TEXT;

-- The refund method the shop picked. GATEWAY is offered only when the order
-- was really paid online and we still hold the gateway's bankTranId - the
-- service refuses it otherwise rather than writing a refund that never moves.
ALTER TYPE "ReturnRefundMethod" ADD VALUE IF NOT EXISTS 'GATEWAY';
