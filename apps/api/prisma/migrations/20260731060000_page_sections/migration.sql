-- Which sections a page shows, and in what order (31 Jul 2026).
-- Rows are created by PAGE_SECTION_MANIFEST on boot; this only makes the table.

CREATE TABLE "PageSection" (
    "id" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "zone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageSection_page_key_key" ON "PageSection"("page", "key");
CREATE INDEX "PageSection_page_sortOrder_idx" ON "PageSection"("page", "sortOrder");
