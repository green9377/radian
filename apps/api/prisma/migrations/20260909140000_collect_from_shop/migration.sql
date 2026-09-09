-- Collect from shop (owner, 9 Sep 2026).
--
-- DeliveryMethodKind.PICKUP - nobody carries it. A delivery METHOD rather than
-- a concept beside one, because price, checkout, orders and reports all key off
-- deliveryMethodId already. The charge is set to 0 in admin; no rule about it
-- is written in code.
--
-- FulfillmentType.PICKUP - ordered online, collected at the shop. Its own value
-- and NOT counter: a counter sale is rung up at the till and Finance treats it
-- differently, while this is a web order that needs no rider. Being outside
-- DELIVERY is what keeps it off the delivery board, and nothing else had to be
-- taught about it.
ALTER TYPE "DeliveryMethodKind" ADD VALUE IF NOT EXISTS 'PICKUP';
ALTER TYPE "FulfillmentType" ADD VALUE IF NOT EXISTS 'PICKUP';
