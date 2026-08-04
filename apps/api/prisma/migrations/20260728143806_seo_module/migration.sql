-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "noIndex" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "metaTitle" TEXT,
ADD COLUMN     "noIndex" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "ogTitle" TEXT;

-- CreateTable
CREATE TABLE "SeoSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "titleTemplate" TEXT NOT NULL DEFAULT '{page} | Radian Flower & Gift Shop',
    "siteName" TEXT NOT NULL DEFAULT 'Radian',
    "defaultMetaDescription" TEXT,
    "defaultOgImageUrl" TEXT,
    "twitterHandle" TEXT,
    "googleVerification" TEXT,
    "bingVerification" TEXT,
    "robotsExtra" TEXT,
    "allowIndexing" BOOLEAN NOT NULL DEFAULT true,
    "sitemapEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoRedirect" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "permanent" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SeoRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoRedirect_fromPath_key" ON "SeoRedirect"("fromPath");

-- CreateIndex
CREATE INDEX "SeoRedirect_isActive_idx" ON "SeoRedirect"("isActive");
