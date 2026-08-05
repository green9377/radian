-- মালিকের সংশোধন (৫ আগস্ট, DEC-INB-008 rev): ৩ মিনিট নয় — উপস্থিতি-ভিত্তিক।
-- Staff inbox-এ active থাকলে AI ৩০ সেকেন্ড দেখে; কেউ না থাকলে সাথে সাথে।
ALTER TABLE "InboxSetting" DROP COLUMN "staffGraceMin";
ALTER TABLE "InboxSetting" ADD COLUMN "staffGraceSec" INTEGER NOT NULL DEFAULT 30;
