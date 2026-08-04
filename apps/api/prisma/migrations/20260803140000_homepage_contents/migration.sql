-- ─────────────────────────────────────────────────────────────────────────────
--  প্রতিটা section-এর ভিতরে কী থাকবে — মালিকের নির্দেশ, ৩ আগস্ট ২০২৬
--
--  > "amder jotogula section ache sob section amra ata control krte parsi na …
--  >  ami catagory ata home page show krabo or krabo na ata control krte parsi
--  >  na. abr samevabe occasion and person o same vabe … abr need section o
--  >  same."
--
--  Section-টা দেখাবে কি না — সেটা আগে থেকেই ছিল (PageSection)। কিন্তু ভিতরে
--  **কী** থাকবে, সেটার কোনো উত্তর ছিল না। তিনটা section নিজের বিষয়বস্তু বেছে
--  নিচ্ছিল অন্য কাজের জন্য লেখা কলাম দেখে:
--
--    Occasions  → TagGroup.displayStyle == CARD  (ওটা বলে *কীভাবে আঁকা হবে*,
--                 homepage-এ থাকবে কি না নয়)
--    Need It…   → DeliveryMethod.isActive        (ওটা বলে দোকান এই delivery
--                 *বিক্রি করে* কি না — বিজ্ঞাপন দেয় কি না নয়)
--
--  তিনটা নতুন boolean। Category.isFeatured আগেই ছিল, ওটাই এখন সবার নাম —
--  Brand, Collection, Review-ও একই নাম ব্যবহার করে, তাই schema জুড়ে "homepage-এ
--  আছে" মানে একটাই কলামের নাম।
--
--  ** কিছুই মোছা হচ্ছে না। তিনটা কলাম যোগ হচ্ছে, আর আজকের চেহারা হুবহু
--     রাখার জন্য পুরনো সারিগুলো ভরে দেওয়া হচ্ছে। **
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "TagGroup"       ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tag"            ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeliveryMethod" ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT true;

-- ── আজকের homepage হুবহু ধরে রাখা ────────────────────────────────────────────
--  এটাই এই migration-এর আসল কাজ। column যোগ করা সহজ; মালিক কাল সকালে যেন
--  একই homepage দেখে, সেটাই কঠিন।
--
--  আগের নিয়ম ছিল "displayStyle = CARD হলে tab দেখাও"। সেই নিয়মটাই একবার
--  চালিয়ে নতুন কলামে বসিয়ে দেওয়া হলো। এরপর থেকে displayStyle শুধু চেহারার
--  দায়িত্বে থাকে, আর homepage-এ থাকা না-থাকা মালিক ঠিক করেন।
UPDATE "TagGroup" SET "isFeatured" = ("displayStyle" = 'CARD');

-- Tag আর DeliveryMethod-এর DEFAULT true-ই যথেষ্ট: আগে ওদের সবগুলো সক্রিয় সারি
-- দেখানো হতো, আর true মানে ঠিক তাই। আলাদা UPDATE লাগে না।
