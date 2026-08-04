-- ─────────────────────────────────────────────────────────────────────────────
--  COMBO PRICE — কয়েকটা একসাথে নিলে একটা নির্দিষ্ট দাম
--  DEC-PRD-016, মালিকের সিদ্ধান্ত ২ আগস্ট ২০২৬
--
--  > "main product + 1 product combo and combo discount price. main product
--  >  + extra 2, 3, 4 product jodi combo hoy tahole setar price bosbe —
--  >  kotgula product se select korse se hisabe."
--
--  কীভাবে কাজ করে। গ্রাহক আগের মতোই যা খুশি tick করে। সেই set যদি মালিকের
--  লেখা কোনো combo-র সাথে **হুবহু** মেলে, তবে যোগফলের বদলে combo দামটা বসে।
--  না মিললে আগের হিসাব — প্রতিটা add-on-এর নিজের ছাড় যোগ।
--
--  ⚠️ সব combination লিখতে হয় না। ৫টা add-on মানে ৩১টা combination; সেগুলো
--  হাতে লিখতে বললে কেউ লিখবেই না, আর অর্ধেক লেখা তালিকা মানে গ্রাহক কখনো
--  ৩,৩০০ কখনো ৪,২২০ দেখে বুঝতেই পারবে না কেন। তাই মালিক যেগুলো চান শুধু
--  সেগুলোই, বাকিগুলো নিজে থেকেই চলে।
--
--  ⚠️ এখানে ছাড় নয়, **দাম** রাখা হচ্ছে — আর এটা Bundle টেবিলের নিয়মের
--  উল্টো, জেনেই। Bundle-এ ছাড় রাখা হয়েছিল যাতে চকলেটের দাম বাড়লে card
--  পুরনো না হয়। কিন্তু মালিক এখানে পুরো order-এর একটা সংখ্যা চেয়েছেন
--  (তাঁর নিজের বাছাই, বিকল্পটা দেখানোর পরেই)। তাই সংখ্যাটা একদিন পুরনো
--  হতে পারে — এবং সেটা লুকানো হয় না: admin-এ প্রতিটা combo-র পাশে আজকের
--  স্বাভাবিক দাম আর সাশ্রয় হিসাব করে দেখানো হয়।
--
--  ⚠️ জোড়া লাগে Bundle-এর সাথে, Product-এর সাথে নয়। গ্রাহক bundle card
--  tick করে, তাই মেলানোটা ঠিক ওই tick-এর সাথেই হতে হবে।
--
--  ** কিছুই মোছা হচ্ছে না। দুটো নতুন টেবিল। **
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "BundleCombo" (
  "id"         TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "label"      TEXT,
  "pricePaisa" INTEGER NOT NULL,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "deletedAt"  TIMESTAMP(3),
  CONSTRAINT "BundleCombo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BundleComboItem" (
  "id"       TEXT NOT NULL,
  "comboId"  TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  CONSTRAINT "BundleComboItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BundleCombo_productId_idx" ON "BundleCombo"("productId");
CREATE INDEX IF NOT EXISTS "BundleComboItem_bundleId_idx" ON "BundleComboItem"("bundleId");
CREATE UNIQUE INDEX IF NOT EXISTS "BundleComboItem_comboId_bundleId_key"
  ON "BundleComboItem"("comboId", "bundleId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BundleCombo_productId_fkey') THEN
    ALTER TABLE "BundleCombo" ADD CONSTRAINT "BundleCombo_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BundleComboItem_comboId_fkey') THEN
    ALTER TABLE "BundleComboItem" ADD CONSTRAINT "BundleComboItem_comboId_fkey"
      FOREIGN KEY ("comboId") REFERENCES "BundleCombo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BundleComboItem_bundleId_fkey') THEN
    ALTER TABLE "BundleComboItem" ADD CONSTRAINT "BundleComboItem_bundleId_fkey"
      FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
