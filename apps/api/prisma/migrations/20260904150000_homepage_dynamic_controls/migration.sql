-- Homepage dynamic controls (4 Sep 2026)
--
-- Product.bestSellerSales: delivered website quantity inside the badge window
-- at the last recompute (DEC-PRD-050). The storefront's best-seller rows rank
-- by this, never by the typed-into salesCount.
ALTER TABLE "Product" ADD COLUMN "bestSellerSales" INTEGER NOT NULL DEFAULT 0;

-- StorefrontSetting.announcementAuto: when no announcement banner is live,
-- describe the delivery service (true, the standing behaviour) or hide the bar.
ALTER TABLE "StorefrontSetting" ADD COLUMN "announcementAuto" BOOLEAN NOT NULL DEFAULT true;
