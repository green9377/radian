-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'COUNTER');

-- CreateEnum
CREATE TYPE "PosShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PosCashKind" AS ENUM ('SALE_CASH', 'PAYOUT', 'DROP', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "DeliveryZone" ADD VALUE 'COUNTER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'counter';
ALTER TYPE "PaymentMethod" ADD VALUE 'cash';
ALTER TYPE "PaymentMethod" ADD VALUE 'bkash';
ALTER TYPE "PaymentMethod" ADD VALUE 'nagad';
ALTER TYPE "PaymentMethod" ADD VALUE 'card';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN     "posShiftId" TEXT,
ADD COLUMN     "taxRateBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatPaisa" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PosRegister" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PosRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosShift" (
    "id" TEXT NOT NULL,
    "shiftNo" TEXT NOT NULL,
    "registerId" TEXT,
    "cashierName" TEXT NOT NULL,
    "status" "PosShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingFloatPaisa" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "expectedCashPaisa" INTEGER,
    "countedCashPaisa" INTEGER,
    "overShortPaisa" INTEGER,
    "closeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PosShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCashMovement" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "kind" "PosCashKind" NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "note" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PosCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosHeldCart" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "registerId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PosHeldCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosDiscountRule" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "maxPercent" INTEGER NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PosDiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSetting" (
    "id" TEXT NOT NULL,
    "openingFloatDefaultPaisa" INTEGER NOT NULL DEFAULT 0,
    "defaultTaxRateBps" INTEGER NOT NULL DEFAULT 0,
    "giftReceiptHidePrice" BOOLEAN NOT NULL DEFAULT true,
    "defaultCreditLimitPaisa" INTEGER NOT NULL DEFAULT 0,
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosRegister_code_key" ON "PosRegister"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PosShift_shiftNo_key" ON "PosShift"("shiftNo");

-- CreateIndex
CREATE INDEX "PosShift_status_idx" ON "PosShift"("status");

-- CreateIndex
CREATE INDEX "PosShift_registerId_idx" ON "PosShift"("registerId");

-- CreateIndex
CREATE INDEX "PosCashMovement_shiftId_idx" ON "PosCashMovement"("shiftId");

-- CreateIndex
CREATE INDEX "PosDiscountRule_categoryId_idx" ON "PosDiscountRule"("categoryId");

-- CreateIndex
CREATE INDEX "PosDiscountRule_productId_idx" ON "PosDiscountRule"("productId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_posShiftId_fkey" FOREIGN KEY ("posShiftId") REFERENCES "PosShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosCashMovement" ADD CONSTRAINT "PosCashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
