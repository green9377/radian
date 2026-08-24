-- DEC-PRD-050 — Best seller and New arrival become earned badges.
--
-- Owner, 24 August 2026: the badge is decided by a percentage of the
-- product's own category over a 90-day window, with a floor and NO ceiling,
-- and every one of those numbers is editable from admin.

CREATE TYPE "BadgeMode" AS ENUM ('AUTO', 'ALWAYS', 'NEVER');

ALTER TABLE "Product"
  ADD COLUMN "bestSellerMode" "BadgeMode" NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "newArrivalMode" "BadgeMode" NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Whatever was ticked by hand until today was a deliberate choice by the
-- owner, so it is carried across as ALWAYS rather than thrown away. From the
-- next recompute, everything else is decided by the rule.
UPDATE "Product" SET "bestSellerMode" = 'ALWAYS' WHERE "isBestSeller" = true;
UPDATE "Product" SET "newArrivalMode" = 'ALWAYS' WHERE "isNewArrival" = true;

-- A published product with no publish date is treated as having gone live
-- when it was created — the closest true answer available.
UPDATE "Product" SET "publishedAt" = "createdAt" WHERE "isPublished" = true;

CREATE TABLE "MerchSetting" (
  "id"                 TEXT NOT NULL DEFAULT 'singleton',
  "bestSellerDays"     INTEGER NOT NULL DEFAULT 90,
  "bestSellerPercent"  INTEGER NOT NULL DEFAULT 10,
  "bestSellerMinCount" INTEGER NOT NULL DEFAULT 3,
  "bestSellerMinSales" INTEGER NOT NULL DEFAULT 3,
  "newArrivalDays"     INTEGER NOT NULL DEFAULT 21,
  "lastComputedAt"     TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MerchSetting" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;

-- The recompute counts delivered lines per product inside the window; the
-- grids sort by the cached flag.
CREATE INDEX "Product_isBestSeller_idx" ON "Product"("isBestSeller");
CREATE INDEX "Product_publishedAt_idx" ON "Product"("publishedAt");
