-- Craft points + the size heading. Owner decisions, 31 Jul 2026.
--
-- Additive only: one new table and one new nullable column. Nothing is
-- dropped, nothing changes meaning, and the storefront keeps drawing the
-- wording it already ships with until the first row is written.
--
-- 1. CraftPoint   — the three "why buy from us" cards, written once on the
--                   category and overridden on a product that needs its own.
-- 2. Category.sizeLabel — "Bouquet Size" / "Weight" / "Box Size", the heading
--                   above the size chooser.

-- ── 1. CraftPoint ───────────────────────────────────────────────────────────
CREATE TABLE "CraftPoint" (
    "id" TEXT NOT NULL,

    -- exactly one, the same rule as Bundle. Written twice because a rule that
    -- lives only in the service is one careless UPDATE from being untrue.
    "categoryId" TEXT,
    "productId" TEXT,

    "icon" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    -- required by the soft-delete extension whether or not anything is ever
    -- soft-deleted; a table without it stops the API booting
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CraftPoint_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "CraftPoint_one_owner" CHECK (
        ("categoryId" IS NOT NULL AND "productId" IS NULL)
        OR ("categoryId" IS NULL AND "productId" IS NOT NULL)
    )
);

CREATE INDEX "CraftPoint_categoryId_idx" ON "CraftPoint"("categoryId");
CREATE INDEX "CraftPoint_productId_idx" ON "CraftPoint"("productId");

ALTER TABLE "CraftPoint" ADD CONSTRAINT "CraftPoint_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CraftPoint" ADD CONSTRAINT "CraftPoint_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. The size heading ─────────────────────────────────────────────────────
ALTER TABLE "Category" ADD COLUMN "sizeLabel" TEXT;

-- Seeded from the wording the storefront already shows, so the page looks
-- identical the moment it starts reading this column and the owner edits
-- something that is already right rather than filling eight blanks.
-- Only the eight top-level categories the storefront was built around; anything
-- else stays NULL and falls back to a plain "Size".
UPDATE "Category" SET "sizeLabel" = 'Bouquet Size'  WHERE "slug" = 'flowers';
UPDATE "Category" SET "sizeLabel" = 'Cake Weight'   WHERE "slug" = 'cakes';
UPDATE "Category" SET "sizeLabel" = 'Set Size'      WHERE "slug" = 'balloons';
UPDATE "Category" SET "sizeLabel" = 'Box Size'      WHERE "slug" = 'chocolates';
UPDATE "Category" SET "sizeLabel" = 'Hamper Size'   WHERE "slug" = 'giftboxes';
UPDATE "Category" SET "sizeLabel" = 'Combo Size'    WHERE "slug" = 'combos';
UPDATE "Category" SET "sizeLabel" = 'Plant Size'    WHERE "slug" = 'plants';
UPDATE "Category" SET "sizeLabel" = 'Size'          WHERE "slug" = 'personalised';
