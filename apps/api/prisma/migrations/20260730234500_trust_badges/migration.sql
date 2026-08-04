-- The trust strip under the hero (30 Jul 2026)

CREATE TABLE "TrustBadge" (
    "id" TEXT NOT NULL,
    "icon" TEXT,
    "iconUrl" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "zone" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TrustBadge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrustBadge_isActive_sortOrder_idx" ON "TrustBadge"("isActive", "sortOrder");

-- Seeded from TrustStrip.tsx so the strip is identical the moment it goes live.
-- "Secure Payment" and "Real Store in Dhaka" carry no zone: they are true
-- everywhere, and duplicating them per zone would mean editing the same claim
-- twice and eventually having two different versions of it.
INSERT INTO "TrustBadge" ("id", "icon", "title", "subtitle", "zone", "sortOrder", "updatedAt") VALUES
('trb_2hr',    'bolt',  '2-Hour Delivery',     'Anywhere inside Dhaka',    'DHAKA',      0, CURRENT_TIMESTAMP),
('trb_fresh',  'heart', 'Freshness Promise',   'Arranged the same day',    'DHAKA',      1, CURRENT_TIMESTAMP),
('trb_nation', 'truck', 'Nationwide Delivery', 'All 64 districts, 1–3 days','NATIONWIDE', 0, CURRENT_TIMESTAMP),
('trb_pack',   'gift',  'Courier-Safe Packing','Arrives beautiful, always', 'NATIONWIDE', 1, CURRENT_TIMESTAMP),
('trb_pay',    'lock',  'Secure Payment',      'bKash, Nagad and cards',    NULL,         2, CURRENT_TIMESTAMP),
('trb_store',  'store', 'Real Store in Dhaka', 'Visit us seven days a week',NULL,         3, CURRENT_TIMESTAMP);
