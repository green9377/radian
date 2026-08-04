-- Banners: hero slider, promo strip, announcement bar (30 Jul 2026)

CREATE TYPE "BannerPlacement" AS ENUM ('HERO', 'PROMO', 'ANNOUNCEMENT');

CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "placement" "BannerPlacement" NOT NULL,
    "zone" TEXT,
    "eyebrow" TEXT,
    "titleMain" TEXT,
    "titleAccent" TEXT,
    "lead" TEXT,
    "cta1Label" TEXT,
    "cta1Href" TEXT,
    "cta2Label" TEXT,
    "cta2Href" TEXT,
    "proof" TEXT[],
    "float1Icon" TEXT,
    "float1Title" TEXT,
    "float1Sub" TEXT,
    "float2Icon" TEXT,
    "float2Title" TEXT,
    "float2Sub" TEXT,
    "imageUrl" TEXT,
    "liveFrom" TIMESTAMP(3),
    "liveTo" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Banner_placement_isActive_idx" ON "Banner"("placement", "isActive");

CREATE TABLE "StorefrontSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "heroRotateSeconds" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StorefrontSetting" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP);

-- Seed the two hero slides and the promo strip that were hard-coded in
-- HeroSection.tsx / PromoBanner.tsx / AnnouncementBar.tsx, so the homepage looks
-- the same the moment it starts reading from here. Nothing is lost by
-- connecting; the owner edits from what is already there rather than a blank
-- screen he has to fill before the site looks right again.
INSERT INTO "Banner" ("id", "placement", "zone", "eyebrow", "titleMain", "titleAccent", "lead", "cta1Label", "cta1Href", "cta2Label", "cta2Href", "proof", "float1Icon", "float1Title", "float1Sub", "float2Icon", "float2Title", "float2Sub", "sortOrder", "updatedAt") VALUES
('bnr_hero_dhaka_2hr', 'HERO', 'DHAKA',
 'Dhaka''s fastest flower delivery', 'Say it with flowers, delivered in', '2 hours',
 'Fresh blooms and thoughtful gifts, hand-arranged in our Dhaka studio and delivered while the moment still matters.',
 'Send a gift today', '/products', 'Shop by occasion', '/occasions',
 ARRAY['2-hour delivery', 'Freshness promise', '★ 4.9 on Google'],
 'bolt', 'Ordered 2:14 PM', 'Delivered 3:58 PM · Gulshan',
 'heart', '"She cried happy tears"', 'Anniversary delivery, Dhanmondi', 0, CURRENT_TIMESTAMP),

('bnr_hero_bd_64', 'HERO', 'NATIONWIDE',
 'Nationwide gift delivery', 'Send love to', 'all 64 districts',
 'Courier-safe chocolates, hampers and gift boxes — packed with care in Dhaka, delivered anywhere in Bangladesh in 1–3 days.',
 'Shop nationwide gifts', '/products', 'See what ships nationwide', '/products',
 ARRAY['All 64 districts', 'Courier-safe packing', '★ 4.9 on Google'],
 'truck', 'Ordered from Dhaka', 'Delivered to Sylhet · 2 days',
 'gift', '"Arrived perfectly packed"', 'Gift hamper, Chattogram', 0, CURRENT_TIMESTAMP),

('bnr_promo_valentine', 'PROMO', NULL,
 'Limited season', 'Valentine''s Preview', 'Collection',
 'Reserve the season''s most romantic arrangements before they sell out. Early orders get free midnight delivery.',
 'Explore the collection', '/collections/valentines', NULL, NULL,
 ARRAY[]::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, 0, CURRENT_TIMESTAMP),

('bnr_ann_dhaka', 'ANNOUNCEMENT', 'DHAKA',
 NULL, '⚡ 2-Hour Delivery', 'inside Dhaka · Same Day before 6 PM · Midnight surprises available',
 NULL, NULL, NULL, NULL, NULL, ARRAY[]::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, 0, CURRENT_TIMESTAMP),

('bnr_ann_bd', 'ANNOUNCEMENT', 'NATIONWIDE',
 NULL, '🚚 Nationwide Delivery', 'across Bangladesh · Courier-safe gifts · Delivered in 1–3 days',
 NULL, NULL, NULL, NULL, NULL, ARRAY[]::TEXT[], NULL, NULL, NULL, NULL, NULL, NULL, 0, CURRENT_TIMESTAMP);
