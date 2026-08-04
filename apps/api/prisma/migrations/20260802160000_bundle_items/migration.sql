-- ─────────────────────────────────────────────────────────────────────────────
--  এক bundle-এ কয়েকটা product, আর নিচে একটাই ছাড়ের ঘর
--  DEC-PRD-017, মালিকের সিদ্ধান্ত ২ আগস্ট ২০২৬
--
--  > "akhon ki hocche ami bundle a click kre others product select kre protita
--  >  product a individually discount ditachi. tai na. ata ami chai na.
--  >  ami chai... main product ar sathe ar 1,2,3,4 jai hok je poriman product
--  >  add kri, korar por niche akta discount ghor asbe. sekhane discount dile
--  >  total sob product miliye, main product soho, discount count hobe."
--
--  কী বদলাচ্ছে। এতদিন এক Bundle মানে ছিল **একটা** product আর তার নিজের ছাড়।
--  তাই তিনটে জিনিস দিতে হলে তিনটে সারি হতো, তিনটে আলাদা ছাড় বসত, আর
--  "সব মিলিয়ে এত" বলার কোনো জায়গাই ছিল না। মালিক ঠিক সেটাই চেয়েছেন।
--
--  এখন এক Bundle = কয়েকটা product (BundleItem) + একটাই ছাড়। ছাড়টা বসে
--  main product সহ মোট দামের উপর।
--
--  ⚠️ গ্রাহক একাধিক bundle নিতে পারবেন (মালিকের বাছাই)। তখন main product
--  **প্রথম** bundle-এই ধরা হয়; বাকিগুলোর ছাড় শুধু তাদের নিজের product-এর
--  উপর। নাহলে main দুবার, তিনবার ছাড় পেত আর মোট দাম নিজে থেকেই কমতে থাকত।
--
--  ⚠️ পুরনো সারি ভাঙে না। প্রতিটা bundle-এর `addsProductId` এখানে একটা
--  BundleItem হয়ে বসে যাচ্ছে, তাই আজ যা দেখা যাচ্ছে কাল তাই দেখা যাবে।
--  পুরনো কলামটাও থাকছে — নতুন পর্দা কিছুদিন চলার পর আলাদা pass-এ উঠবে।
--
--  ⚠️ DEC-PRD-016-এর combo টেবিল দুটো (BundleCombo, BundleComboItem) এখন
--  অব্যবহৃত — bundle নিজেই এখন একটা set, আর ছাড় তার নিচেই। টেবিল মোছা
--  হচ্ছে না, শুধু কেউ আর পড়ে না।
--
--  ** কিছুই মোছা হচ্ছে না। একটা নতুন টেবিল আর পুরনো সারির backfill। **
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "BundleItem" (
  "id"            TEXT NOT NULL,
  "bundleId"      TEXT NOT NULL,
  "addsProductId" TEXT NOT NULL,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BundleItem_bundleId_addsProductId_key"
  ON "BundleItem"("bundleId", "addsProductId");
CREATE INDEX IF NOT EXISTS "BundleItem_addsProductId_idx" ON "BundleItem"("addsProductId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BundleItem_bundleId_fkey') THEN
    ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey"
      FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BundleItem_addsProductId_fkey') THEN
    ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_addsProductId_fkey"
      FOREIGN KEY ("addsProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- পুরনো প্রতিটা bundle একটা item পায় — যা দেখা যাচ্ছিল তাই দেখা যাবে
INSERT INTO "BundleItem" ("id", "bundleId", "addsProductId", "sortOrder")
SELECT
  'bit_' || md5(b."id" || b."addsProductId"),
  b."id",
  b."addsProductId",
  0
FROM "Bundle" b
WHERE NOT EXISTS (
  SELECT 1 FROM "BundleItem" i WHERE i."bundleId" = b."id" AND i."addsProductId" = b."addsProductId"
);
