-- DEC-DLV-018 (owner, 19 Aug 2026): method, zone and time slot are each made
-- ONCE; Setup only connects them. This is the slot master table, plus the FK
-- that remembers which master a connected slot came from.
CREATE TABLE "DeliverySlotTemplate" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "cutoffTime" TEXT,
    "capacityPerDay" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DeliverySlotTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DeliverySlot" ADD COLUMN "templateId" TEXT;

ALTER TABLE "DeliverySlot" ADD CONSTRAINT "DeliverySlot_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "DeliverySlotTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DeliverySlot_templateId_idx" ON "DeliverySlot"("templateId");
