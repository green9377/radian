-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "metaCampaignIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TrackingSetting" ADD COLUMN     "adAccountId" TEXT,
ADD COLUMN     "adsAccessToken" TEXT,
ADD COLUMN     "adsCurrency" TEXT DEFAULT 'USD',
ADD COLUMN     "adsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AdInsight" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "accountId" TEXT NOT NULL,
    "externalCampaignId" TEXT NOT NULL,
    "externalCampaignName" TEXT,
    "onDate" TIMESTAMP(3) NOT NULL,
    "spendMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdInsight_onDate_idx" ON "AdInsight"("onDate");

-- CreateIndex
CREATE UNIQUE INDEX "AdInsight_platform_accountId_externalCampaignId_onDate_key" ON "AdInsight"("platform", "accountId", "externalCampaignId", "onDate");
