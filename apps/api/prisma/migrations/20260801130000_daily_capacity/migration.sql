-- Daily capacity. Owner's decisions, 1 Aug 2026.
--
-- The shop can only make so much in a day. Until now nothing knew that, so the
-- website would happily take a fortieth bouquet on a day three people could tie
-- twenty.
--
-- ⚠️ MEASURED IN TIME, NOT IN COUNTS — and the owner arrived at this himself
-- after trying counts first. "50 a day" assumes every job costs the same
-- effort; a 15-minute bunch and a 6-hour installation are both "1". Counting in
-- minutes means whatever mix arrives, the arithmetic works out on its own.
--
-- ⚠️ THE DAY IS NOT 24 HOURS. It is `workers × hoursEach`, which the owner
-- sets. Five people at eight hours is 40 hours; tomorrow it might be three.
-- That was his objection to every other design and it is the right one: when
-- staff changes he edits ONE number, not a table of bands.
--
-- Nothing resets anything at midnight. Each day's bookings are their own rows,
-- so a new day starts empty by construction — no cron, and therefore no cron
-- that silently stops running.

CREATE TABLE "CapacityGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workers" INTEGER NOT NULL DEFAULT 1,
    "hoursEach" INTEGER NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CapacityGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CapacityGroup_name_key" ON "CapacityGroup"("name");

CREATE TABLE "CapacityBooking" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    -- the day the WORK happens, not the day the order arrived. A bouquet
    -- ordered today for Friday is Friday's problem.
    "onDate" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "orderId" TEXT,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapacityBooking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CapacityBooking_groupId_onDate_idx" ON "CapacityBooking"("groupId", "onDate");
CREATE INDEX "CapacityBooking_orderId_idx" ON "CapacityBooking"("orderId");

ALTER TABLE "CapacityBooking" ADD CONSTRAINT "CapacityBooking_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "CapacityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- which team's hours a category's products consume
ALTER TABLE "Category" ADD COLUMN "capacityGroupId" TEXT;
CREATE INDEX "Category_capacityGroupId_idx" ON "Category"("capacityGroupId");
ALTER TABLE "Category" ADD CONSTRAINT "Category_capacityGroupId_fkey"
    FOREIGN KEY ("capacityGroupId") REFERENCES "CapacityGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- how long one takes to make. NULL = nothing to make, so it costs no time.
ALTER TABLE "Product" ADD COLUMN "makeMinutes" INTEGER;
