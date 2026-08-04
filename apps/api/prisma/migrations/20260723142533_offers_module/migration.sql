-- CreateEnum
CREATE TYPE "OfferShape" AS ENUM ('SITEWIDE', 'CATEGORY', 'PRODUCT', 'FIRST_ORDER', 'PAYMENT', 'FREE_DELIVERY');

-- CreateEnum
CREATE TYPE "OfferMechanism" AS ENUM ('AUTOMATIC', 'COUPON');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "OfferDiscountType" AS ENUM ('PERCENT', 'FLAT', 'FREE_DELIVERY');

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "offerNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "internalNote" TEXT,
    "publicTitle" TEXT,
    "benefitLine" TEXT,
    "description" TEXT,
    "mechanism" "OfferMechanism" NOT NULL DEFAULT 'AUTOMATIC',
    "shape" "OfferShape" NOT NULL DEFAULT 'SITEWIDE',
    "status" "OfferStatus" NOT NULL DEFAULT 'draft',
    "code" TEXT,
    "discountType" "OfferDiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountPaisa" INTEGER,
    "minSpendPaisa" INTEGER,
    "perCustomerLimit" INTEGER,
    "totalLimit" INTEGER,
    "categoryId" TEXT,
    "paymentMethod" "PaymentMethod",
    "combinable" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scarcity" BOOLEAN NOT NULL DEFAULT false,
    "bonusLines" TEXT[],
    "guaranteeText" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "belowCostFlag" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferRedemption" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT,
    "discountPaisa" INTEGER NOT NULL,
    "freeDelivery" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OfferRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "approvalThresholdBp" INTEGER NOT NULL DEFAULT 2500,
    "defaultCombinable" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OfferProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OfferProducts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_offerNo_key" ON "Offer"("offerNo");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_code_key" ON "Offer"("code");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "Offer_mechanism_idx" ON "Offer"("mechanism");

-- CreateIndex
CREATE INDEX "Offer_categoryId_idx" ON "Offer"("categoryId");

-- CreateIndex
CREATE INDEX "Offer_endsAt_idx" ON "Offer"("endsAt");

-- CreateIndex
CREATE INDEX "OfferRedemption_offerId_idx" ON "OfferRedemption"("offerId");

-- CreateIndex
CREATE INDEX "OfferRedemption_orderId_idx" ON "OfferRedemption"("orderId");

-- CreateIndex
CREATE INDEX "OfferRedemption_customerId_idx" ON "OfferRedemption"("customerId");

-- CreateIndex
CREATE INDEX "_OfferProducts_B_index" ON "_OfferProducts"("B");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRedemption" ADD CONSTRAINT "OfferRedemption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRedemption" ADD CONSTRAINT "OfferRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRedemption" ADD CONSTRAINT "OfferRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OfferProducts" ADD CONSTRAINT "_OfferProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OfferProducts" ADD CONSTRAINT "_OfferProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
