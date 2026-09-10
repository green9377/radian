-- Delivery flow (owner, 10 Sep 2026): one-time riders, fail decision, photo update message
ALTER TYPE "AssignmentKind" ADD VALUE IF NOT EXISTS 'ONE_TIME';
ALTER TYPE "OrderMessageKind" ADD VALUE IF NOT EXISTS 'PHOTO_UPDATE';
ALTER TABLE "DeliveryAssignment"
  ADD COLUMN IF NOT EXISTS "platform" TEXT,
  ADD COLUMN IF NOT EXISTS "riderPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "paidCash" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "chargeCustomer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "failDecision" TEXT;
