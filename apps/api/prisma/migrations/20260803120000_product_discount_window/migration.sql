-- ─────────────────────────────────────────────────────────────────────────────
--  ছাড়ের শুরু আর শেষের তারিখ — DEC-PRD-028
--  মালিকের নির্দেশ, ৩ আগস্ট ২০২৬:
--
--  > "amra jodi nirdisto product a kono offer chalai like discount, tar
--  >  timing dewar jayga nei - start date and end date.  ja frontend and
--  >  admin panel akoi sathe dekhabe ar kaj korbe."
--
--  আগে product-এ ছাড় বসানো যেত, কিন্তু সেটা **চিরকাল** চলত। তিন দিনের
--  একটা offer মানে ছিল: তারিখ মনে রেখে চতুর্থ দিনে নিজে গিয়ে মুছে দেওয়া।
--  কেউ মনে রাখে না, আর ছাড় মাসের পর মাস চলতে থাকে।
--
--  দুটোই ঐচ্ছিক, প্রতিটার নিজের অর্থ:
--    দুটোই খালি  → এখনই চলছে, শেষ নেই (আগের আচরণ, তাই পুরনো সব সারি অক্ষত)
--    শুধু শুরু    → ওই দিন থেকে
--    শুধু শেষ     → ওই দিন পর্যন্ত
--
--  ⚠️ সময় ফুরালে ছাড়ের সংখ্যাটা মোছা হয় না — শুধু বসে না। তারিখ বাড়ালেই
--  আবার চলবে।
--
--  ⚠️ এটা Offers module-এর বিকল্প নয়। ওটা campaign (coupon, শর্ত, অনুমোদন,
--  অনেক product)। এটা এক product-এর নিজের দাম।
--
--  ** কিছুই মোছা হচ্ছে না। দুটো nullable কলাম। **
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "discountStartsAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "discountEndsAt"   TIMESTAMP(3);
