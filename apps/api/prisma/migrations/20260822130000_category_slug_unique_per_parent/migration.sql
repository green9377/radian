-- DEC-PRD-043 — a category slug is unique WITHIN ITS PARENT, not across the tree.
--
-- Fresh Flowers > Roses and Artificial Flowers > Roses are two different
-- addresses under flat URLs (/fresh-flower/roses, /artificial-flower/roses),
-- so the global unique index was stricter than anything required it to be. It
-- forced invented names like "rose-artificial".

DROP INDEX IF EXISTS "Category_slug_key";

-- sub-categories: unique inside one parent
CREATE UNIQUE INDEX IF NOT EXISTS "Category_parentId_slug_key"
  ON "Category" ("parentId", "slug");

-- ⚠️ Top-level categories need their OWN index. In Postgres every NULL is
-- distinct, so the composite index above does not stop two roots being called
-- "roses" — and they would then fight over radianbd.com/roses. A partial
-- unique index covers exactly that case, and Prisma cannot express it in
-- schema.prisma, so it lives here.
CREATE UNIQUE INDEX IF NOT EXISTS "Category_root_slug_key"
  ON "Category" ("slug") WHERE "parentId" IS NULL;
