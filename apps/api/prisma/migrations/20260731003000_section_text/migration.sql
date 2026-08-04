-- Section headings — one store for every section's eyebrow / title / subtitle.
-- Rows are created by SECTION_MANIFEST on boot; this only makes the table.
--
-- `zone` defaults to '' rather than NULL: two NULLs are never equal in
-- Postgres, so a nullable column under UNIQUE(key, zone) would allow any number
-- of "default" rows for the same key — precisely what the constraint is for.

CREATE TABLE "SectionText" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "zone" TEXT NOT NULL DEFAULT '',
    "eyebrow" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    -- Never used for headings, but the soft-delete extension puts
    -- `deletedAt: null` into every findMany. Without the column Prisma throws
    -- "Unknown argument `deletedAt`" and the API will not boot at all.
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SectionText_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectionText_key_zone_key" ON "SectionText"("key", "zone");
