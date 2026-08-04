-- CreateEnum
CREATE TYPE "PointReason" AS ENUM ('REFERRAL', 'REFERRAL_REVERSED', 'PURCHASE', 'OPENING', 'REDEEMED', 'ADJUSTMENT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReferralState" AS ENUM ('JOINED', 'REWARDED', 'REVERSED');

-- AlterTable
ALTER TABLE "MarketingSetting" ADD COLUMN     "friendDiscountBp" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "friendDiscountMaxPaisa" INTEGER NOT NULL DEFAULT 50000,
ADD COLUMN     "pointValuePaisa" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "referralEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "referralMinOrderPaisa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralPoints" INTEGER NOT NULL DEFAULT 200;

-- CreateTable
CREATE TABLE "TrackingSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "gtmId" TEXT,
    "metaPixelId" TEXT,
    "ga4MeasurementId" TEXT,
    "googleAdsId" TEXT,
    "googleAdsConversionLabel" TEXT,
    "tiktokPixelId" TEXT,
    "snapPixelId" TEXT,
    "pinterestTagId" TEXT,
    "clarityId" TEXT,
    "capiDatasetId" TEXT,
    "capiAccessToken" TEXT,
    "capiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyPoint" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deltaPoints" INTEGER NOT NULL,
    "reason" "PointReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "journalEntryId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referralNo" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "orderId" TEXT,
    "state" "ReferralState" NOT NULL DEFAULT 'JOINED',
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "friendDiscountPaisa" INTEGER NOT NULL DEFAULT 0,
    "rewardedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversedNote" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyPoint_customerId_idx" ON "LoyaltyPoint"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyPoint_reason_idx" ON "LoyaltyPoint"("reason");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_customerId_key" ON "ReferralCode"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referralNo_key" ON "Referral"("referralNo");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_friendId_key" ON "Referral"("friendId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE INDEX "Referral_state_idx" ON "Referral"("state");

-- AddForeignKey
ALTER TABLE "LoyaltyPoint" ADD CONSTRAINT "LoyaltyPoint_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
