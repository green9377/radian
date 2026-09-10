-- Delivery photo message (owner, 10 Sep 2026): the photo at the door goes to the customer too
ALTER TYPE "OrderMessageKind" ADD VALUE IF NOT EXISTS 'DELIVERY_PHOTO';
