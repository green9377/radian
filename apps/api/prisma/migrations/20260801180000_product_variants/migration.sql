-- ─────────────────────────────────────────────────────────────────────────────
--  এক product, অনেক variant — প্রতিটার নিজের ছবি আর মজুদ
--  DEC-PRD-012, মালিকের সিদ্ধান্ত ১ আগস্ট ২০২৬
--
--  > "একটা product যদি কোনো variant না থাকে তখন সেখানে আমি কিছুই choose
--  >  করব না। যখন তার multi variant থাকবে তখন তা show করাব — আর তা একটা
--  >  product page-এ হবে। প্রতিটার আলাদা image আর stock থাকবে।"
--
--  ⚠️ এটা আগের নকশা বদলে দেয়, আর কেন — সেটা লিখে রাখা দরকার।
--
--  আগের নকশা: **প্রতিটা রঙ = আলাদা product**, আর `VariantGroup` দিয়ে তারা
--  একসাথে বাঁধা। product page-এ swatch চাপলে অন্য page-এ চলে যেত। কারণটা
--  ভালো ছিল — প্রতি রঙের নিজের মজুদ, নিজের ছবি, নিজের Google page।
--
--  কিন্তু **product-কে একটা group-এ ঢোকানোর কোনো পর্দা কখনো বানানো হয়নি।**
--  টেবিল ছিল, API সেটা পড়তও, শুধু admin-এ হাতলটা ছিল না। ফল: swatch
--  বাস্তবে কোনোদিন দেখা যায়নি (`variant: null`), আর মালিক ধরেছেন —
--  *"আমরা just উপরের variant থেকে একটাই choose করতে পারি, এটা কেন?"*
--
--  মালিক জেনেই বেছেছেন: এক page, তার ভেতরে সব রঙ। Google-এ তিনটার বদলে
--  একটা page যাবে — সেটাও তাঁকে বলা হয়েছে আর তিনি রাজি।
--
--  ⚠️ দাম কেন nullable। মালিকের কথা: *"same product just color change হলে
--  দাম same থাকবে, আবার kg change হলে বা flavour change হলে আলাদা হবে —
--  এটা depend করে product-wise।"* তাই প্রতিটা রঙে একই সংখ্যা লিখে রাখা
--  হয় না; খালি মানে product-এর মূল দাম। নাহলে একদিন একটা বদলাতে ভুলে
--  যাওয়া হতো আর দুটো দাম পাশাপাশি বসে থাকত।
--
--  ⚠️ পুরনো কিছুই মুছছে না। `Product.variantValueId` আর `VariantGroup`
--  এখনো আছে — পুরনো সারি ভাঙবে না, আর নতুন পর্দা চালু হওয়ার পর ওগুলো
--  আলাদা একটা pass-এ সরানো হবে। একই তথ্যের দুই ঘর একটা ধার, শোধ করতে হবে।
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "ProductVariant" (
  "id"             TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "variantValueId" TEXT NOT NULL,
  "imageUrl"       TEXT,
  "stockQty"       INTEGER NOT NULL DEFAULT 0,
  "pricePaisa"     INTEGER,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- একই product-এ একই মান দুবার বসতে পারে না — "লাল" দুবার মানে দুটো
-- আলাদা মজুদ, আর কোনটা সত্যি তা কেউ বলতে পারবে না।
CREATE UNIQUE INDEX "ProductVariant_productId_variantValueId_key"
  ON "ProductVariant"("productId", "variantValueId");

CREATE INDEX "ProductVariant_productId_idx"      ON "ProductVariant"("productId");
CREATE INDEX "ProductVariant_variantValueId_idx" ON "ProductVariant"("variantValueId");

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_variantValueId_fkey"
  FOREIGN KEY ("variantValueId") REFERENCES "VariantValue"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
--  BACKFILL — যে product-গুলোর ইতিমধ্যে একটা রঙ বাছা আছে
--
--  তাদের সেই একটা রঙ নতুন টেবিলে একটা সারি হয়ে বসে, product-এর নিজের
--  মজুদ নিয়ে। মালিককে কিছু আবার বাছতে হবে না, আর একটামাত্র variant থাকলে
--  product page আগের মতোই দেখাবে।
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "ProductVariant"
  ("id", "productId", "variantValueId", "stockQty", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT
  'pvar_' || md5(p."id" || '|' || p."variantValueId"),
  p."id",
  p."variantValueId",
  p."stockQty",
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Product" p
WHERE p."variantValueId" IS NOT NULL
  AND p."deletedAt" IS NULL
ON CONFLICT DO NOTHING;
