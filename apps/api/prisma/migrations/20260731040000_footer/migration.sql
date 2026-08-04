-- Footer and the "More" panel: link columns, social profiles, payment badges.

CREATE TYPE "LinkPlacement" AS ENUM ('FOOTER', 'MORE');

CREATE TABLE "LinkGroup" (
    "id" TEXT NOT NULL,
    "placement" "LinkPlacement" NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LinkGroup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LinkGroup_placement_sortOrder_idx" ON "LinkGroup"("placement", "sortOrder");

CREATE TABLE "NavLink" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "NavLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NavLink_groupId_sortOrder_idx" ON "NavLink"("groupId", "sortOrder");
ALTER TABLE "NavLink" ADD CONSTRAINT "NavLink_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "LinkGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialLink" (
    "id" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentBadge" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentBadge_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StorefrontSetting" ADD COLUMN IF NOT EXISTS "footerTagline" TEXT;
ALTER TABLE "StorefrontSetting" ADD COLUMN IF NOT EXISTS "footerLegal" TEXT;

UPDATE "StorefrontSetting" SET
  "footerTagline" = 'Dhaka''s premium flower and gift studio. Hand-arranged, honestly priced, delivered while the moment still matters.',
  "footerLegal"   = 'Radian Flower & Gift Shop. Made with love in Dhaka.'
WHERE "id" = 'singleton';

-- Seeded from Footer.tsx and MorePanel.tsx exactly as they stand, so nothing
-- moves when the site starts reading from here.
INSERT INTO "LinkGroup" ("id","placement","title","sortOrder","updatedAt") VALUES
('lg_f_shop','FOOTER','Shop',0,CURRENT_TIMESTAMP),
('lg_f_help','FOOTER','Help',1,CURRENT_TIMESTAMP),
('lg_f_co','FOOTER','Company',2,CURRENT_TIMESTAMP),
('lg_m_acct','MORE','Account & Orders',0,CURRENT_TIMESTAMP),
('lg_m_co','MORE','Company & Support',1,CURRENT_TIMESTAMP),
('lg_m_pol','MORE','Policies',2,CURRENT_TIMESTAMP);

INSERT INTO "NavLink" ("id","groupId","label","href","sortOrder") VALUES
('nl_f1','lg_f_shop','Fresh Flowers','/categories/fresh-flowers',0),
('nl_f2','lg_f_shop','Cakes & Combos','/categories/cakes',1),
('nl_f3','lg_f_shop','Occasions','/occasions',2),
('nl_f4','lg_f_shop','Budget Gifts','/collections/under-1000',3),
('nl_f5','lg_f_shop','Corporate Gifting','/occasions/corporate',4),
('nl_h1','lg_f_help','Delivery Areas','/delivery-info',0),
('nl_h2','lg_f_help','Track My Order','/track',1),
('nl_h3','lg_f_help','FAQs','/faq',2),
('nl_h4','lg_f_help','Returns & Refunds','/refund-policy',3),
('nl_h5','lg_f_help','Contact Us','/contact',4),
('nl_c1','lg_f_co','About Radian','/about',0),
('nl_c2','lg_f_co','Visit Radian Flower & Gift Shop','/#store',1),
('nl_c3','lg_f_co','Journal','/journal',2),
('nl_c4','lg_f_co','Privacy Policy','/privacy-policy',3),
('nl_c5','lg_f_co','Terms of Service','/terms',4),
('nl_m1','lg_m_acct','My Orders','/account/orders',0),
('nl_m2','lg_m_acct','My Addresses','/account/addresses',1),
('nl_m3','lg_m_acct','My Profile','/account/profile',2),
('nl_m4','lg_m_acct','Wishlist','/wishlist',3),
('nl_m5','lg_m_co','About Radian','/about',0),
('nl_m6','lg_m_co','Visit Radian Flower & Gift Shop','/#store',1),
('nl_m7','lg_m_co','FAQs','/faq',2),
('nl_m8','lg_m_co','Delivery Info','/delivery-info',3),
('nl_m9','lg_m_co','Reviews','/#reviews',4),
('nl_m10','lg_m_co','Blog / Journal','/journal',5),
('nl_m11','lg_m_co','Contact Us','/contact',6),
('nl_m12','lg_m_pol','Privacy Policy','/privacy-policy',0),
('nl_m13','lg_m_pol','Terms of Service','/terms',1),
('nl_m14','lg_m_pol','Refund Policy','/refund-policy',2);

-- URLs are left blank: the real profiles are not live yet, and a social icon
-- that goes nowhere is worse than no icon. The storefront hides any row without
-- a URL.
INSERT INTO "SocialLink" ("id","icon","label","url","sortOrder","isActive","updatedAt") VALUES
('so_fb','facebook','Facebook','',0,true,CURRENT_TIMESTAMP),
('so_ig','instagram','Instagram','',1,true,CURRENT_TIMESTAMP),
('so_wa','whatsapp','WhatsApp','',2,true,CURRENT_TIMESTAMP),
('so_msgr','messenger','Messenger','',3,true,CURRENT_TIMESTAMP);

INSERT INTO "PaymentBadge" ("id","label","sortOrder","updatedAt") VALUES
('pb_bkash','bKash',0,CURRENT_TIMESTAMP),
('pb_nagad','Nagad',1,CURRENT_TIMESTAMP),
('pb_rocket','Rocket',2,CURRENT_TIMESTAMP),
('pb_visa','VISA',3,CURRENT_TIMESTAMP),
('pb_mc','Mastercard',4,CURRENT_TIMESTAMP),
('pb_cod','COD',5,CURRENT_TIMESTAMP);
