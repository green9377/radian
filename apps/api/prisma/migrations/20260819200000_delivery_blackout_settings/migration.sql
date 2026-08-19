-- DEC-DLV-019/020 (owner, 19 Aug 2026): the Blackout & rules tab stops being
-- a mock. Blackout dates pause delivery for a day (all methods, or one), and
-- the two photo gates become stored, enforced switches.
CREATE TABLE "DeliveryBlackout" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "typeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryBlackout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryBlackout_date_idx" ON "DeliveryBlackout"("date");

ALTER TABLE "DeliveryBlackout" ADD CONSTRAINT "DeliveryBlackout_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "DeliveryType"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DeliverySetting" (
    "id" TEXT NOT NULL,
    "requirePrepPhoto" BOOLEAN NOT NULL DEFAULT false,
    "requireDeliveryPhoto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverySetting_pkey" PRIMARY KEY ("id")
);
