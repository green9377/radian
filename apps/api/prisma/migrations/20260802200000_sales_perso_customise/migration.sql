-- ─────────────────────────────────────────────────────────────────────────────
--  তিনটে জিনিস, যেগুলো admin-এ ছিল না বা website পড়ত না
--  DEC-PRD-025 / 026 / 027 — মালিকের নির্দেশ, ২ আগস্ট ২০২৬
--
--  ১. SALES SIGNAL (DEC-PRD-025)
--     > "amra akhane prothome akta fake sale account bosabo like 50, 100,
--     >  1000... tarpor real sell hole se songkhar sathe add hobe. like
--     >  amder stock ar moto, ata tumi vule geso. ar amder akhane just last
--     >  month ache — today sell, week sell, month and all time."
--
--     যা কাজ করত: order delivered হলে `salesCount` বাড়ত।
--     যা করত না: ওই সংখ্যা product page-এ **দেখাতই না**। Page-এ যে
--     "N orders this month", সেটা আলাদা হিসাব — গত ৩০ দিনের সত্যিকারের
--     order, আর ১০-এর কম হলে চুপ। মালিকের বসানো সংখ্যা ওখানে ঢুকত না।
--
--     ⚠️ `salesSeed` কেন নতুন কলাম। `salesCount` চলমান মোট — বিক্রি হলে
--     বাড়ে। সেটাকেই "শুরুর সংখ্যা" ধরলে সপ্তাহের হিসাবে পুরনো বিক্রি দুবার
--     গোনা হতো। `salesSeed` কখনো বদলায় না।
--     দেখানো সংখ্যা = salesSeed + বাছা সময়ের সত্যিকারের order।
--
--     ⚠️ পুরনো সারিতে `salesSeed` = `salesCount` বসানো হচ্ছে, কারণ আজ
--     পর্যন্ত ওই কলামে যা আছে তার প্রায় পুরোটাই হাতে লেখা সংখ্যা। যেসব
--     product-এ ইতিমধ্যে বিক্রি হয়েছে, সেখানে সংখ্যাটা সামান্য বেশি
--     দেখাবে — মালিক চাইলে ঘরটা ঠিক করে দিলেই মিটে যায়।
--
--  ২. PERSONALISATION (DEC-PRD-026)
--     > "amder customize product a kothaw image upload ar kothaw text
--     >  lekhar jayga product page a dite hoy — setar configure korar jayga
--     >  pelam na."
--
--     পাননি কারণ ছিলই না। আর storefront-এর seam-এ সোজা `perso: null` লেখা
--     ছিল — অর্থাৎ কোনো product-এ ওই বাক্স **কখনো** আসেনি। Cart, checkout
--     আর order আগে থেকেই লেখা আর ছবি বয়ে নিয়ে যেত; মাঝের অংশটা ফাঁকা ছিল।
--
--  ৩. "WANT THIS CUSTOMISED?" (DEC-PRD-027)
--     > "amra kon kon product a customize krte dibo ja dile pase whatsapp
--     >  show krbe — ta customize korar option... setao kothao dekhte pelam na."
--
--     সবুজ বাক্সটা **সব** product-এ দেখাত, লেখা আসত category template থেকে,
--     আর নম্বর ছিল wa.me/8801000000000 — আমার বসানো বানানো নম্বর। এখন
--     product-প্রতি switch, আর নম্বর Company settings-এর publicPhone থেকে।
--
--  ** কিছুই মোছা হচ্ছে না। একটা enum আর কয়েকটা কলাম। **
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalesWindow') THEN
    CREATE TYPE "SalesWindow" AS ENUM ('TODAY', 'WEEK', 'MONTH', 'ALL');
  END IF;
END $$;

-- ⚠️ চারটে আলাদা ঘর — মালিকের বাছাই। তাঁর প্রশ্ন ছিল: "today sale 10 দিলাম,
-- সেভাবে week আর month-এ দিলাম — তাহলে today/week/month শেষ হলে কী হবে?"
-- একটাই ঘর রাখলে "আজ ১০" আর "এ মাসে ২০০" একসাথে বলা যেত না।
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedToday" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedWeek"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedAll"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesWindow" "SalesWindow" NOT NULL DEFAULT 'MONTH';

-- ⚠️ কখন সংখ্যাগুলো বসানো হয়েছিল। এটাই "প্রতিদিন নতুন করে শুরু" হওয়ার চাবি —
-- মালিক: "always jodi manush dekhe today 10 sale tahole Google and manush ar
-- kache eta fake hoye jabe.  daily eta restart howai valo."
-- TODAY-র সংখ্যা কেবল সেই দিনটাতেই গোনা হয়, WEEK ৭ দিন, MONTH ৩০ দিন।
-- কোনো cron নেই — পড়ার সময় তারিখ মিলিয়ে নেওয়া কখনো চলতে ভুলে যায় না।
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesSeedAt" TIMESTAMP(3);

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

-- আজ পর্যন্ত `salesCount`-এ যা আছে তার প্রায় পুরোটাই হাতে লেখা সংখ্যা।
-- সেটা "all time"-এ বসানো হলো — ওটাই একমাত্র ঘর যেটা মেয়াদ ফুরায় না, আর
-- পুরনো সংখ্যাটা কবে লেখা হয়েছিল তা কেউ জানে না। "this month"-এ বসালে
-- সেটা আজ থেকে ৩০ দিন গোনা শুরু করত, যা মালিক লেখেননি।
UPDATE "Product" SET "salesSeedAll" = "salesCount"
 WHERE "salesSeedAll" = 0 AND "salesCount" > 0;
