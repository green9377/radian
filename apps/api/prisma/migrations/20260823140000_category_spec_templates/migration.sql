-- DEC-PRD-046 — a category holds SEVERAL named "What's inside" lists.
--
-- Owner, 23 August 2026: *"what's inside a to akhon aktai template kra jay.
-- onk time dekha jay akta category te 4-5 ta thakle subida hoy."*
--
-- Nothing that exists changes meaning: every category with rows gets ONE
-- template holding exactly the rows it has today, so the product pages that
-- inherit them are untouched.

CREATE TABLE "CategorySpecTemplate" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CategorySpecTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CategorySpecTemplate_categoryId_idx" ON "CategorySpecTemplate"("categoryId");

ALTER TABLE "CategorySpecTemplate"
    ADD CONSTRAINT "CategorySpecTemplate_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategorySpec" ADD COLUMN "templateId" TEXT;
CREATE INDEX "CategorySpec_templateId_idx" ON "CategorySpec"("templateId");
ALTER TABLE "CategorySpec"
    ADD CONSTRAINT "CategorySpec_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "CategorySpecTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- One template per category that already has rows, holding all of them.
INSERT INTO "CategorySpecTemplate" ("id", "categoryId", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || s."categoryId"),
       s."categoryId", 'Standard', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "categoryId" FROM "CategorySpec") s;

UPDATE "CategorySpec" cs
SET "templateId" = t."id"
FROM "CategorySpecTemplate" t
WHERE t."categoryId" = cs."categoryId";
