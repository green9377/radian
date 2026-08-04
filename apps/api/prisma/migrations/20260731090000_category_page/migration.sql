-- Category page, part 1 of the connection (31 Jul 2026).
--
-- Three changes, all additive. Nothing is dropped and no existing column
-- changes meaning, so this can be applied to a live database without a
-- backfill step and without the storefront noticing.
--
--   1. CategoryFaq      — D-CAT-03. A category's own questions.
--   2. Product.variantValueId — D-CAT-01. The colour, from the master.
--   3. VariantValue.imageUrl  — the PHOTO display mode had no image to show.

-- ── 1. CategoryFaq ──────────────────────────────────────────────────────────
CREATE TABLE "CategoryFaq" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    -- the soft-delete extension puts `deletedAt: null` into every findMany;
    -- a table without the column stops the API booting at all
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CategoryFaq_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CategoryFaq_categoryId_sortOrder_idx" ON "CategoryFaq"("categoryId", "sortOrder");

ALTER TABLE "CategoryFaq" ADD CONSTRAINT "CategoryFaq_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. Product.variantValueId ───────────────────────────────────────────────
-- Nullable on purpose and permanently: most gifts have no colour worth
-- filtering by, and a chocolate box forced to carry one would put noise in
-- every colour grid on the site.
--
-- ON DELETE SET NULL, not CASCADE. Deleting the colour "Red" must never delete
-- the red roses. The products simply stop being red.
ALTER TABLE "Product" ADD COLUMN "variantValueId" TEXT;

ALTER TABLE "Product" ADD CONSTRAINT "Product_variantValueId_fkey"
  FOREIGN KEY ("variantValueId") REFERENCES "VariantValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- the colour grid always asks both at once: "red things, in this category"
CREATE INDEX "Product_variantValueId_categoryId_idx" ON "Product"("variantValueId", "categoryId");

-- ── 3. VariantValue.imageUrl ────────────────────────────────────────────────
-- The attribute screen has offered SWATCH / PHOTO / TEXT since it was built,
-- but PHOTO had nowhere to keep a photo — the mode looked available and
-- silently behaved like TEXT. Same class of fault as the category image box
-- that called URL.createObjectURL and kept nothing.
ALTER TABLE "VariantValue" ADD COLUMN "imageUrl" TEXT;
