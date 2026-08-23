-- DEC-PRD-044 — the nature line becomes a master the owner keeps.
CREATE TABLE "NatureMaster" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "NatureMaster_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NatureMaster_name_key" ON "NatureMaster"("name");

-- the five that were hardcoded in the form, each with the line it should have
-- been filling in all along
INSERT INTO "NatureMaster" ("id","name","label","sortOrder","updatedAt") VALUES
  ('nat_fresh',      'Fresh flower',  '100% Fresh Flowers', 0, CURRENT_TIMESTAMP),
  ('nat_artificial', 'Artificial',    'Premium Artificial', 1, CURRENT_TIMESTAMP),
  ('nat_liveplant',  'Live plant',    'Live Potted Plant',  2, CURRENT_TIMESTAMP),
  ('nat_edible',     'Edible',        'Freshly Made',       3, CURRENT_TIMESTAMP),
  ('nat_handmade',   'Handmade',      'Handmade to Order',  4, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
