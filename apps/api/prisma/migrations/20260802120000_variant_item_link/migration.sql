-- ─────────────────────────────────────────────────────────────────────────────
--  প্রতিটা রঙের নিজের stockroom Item
--  DEC-PRD-015, মালিকের সিদ্ধান্ত ২ আগস্ট ২০২৬
--
--  > "manual-টা এখনকার মতোই হোক। আর inventory থেকে যদি আনা লাগে তাহলে
--  >  stock and lead time-এ আমরা যেভাবে inventory থেকে product ডেকেছি
--  >  সেভাবে ডাকবে। ওই option-টা রাখবে।"
--
--  কেন দরকার। DEC-PRD-014-এ ঠিক হলো variant থাকলে variant-এর মজুদই আসল।
--  কিন্তু সেই মজুদ এতদিন কেবল **হাতে লেখা** যেত (`ProductVariant.stockQty`)।
--  দোকানের গোনা যখন Inventory রাখে, তখন হাতে লেখা সংখ্যাটা দ্বিতীয় সত্য
--  হয়ে দাঁড়াত — আর দুটো সত্য মানে একদিন দুটোই ভুল।
--
--  stockroom-এ লাল গোলাপ আর গোলাপি গোলাপ আলাদা জিনিস, আলাদা তাকে, আলাদা
--  গোনা। তাই প্রতিটা variant নিজের Item-এর দিকে দেখায় — product-এর
--  `itemId`-র হুবহু একই ধরন, শুধু এক ধাপ নিচে।
--
--  ⚠️ id দিয়ে জোড়া, SKU লেখা দিয়ে নয় — DEC-ITM-021 স্পষ্ট: Product আর Item
--  আলাদা code রাখে, আর মেলানো হয় FK দিয়ে, "কখনোই SKU-র লেখা মিলিয়ে নয়"।
--
--  ⚠️ NULL থাকা স্বাভাবিক, আর তার মানে আছে: এই রঙের নিজের Item বাছা হয়নি,
--  তখন product-এর নিজের Item-ই ধরা হবে। ফাঁক রাখা হয় না।
--
--  ⚠️ `stockQty` মুছছে না। product-টা Manual-এ ফিরলে ওই সংখ্যাটাই আবার
--  চলবে — রাখা আর দেখানো এক কথা নয়।
--
--  ** কিছুই মোছা হচ্ছে না। একটা কলাম, একটা FK, একটা index। **
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "itemId" TEXT;

CREATE INDEX IF NOT EXISTS "ProductVariant_itemId_idx" ON "ProductVariant"("itemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_itemId_fkey'
  ) THEN
    ALTER TABLE "ProductVariant"
      ADD CONSTRAINT "ProductVariant_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
