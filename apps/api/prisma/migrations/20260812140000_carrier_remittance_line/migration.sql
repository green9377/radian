-- DEC-DLV-016 / DEC-DLV-017 — settling a carrier, parcel by parcel.
--
-- costRecordedAt exists because costPaisa defaults to 0, so "this delivery cost
-- nothing" and "nobody has entered the cost yet" were the same row. The settle
-- list must tell them apart.
ALTER TABLE "DeliveryAssignment" ADD COLUMN "costRecordedAt" TIMESTAMP(3);

-- One row per parcel in one settlement. A lump sum can say the month is short;
-- only a line can say WHICH parcel's cash never came back.
CREATE TABLE "CarrierRemittanceLine" (
    "id" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "codPaisa" INTEGER NOT NULL DEFAULT 0,
    "chargePaisa" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CarrierRemittanceLine_pkey" PRIMARY KEY ("id")
);

-- a parcel cannot be settled twice in the same remittance
CREATE UNIQUE INDEX "CarrierRemittanceLine_remittanceId_assignmentId_key" ON "CarrierRemittanceLine"("remittanceId", "assignmentId");
CREATE INDEX "CarrierRemittanceLine_assignmentId_idx" ON "CarrierRemittanceLine"("assignmentId");

ALTER TABLE "CarrierRemittanceLine" ADD CONSTRAINT "CarrierRemittanceLine_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "CarrierRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CarrierRemittanceLine" ADD CONSTRAINT "CarrierRemittanceLine_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DeliveryAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
