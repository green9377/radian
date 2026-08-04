-- ─────────────────────────────────────────────────────────────────────────────
--  একটা delivery কীভাবে চলে — DEC-DLV-010
--  মালিকের সিদ্ধান্ত, ১ আগস্ট ২০২৬
--
--  মালিকের তিনটা প্রশ্ন, আর তাদের উত্তর:
--
--  ১. *"type-এ যখন 2 hours লিখতাসি, system কীভাবে time-টা calculate করবে?
--      নাম বদলে 3 hours করলে?"*
--     → পারবে না, আর চেষ্টাও করা উচিত নয়। নাম পড়ে "2" বের করলে "3 hours"
--       ঘটনাক্রমে কাজ করত, কিন্তু "দ্রুত ডেলিভারি" লিখলেই চুপচাপ ভেঙে
--       পড়ত — কোনো error ছাড়াই। সংখ্যা যায় `promiseMinutes` ঘরে।
--
--  ২. *"Schedule delivery add করার জায়গা নেই, নতুন type add করারও নেই।"*
--     → পর্দার dropdown-এ চারটা fixed ধরন লেখা ছিল, demo থেকে রয়ে যাওয়া।
--       এখন `timing` — পাঁচটা ছাঁচ, আর যেকোনো নামের নতুন type বানানো যায়।
--
--  ৩. *"২ ঘণ্টার delivery দোকান off/on পর্যন্ত কাজ করবে, তারও একটা সীমা
--      থাকবে — like ১০টা থেকে ৯টা পর্যন্ত। এমন না হলে বিপদ হবে, কারণ
--      দোকান অনেক সময় ১২টা পর্যন্ত খোলা থাকবে, আবার সকাল ৬টায়ও খুলতে পারি।"*
--     → `openFromMin` / `openToMin`. দোকান খোলা থাকা আর delivery চলা এক
--       জিনিস নয়। রাত ১১টায় "২ ঘণ্টায়" মানে রাত ১টা — যে প্রতিশ্রুতি
--       কেউ রাখতে পারবে না।
--
--  ঘড়ি কখন শুরু: **order confirm হওয়ার পর থেকে** — মালিকের পুরনো নিয়ম,
--  আর capacity module-ও ঠিক এভাবেই সময় কাটে। দুটো মিলে যায়।
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "DeliveryTiming" AS ENUM (
  'FROM_CONFIRM',
  'TODAY_SLOT',
  'PICK_DATE_SLOT',
  'PICK_DATE_FIXED',
  'LEAD_DAYS'
);

ALTER TABLE "DeliveryType"
  ADD COLUMN "timing"         "DeliveryTiming" NOT NULL DEFAULT 'TODAY_SLOT',
  ADD COLUMN "promiseMinutes" INTEGER,
  ADD COLUMN "openFromMin"    INTEGER,
  ADD COLUMN "openToMin"      INTEGER;

-- ─────────────────────────────────────────────────────────────────────────────
--  BACKFILL — যে চারটা এখন আছে, তাদের ছাঁচ বসানো
--
--  ⚠️ নাম মিলিয়ে, আর একবারের জন্যই। এই সারিগুলোর ছাঁচ কোথাও লেখা ছিল না —
--  ছিল web app-এর hardcoded তালিকায়, আর সেটাই আমরা সরাচ্ছি। এর **পরে**
--  ছাঁচ আসে এই column থেকে, নাম থেকে নয়।
--
--  ২ ঘণ্টার জানালা ১০টা–৯টা বসানো হলো, মালিকের উদাহরণ ধরে। ভুল মনে হলে
--  পর্দা থেকেই বদলানো যাবে — সেটাই তো পুরো কাজটার উদ্দেশ্য।
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "DeliveryType" SET
  "timing"         = 'FROM_CONFIRM',
  "promiseMinutes" = CASE
                       WHEN lower("name") LIKE '%2%' THEN 120
                       WHEN lower("name") LIKE '%3%' THEN 180
                       WHEN lower("name") LIKE '%4%' THEN 240
                       ELSE 120
                     END,
  "openFromMin"    = 600,   -- সকাল ১০টা
  "openToMin"      = 1260   -- রাত ৯টা
WHERE lower("name") LIKE '%hour%' OR lower("name") LIKE '%express%';

UPDATE "DeliveryType" SET "timing" = 'TODAY_SLOT'
WHERE lower("name") LIKE '%same%';

UPDATE "DeliveryType" SET "timing" = 'PICK_DATE_FIXED'
WHERE lower("name") LIKE '%midnight%';

UPDATE "DeliveryType" SET "timing" = 'LEAD_DAYS'
WHERE "kind" = 'COURIER' OR lower("name") LIKE '%courier%' OR lower("name") LIKE '%nationwide%';
