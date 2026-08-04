-- ─────────────────────────────────────────────────────────────────────────────
--  প্রতি সময়ের নিজের শুরুর সংখ্যা — DEC-PRD-025-এর সংশোধন
--  ৩ আগস্ট ২০২৬
--
--  ⚠️ এই ফাইলটা কেন আলাদা, আর ভুলটা কী ছিল।
--
--  `20260802200000_sales_perso_customise` প্রথমে লেখা হয়েছিল **একটা**
--  `salesSeed` কলাম নিয়ে। মালিক সেটা চালিয়ে ফেলার পর বললেন প্রতি সময়ের
--  আলাদা সংখ্যা চাই — আর আমি **ওই একই ফাইলটাই বদলে দিলাম**।
--
--  Prisma একবার প্রয়োগ করা migration আর দ্বিতীয়বার চালায় না; সে শুধু
--  নাম আর checksum মনে রাখে। ফলে code চারটে কলাম খুঁজতে লাগল আর database-এ
--  রইল একটা, আর product page-এর প্রতিটা ডাক ভাঙল:
--
--      P2022 — The column `Product.salesSeedToday` does not exist
--
--  শিক্ষা, লিখে রাখা: **প্রয়োগ হয়ে যাওয়া migration কখনো সম্পাদনা করা যায়
--  না।** বদল দরকার হলে নতুন একটা ফাইল — সবসময়।
--
--  ⚠️ পুরনো `salesSeed`-এ যা আছে সেটা `salesSeedAll`-এ সরে যায়। ওটাই
--  একমাত্র ঘর যেটার মেয়াদ ফুরায় না, আর ওই সংখ্যা কবে লেখা হয়েছিল তা কেউ
--  জানে না — "আজকের" বা "এই মাসের" বলে চালিয়ে দিলে সেটা মালিকের সিদ্ধান্ত
--  হতো না। পুরনো কলামটা মোছা হয় না; কেউ আর পড়ে না।
--
--  ** কিছুই মোছা হচ্ছে না। **
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedToday" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedWeek"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedAll"   INTEGER NOT NULL DEFAULT 0;

-- কখন সংখ্যাগুলো বসানো হয়েছিল — "প্রতিদিন নতুন করে শুরু" হওয়ার চাবি
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedAt" TIMESTAMP(3);

-- আগের এক-ঘরের সংখ্যাটা, যদি সেই কলামটা সত্যিই তৈরি হয়ে থাকে
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'Product' AND column_name = 'salesSeed'
  ) THEN
    EXECUTE 'UPDATE "Product" SET "salesSeedAll" = "salesSeed"
              WHERE "salesSeedAll" = 0 AND "salesSeed" > 0';
  END IF;
END $$;

-- ⚠️ perso / customise কলামগুলোও নিশ্চিত করা হচ্ছে। আগের migration-টা
-- মাঝপথে থেমে থাকলে এগুলোর কোনোটা না-ও থাকতে পারে, আর একটা অনুপস্থিত
-- কলাম মানে আবার সেই P2022 — এবার অন্য নাম নিয়ে।
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "persoTitle" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "persoText" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "persoTextLabel" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "persoTextMax" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "persoTextHint" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "persoImage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "persoImageLabel" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "persoImageHint" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "customiseOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "customiseTitle" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "customiseSub" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesWindow') THEN
    CREATE TYPE "SalesWindow" AS ENUM ('TODAY', 'WEEK', 'MONTH', 'ALL');
  END IF;
END $$;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesWindow" "SalesWindow" NOT NULL DEFAULT 'MONTH';

-- একই কারণে category-র দুটো টেবিলও নিশ্চিত করা হচ্ছে
CREATE TABLE IF NOT EXISTS "CategoryTrustBadge" (
  "id"         TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "icon"       TEXT,
  "iconUrl"    TEXT,
  "label"      TEXT NOT NULL,
  "sub"        TEXT,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "deletedAt"  TIMESTAMP(3),
  CONSTRAINT "CategoryTrustBadge_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "CategorySpec" (
  "id"         TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "item"       TEXT NOT NULL,
  "qty"        TEXT NOT NULL,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "deletedAt"  TIMESTAMP(3),
  CONSTRAINT "CategorySpec_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CategoryTrustBadge_categoryId_idx" ON "CategoryTrustBadge"("categoryId");
CREATE INDEX IF NOT EXISTS "CategorySpec_categoryId_idx" ON "CategorySpec"("categoryId");
ALTER TABLE "ProductTrustBadge" ADD COLUMN IF NOT EXISTS "iconUrl" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CategoryTrustBadge_categoryId_fkey') THEN
    ALTER TABLE "CategoryTrustBadge" ADD CONSTRAINT "CategoryTrustBadge_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CategorySpec_categoryId_fkey') THEN
    ALTER TABLE "CategorySpec" ADD CONSTRAINT "CategorySpec_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
