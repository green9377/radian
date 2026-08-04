-- Reviews — three sources, moderated (31 Jul 2026).

CREATE TYPE "ReviewSource" AS ENUM ('CUSTOMER', 'SHOP', 'GOOGLE');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "context" TEXT,
    "imageUrl" TEXT,
    "productId" TEXT,
    -- set by the server from the order history, never by a form
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Review_status_isFeatured_sortOrder_idx" ON "Review"("status", "isFeatured", "sortOrder");
CREATE INDEX "Review_productId_idx" ON "Review"("productId");

ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StorefrontSetting" ADD COLUMN IF NOT EXISTS "googleRating" DOUBLE PRECISION;
ALTER TABLE "StorefrontSetting" ADD COLUMN IF NOT EXISTS "googleReviewCount" INTEGER;
ALTER TABLE "StorefrontSetting" ADD COLUMN IF NOT EXISTS "googleProfileUrl" TEXT;

-- ⚠️ NOTHING IS SEEDED HERE, DELIBERATELY — unlike every other migration in
-- this series.
--
-- The four quotes on the homepage today ("Ordered at 9 PM for a midnight
-- surprise…") were invented by whoever built the page. Copying them into the
-- database would turn placeholder text into what looks like shop records, and
-- the next person to read this table would have no way of telling them from
-- real ones.
--
-- So the section starts empty and hides itself. The owner fills it with real
-- words — his own customers', typed in by him — which is what he was advised to
-- do on 30 Jul.
