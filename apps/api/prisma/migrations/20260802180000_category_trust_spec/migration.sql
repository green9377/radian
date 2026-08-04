-- ─────────────────────────────────────────────────────────────────────────────
--  Trust badge আর "What's inside" — category-তে একবার, সব product পায়
--  DEC-PRD-023, মালিকের নির্দেশ ২ আগস্ট ২০২৬
--
--  > "trust badges, whats inside, faq astache but agula admin panel ar koi
--  >  theke astache? ami to kothaw kori nai, just product upload a ache. ami
--  >  chai protita admin panel a jen create kore rakha jay ar akhane jen just
--  >  se data ase. trust badge to ami kono icon kichui custom kore banate
--  >  parchi na, tumi nijer moto kore diye diso."
--
--  কী ভুল ছিল। product page-এর badge আসত `ProductTrustBadge` থেকে, আর সেই
--  সারিগুলো তৈরি হতো product editor-এ **হাতে লেখা template** থেকে — অর্থাৎ
--  আমার বেছে দেওয়া icon আর শব্দ। মালিকের কোথাও কিছু বদলানোর পথ ছিল না, আর
--  নিজের icon দেওয়ার তো প্রশ্নই ওঠে না।
--
--  ⚠️ Storefront → Trust-এর `TrustBadge` টেবিল **অন্য জিনিস** — ওটা
--  homepage-এর strip, গোটা সাইটের, zone ধরে। এটা product page-এর, category
--  ধরে। এক নাম দুই জায়গায় বলে গুলিয়ে ফেলা সহজ, তাই লিখে রাখা হলো।
--
--  নিয়ম bundle আর craft-এর মতোই:
--    category-তে লেখা  → ওই category-র সব product পায়
--    product-এ লেখা    → শুধু সেই product-এ, আর category-রটা **বদলে** বসে
--
--  ⚠️ `ProductTrustBadge.iconUrl` — product-এ override করতে গেলেও যেন নিজের
--  ছবি দেওয়া যায়। নাহলে category-তে সুন্দর icon দিয়ে product-এ override
--  করলেই ছবিটা হারিয়ে যেত।
--
--  ** কিছুই মোছা হচ্ছে না। দুটো নতুন টেবিল, একটা নতুন কলাম। **
-- ─────────────────────────────────────────────────────────────────────────────

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

-- product-এর নিজের badge-এও নিজের ছবি দেওয়ার পথ
ALTER TABLE "ProductTrustBadge" ADD COLUMN IF NOT EXISTS "iconUrl" TEXT;
