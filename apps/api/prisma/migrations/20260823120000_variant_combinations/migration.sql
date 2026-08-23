-- DEC-PRD-045 — a ProductVariant row becomes a COMBINATION (Medium x Red).
--
-- Owner, 23 August 2026: a bouquet in three sizes, each size in three
-- colours — nine things to sell, each with its own price, its own stock and
-- its own Item. The old shape allowed one value per row and one row per
-- value, so the second axis was impossible.
--
-- Nothing existing changes meaning: every row today holds exactly one value,
-- and after this it holds exactly one value — as a combination of one.

CREATE TABLE "ProductVariantValue" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "variantValueId" TEXT NOT NULL,
    CONSTRAINT "ProductVariantValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductVariantValue_productVariantId_variantValueId_key"
    ON "ProductVariantValue"("productVariantId", "variantValueId");
CREATE INDEX "ProductVariantValue_variantValueId_idx"
    ON "ProductVariantValue"("variantValueId");

ALTER TABLE "ProductVariantValue"
    ADD CONSTRAINT "ProductVariantValue_productVariantId_fkey"
    FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantValue"
    ADD CONSTRAINT "ProductVariantValue_variantValueId_fkey"
    FOREIGN KEY ("variantValueId") REFERENCES "VariantValue"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductVariant" ADD COLUMN "comboKey" TEXT NOT NULL DEFAULT '';

-- Every row that exists becomes a combination of its one value.
INSERT INTO "ProductVariantValue" ("id", "productVariantId", "variantValueId")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", "variantValueId"
FROM "ProductVariant";

UPDATE "ProductVariant" SET "comboKey" = "variantValueId";

-- The pair is what must be unique now. Keeping the old index would keep the
-- second axis impossible: it allows "Medium" only once per product.
DROP INDEX IF EXISTS "ProductVariant_productId_variantValueId_key";
CREATE UNIQUE INDEX "ProductVariant_productId_comboKey_key"
    ON "ProductVariant"("productId", "comboKey");
