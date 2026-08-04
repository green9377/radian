-- ─────────────────────────────────────────────────────────────────────────────
--  DELIVERY-র নাম, আর product-এর সাথে তার সংযোগ
--  DEC-DLV-008, মালিকের নির্দেশ ১ আগস্ট ২০২৬
--
--  > "delivery module-এ যা edit বা change করা হয়, তা যেন auto পুরা system-এ
--  >  কাজ করে — frontend, product upload page, আর যেখানে দরকার সব জায়গায়।"
--
--  এই নির্দেশের একটা সরাসরি মানে আছে: **কেউ নিজের কাছে delivery-র নাম বা
--  দামের কপি রাখতে পারবে না।** আজ পর্যন্ত তিন জায়গায় কপি ছিল —
--    · Product-এ তিনটা boolean (supportsExpress / SameDay / Midnight)
--    · product upload পর্দায় তিনটা লেখা chip
--    · web app-এ METHODS তালিকা, তার নিজের দাম আর slot নিয়ে
--
--  ⚠️ কেন নামের আলাদা টেবিল দরকার হলো।
--  Dhanmondi-র "Same day" আর Gulshan-এর "Same day" দুটো আলাদা সারি, কারণ
--  দাম আলাদা। Product যদি **লেখার** সাথে মিলিয়ে যুক্ত হতো, তাহলে মালিক
--  একদিন "Same day" → "Same-day" করলেই সব product-এর সংযোগ নীরবে ছিঁড়ে
--  যেত — কোনো error নয়, শুধু গ্রাহক আর দ্রুত delivery-র ঘরটা দেখত না।
--  নাম বদলানো যায় এমন জিনিসের উপর সংযোগ বানানো হয় না।
--
--  ⚠️ পুরনো কিছুই মুছছে না। তিনটা boolean এখনো আছে আর এখনো কাজ করছে;
--  পর্দাগুলো নতুন টেবিলে সরে গেলে তখন ওগুলো বাদ যাবে। একই তথ্যের দুই ঘর
--  বেশিদিন রাখা বিপজ্জনক, তাই এটা একটা ধার — শোধ করতে হবে।
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. নামের টেবিল
CREATE TABLE "DeliveryType" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "zone"      "DeliveryZone" NOT NULL,
  "kind"      "DeliveryMethodKind" NOT NULL DEFAULT 'RIDER',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "DeliveryType_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryType_zone_idx" ON "DeliveryType"("zone");
CREATE INDEX "DeliveryType_isActive_idx" ON "DeliveryType"("isActive");

-- 2. প্রতিটা দামের সারি কোন নামের
ALTER TABLE "DeliveryMethod" ADD COLUMN "typeId" TEXT;
CREATE INDEX "DeliveryMethod_typeId_idx" ON "DeliveryMethod"("typeId");
ALTER TABLE "DeliveryMethod"
  ADD CONSTRAINT "DeliveryMethod_typeId_fkey"
  FOREIGN KEY ("typeId") REFERENCES "DeliveryType"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. product ↔ নাম
CREATE TABLE "ProductDeliveryType" (
  "productId" TEXT NOT NULL,
  "typeId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductDeliveryType_pkey" PRIMARY KEY ("productId","typeId")
);

CREATE INDEX "ProductDeliveryType_typeId_idx" ON "ProductDeliveryType"("typeId");

ALTER TABLE "ProductDeliveryType"
  ADD CONSTRAINT "ProductDeliveryType_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductDeliveryType"
  ADD CONSTRAINT "ProductDeliveryType_typeId_fkey"
  FOREIGN KEY ("typeId") REFERENCES "DeliveryType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. BACKFILL — যা আছে তা থেকেই নামগুলো বের করা
--
--    এখন যত দামের সারি আছে, তাদের আলাদা আলাদা (নাম, zone) জোড়া নিয়ে
--    একেকটা নাম বানানো হয়। মালিককে কিছু আবার টাইপ করতে হবে না।
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "DeliveryType" ("id", "name", "zone", "kind", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT
  'dtyp_' || md5(lower(trim(m."label")) || '|' || m."zone"::text),
  min(m."label"),
  m."zone",
  min(m."kind"::text)::"DeliveryMethodKind",
  min(m."sortOrder"),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "DeliveryMethod" m
WHERE m."deletedAt" IS NULL
GROUP BY lower(trim(m."label")), m."zone";

UPDATE "DeliveryMethod" m
SET "typeId" = 'dtyp_' || md5(lower(trim(m."label")) || '|' || m."zone"::text)
WHERE m."deletedAt" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. BACKFILL — product-এর তিনটা boolean থেকে সংযোগ
--
--    ⚠️ নাম মিলিয়ে, আর সেটাই এখানে ঠিক — একবারের জন্য। পুরনো তিনটা
--    boolean-এর নামের সাথে মেলানো ছাড়া আর কোনো সূত্র নেই, কারণ ওগুলোর
--    কোনো id-ই কখনো ছিল না। এর **পরে** সব সংযোগ id দিয়ে চলবে।
--
--    কিছু না মিললে সেই product-এর কোনো সারি বসে না — সেটাই সৎ উত্তর:
--    "এই নামের delivery এই দোকানে নেই"।
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "ProductDeliveryType" ("productId", "typeId", "createdAt")
SELECT p."id", t."id", CURRENT_TIMESTAMP
FROM "Product" p
JOIN "DeliveryType" t ON t."zone" = 'DHAKA' AND (
      (p."supportsExpress"  AND (lower(t."name") LIKE '%hour%'    OR lower(t."name") LIKE '%express%'))
   OR (p."supportsSameDay"  AND  lower(t."name") LIKE '%same%')
   OR (p."supportsMidnight" AND  lower(t."name") LIKE '%midnight%')
)
WHERE p."deletedAt" IS NULL
ON CONFLICT DO NOTHING;
