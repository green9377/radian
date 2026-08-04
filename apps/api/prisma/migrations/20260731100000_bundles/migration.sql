-- Bundle — "+ Chocolates" on the product page. Owner decision, 31 Jul 2026.
--
-- Additive only. One new table, no existing column changes meaning, nothing is
-- dropped — so this applies to a live database with no backfill and the
-- storefront sees no difference until the first bundle is created.
--
-- THE ONE THING TO UNDERSTAND ABOUT THIS TABLE: it has no price column.
-- A bundle adds a real catalog product, so the price is that product's price,
-- read fresh on every request. What is stored here is only the DISCOUNT the
-- owner gives for taking them together. A stored price would be correct the
-- day it was typed and silently wrong every day after — the chocolate goes to
-- 600 and the bundle keeps selling it at 400.

CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,

    -- exactly one of these two is set:
    --   categoryId → the default for every product in that category
    --   productId  → this one product's own list, replacing the category's
    -- Not expressible as a Prisma-level constraint, so BundleService enforces
    -- it. The CHECK below enforces it in the database as well, because a rule
    -- that lives only in the application is one careless UPDATE from untrue.
    "categoryId" TEXT,
    "productId" TEXT,

    -- the catalog product that gets added
    "addsProductId" TEXT NOT NULL,

    -- "+ Chocolates". NULL falls back to the added product's own name.
    "label" TEXT,

    -- NONE | FLAT | PERCENT — FLAT is paisa, PERCENT is basis points
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" INTEGER NOT NULL DEFAULT 0,

    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isBest" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    -- the soft-delete extension injects `deletedAt: null` into every findMany;
    -- a table without the column stops the API booting at all (SectionText's
    -- lesson, 31 Jul)
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id"),

    -- owner OR category, never both, never neither
    CONSTRAINT "Bundle_one_owner" CHECK (
        ("categoryId" IS NOT NULL AND "productId" IS NULL)
        OR ("categoryId" IS NULL AND "productId" IS NOT NULL)
    ),

    -- a bundle that adds the product it is shown on would offer a second copy
    -- of the same bouquet as an upsell
    CONSTRAINT "Bundle_not_self" CHECK ("productId" IS NULL OR "productId" <> "addsProductId")
);

CREATE INDEX "Bundle_categoryId_idx" ON "Bundle"("categoryId");
CREATE INDEX "Bundle_productId_idx" ON "Bundle"("productId");
CREATE INDEX "Bundle_addsProductId_idx" ON "Bundle"("addsProductId");

ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, deliberately. Deleting a chocolate that eleven bouquet pages offer
-- should stop and say so, not quietly empty eleven bundle rows.
ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_addsProductId_fkey"
    FOREIGN KEY ("addsProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
