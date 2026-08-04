-- CreateEnum
CREATE TYPE "CampaignPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'TIKTOK', 'YOUTUBE', 'INFLUENCER', 'PRINT', 'EVENT', 'PARTNERSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANNED', 'RUNNING', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttributionSource" AS ENUM ('REF_CODE', 'COUPON', 'UTM', 'MANUAL', 'UNATTRIBUTED');

-- CreateEnum
CREATE TYPE "AffiliateType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "CommissionState" AS ENUM ('PENDING', 'AVAILABLE', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutState" AS ENUM ('PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('WHATSAPP', 'PHONE', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "OutreachPurpose" AS ENUM ('OCCASION', 'FOLLOW_UP', 'CORPORATE', 'WIN_BACK', 'OTHER');

-- CreateEnum
CREATE TYPE "OutreachResult" AS ENUM ('SENT', 'REPLIED', 'ORDERED', 'NO_ANSWER', 'REFUSED');

-- AlterEnum
ALTER TYPE "FinSourceType" ADD VALUE 'AFFILIATE';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refCode" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "campaignNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "CampaignPlatform" NOT NULL DEFAULT 'FACEBOOK',
    "status" "CampaignStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budgetPaisa" INTEGER NOT NULL DEFAULT 0,
    "goalNote" TEXT,
    "note" TEXT,
    "offerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "utmKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAttribution" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "campaignId" TEXT,
    "affiliateId" TEXT,
    "source" "AttributionSource" NOT NULL DEFAULT 'UNATTRIBUTED',
    "evidence" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OrderAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "affiliateNo" TEXT NOT NULL,
    "type" "AffiliateType" NOT NULL DEFAULT 'INDIVIDUAL',
    "status" "AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "contactName" TEXT,
    "address" TEXT,
    "note" TEXT,
    "code" TEXT NOT NULL,
    "commissionBp" INTEGER NOT NULL DEFAULT 1000,
    "payoutMethod" TEXT,
    "payoutNumber" TEXT,
    "customerId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "basePaisa" INTEGER NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "state" "CommissionState" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedNote" TEXT,
    "recoveredPayoutId" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "payoutNo" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "recoveredPaisa" INTEGER NOT NULL DEFAULT 0,
    "netPaisa" INTEGER NOT NULL,
    "paidFromId" TEXT NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "state" "PayoutState" NOT NULL DEFAULT 'PAID',
    "journalEntryId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outreach" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "recipientId" TEXT,
    "occasionType" TEXT,
    "occasionDate" TEXT,
    "occasionYear" INTEGER,
    "channel" "OutreachChannel" NOT NULL DEFAULT 'WHATSAPP',
    "purpose" "OutreachPurpose" NOT NULL DEFAULT 'OCCASION',
    "message" TEXT,
    "note" TEXT,
    "result" "OutreachResult" NOT NULL DEFAULT 'SENT',
    "resultOrderId" TEXT,
    "campaignId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Outreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingOptOut" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reason" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MarketingOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultCommissionBp" INTEGER NOT NULL DEFAULT 1000,
    "holdDays" INTEGER NOT NULL DEFAULT 7,
    "minWithdrawPaisa" INTEGER NOT NULL DEFAULT 50000,
    "refWindowDays" INTEGER NOT NULL DEFAULT 30,
    "reminderLeadDays" INTEGER[] DEFAULT ARRAY[7, 3]::INTEGER[],
    "whatsappTemplate" TEXT NOT NULL DEFAULT 'Assalamu alaikum {customer}, Radian theke bolchi. {recipient}-er {occasion} ashche {date} tarikhe. Ei bar ki phool pathabo? — Radian Flower & Gift Shop',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_campaignNo_key" ON "Campaign"("campaignNo");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_startDate_idx" ON "Campaign"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttribution_orderId_key" ON "OrderAttribution"("orderId");

-- CreateIndex
CREATE INDEX "OrderAttribution_campaignId_idx" ON "OrderAttribution"("campaignId");

-- CreateIndex
CREATE INDEX "OrderAttribution_affiliateId_idx" ON "OrderAttribution"("affiliateId");

-- CreateIndex
CREATE INDEX "OrderAttribution_source_idx" ON "OrderAttribution"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_affiliateNo_key" ON "Affiliate"("affiliateNo");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");

-- CreateIndex
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_state_idx" ON "AffiliateCommission"("affiliateId", "state");

-- CreateIndex
CREATE INDEX "AffiliateCommission_state_idx" ON "AffiliateCommission"("state");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommission_orderId_affiliateId_key" ON "AffiliateCommission"("orderId", "affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePayout_payoutNo_key" ON "AffiliatePayout"("payoutNo");

-- CreateIndex
CREATE INDEX "AffiliatePayout_affiliateId_idx" ON "AffiliatePayout"("affiliateId");

-- CreateIndex
CREATE INDEX "Outreach_customerId_idx" ON "Outreach"("customerId");

-- CreateIndex
CREATE INDEX "Outreach_createdAt_idx" ON "Outreach"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Outreach_customerId_recipientId_occasionType_occasionYear_key" ON "Outreach"("customerId", "recipientId", "occasionType", "occasionYear");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingOptOut_customerId_key" ON "MarketingOptOut"("customerId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outreach" ADD CONSTRAINT "Outreach_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingOptOut" ADD CONSTRAINT "MarketingOptOut_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
