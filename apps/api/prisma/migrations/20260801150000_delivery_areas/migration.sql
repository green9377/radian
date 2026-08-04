-- ─────────────────────────────────────────────────────────────────────────────
--  DELIVERY MODULE — এলাকা, প্রতি এলাকার দাম, প্রতি স্লটের ঘড়ি
--  DEC-DLV-007, মালিকের নির্দেশ ১ আগস্ট ২০২৬
--
--  > "আমাদের delivery module-এ প্রতিটা জিনিসের জন্য আলাদা নিয়ম আছে, charge
--  >  আছে। Product upload page-এ শুধু নামগুলা আসবে, আর কাজ করবে delivery
--  >  module-এর নিয়ম অনুযায়ী।"
--
--  কী পাওয়া গিয়েছিল, ১ আগস্ট:
--    · admin-এর "Zones · types · slots" পর্দাটা পুরোটাই browser-এর ভেতরে
--      demo data নিয়ে বসে ছিল। charge বদলে refresh দিলেই মুছে যেত।
--    · product upload-এর তিনটা chip code-এ লেখা ছিল, delivery module-এর
--      সাথে কোনো সম্পর্ক ছিল না।
--    · checkout-এর তালিকা, charge, slot — সবই web app-এ লেখা ছিল। তাই
--      admin-এ Same day ৳৮০ আর checkout-এ ৳৬০ দেখাত।
--
--  এটা প্রথম ধাপ: টেবিলগুলো বানানো।
--
--  ⚠️ এই migration একা কিছুই বদলায় না — নতুন column সব nullable, নতুন
--  টেবিল খালি। পুরনো সব সারি আগের মতোই কাজ করে। পর্দা আর checkout পরের
--  ধাপে এগুলো পড়া শুরু করবে।
--
--  ⚠️ locked decision যা এটা মেনে চলে:
--    "Delivery Type–Zone availability = fully admin-configurable matrix
--     table (not a hardcoded Dhaka/non-Dhaka boolean)"
--  DeliveryMethod-এর প্রতিটা সারি সেই ছকের একটা ঘর: এই এলাকায় এই ধরনের
--  delivery চলে কি না, আর চললে কত।
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. এলাকার গাছ — মূল zone আর তার ভেতরের এলাকা, একই টেবিলে
CREATE TABLE "DeliveryArea" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "parentId"  TEXT,
  "zone"      "DeliveryZone" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "DeliveryArea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryArea_parentId_idx" ON "DeliveryArea"("parentId");
CREATE INDEX "DeliveryArea_zone_idx" ON "DeliveryArea"("zone");

ALTER TABLE "DeliveryArea"
  ADD CONSTRAINT "DeliveryArea_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "DeliveryArea"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. দাম কোন এলাকার। NULL = পুরো zone-এ একই — আর সেটাই ডিফল্ট, কারণ
--    বেশিরভাগ দোকান ঢাকার সব জায়গায় একই দাম নেয়। তখন checkout-এ গ্রাহককে
--    এলাকা জিজ্ঞেস করার দরকারই পড়ে না।
ALTER TABLE "DeliveryMethod" ADD COLUMN "areaId" TEXT;

CREATE INDEX "DeliveryMethod_areaId_idx" ON "DeliveryMethod"("areaId");

ALTER TABLE "DeliveryMethod"
  ADD CONSTRAINT "DeliveryMethod_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "DeliveryArea"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. স্লটের নিজের সময় আর নিজের শেষ-অর্ডারের ঘড়ি।
--    মিনিটে, "9am - 12pm" লেখায় নয় — checkout-কে হিসাব করতে হয় সময় পেরিয়েছে
--    কি না, আর লেখা দিয়ে হিসাব হয় না।
--    cutoff স্লটে, method-এ নয়: মালিকের পর্দায় সকালের স্লট বন্ধ হয় ৮টায় আর
--    সন্ধ্যারটা ৩টায় — একই দিনে, একই ধরনের delivery-তে।
ALTER TABLE "DeliverySlot"
  ADD COLUMN "startMin"   INTEGER,
  ADD COLUMN "endMin"     INTEGER,
  ADD COLUMN "cutoffTime" TEXT;
