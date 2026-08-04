-- Sections the owner adds himself (31 Jul 2026).

CREATE TYPE "BlockType" AS ENUM ('PRODUCT_ROW', 'COLLECTION_ROW', 'BANNER_STRIP');

ALTER TABLE "PageSection" ADD COLUMN IF NOT EXISTS "blockType" "BlockType";
ALTER TABLE "PageSection" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "PageSection" ADD COLUMN IF NOT EXISTS "subtitle" TEXT;
ALTER TABLE "PageSection" ADD COLUMN IF NOT EXISTS "config" JSONB;
