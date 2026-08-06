-- হারানো order ফেরানোর নিয়মগুলো MessagingSetting-এ। ৬ আগস্ট ২০২৬।
-- DEC-WA-002…008।
--
-- নতুন টেবিল বানানো হয়নি ইচ্ছাকৃতভাবে — "গ্রাহক কীভাবে খবর পায়" এই
-- singleton-টার কাজই তাই। আর প্রতিটা সংখ্যা এখানে বলে "১৫ মিনিট" বা
-- "২৪ ঘণ্টা" বদলাতে deploy লাগে না (ঘরের নিয়ম ৭)।
--
-- ⚠️ `sweeperEnabled` DEFAULT false — Demo-তে বন্ধই থাকবে। ফ্রি Postgres-এ
-- নিয়মিত জেগে ওঠা query মাসিক compute কোটা কয়েক দিনে শেষ করে দেয়।
-- Real-এ admin থেকে চালু করতে হবে।

ALTER TABLE "MessagingSetting"
  ADD COLUMN "recoveryEnabled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paymentFailedEnabled"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "paymentFailedRetryHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "abandonedEnabled"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "abandonedAfterMinutes"   INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "leadRetentionDays"       INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "sweeperEnabled"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sweeperEveryMinutes"     INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "supportPhone"            TEXT;
