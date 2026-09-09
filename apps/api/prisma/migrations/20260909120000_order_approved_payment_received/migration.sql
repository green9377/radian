-- Two messages the shop never sent (owner, 9 Sep 2026).
--
-- ORDER_APPROVED  - confirm() changed the status and told the customer nothing.
-- PAYMENT_RECEIVED - money that arrives without settling the bill, saying what
--                    was cleared and what is still owed. This is the only kind
--                    that repeats, once per payment; its `attempt` counts the
--                    payments rather than the retries.
ALTER TYPE "OrderMessageKind" ADD VALUE IF NOT EXISTS 'ORDER_APPROVED';
ALTER TYPE "OrderMessageKind" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
