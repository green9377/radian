-- DEC-SAL-013 — what a cancelled order gives back.
--
-- Owner, 25 August 2026: a refund is a share of the money actually RECEIVED,
-- never of the order total. 100% before the workshop starts, 50% after it is
-- made but before the rider leaves, nothing once it is on the road.

CREATE TABLE "SalesSetting" (
  "id"             TEXT NOT NULL DEFAULT 'singleton',
  "beforeStartPct" INTEGER NOT NULL DEFAULT 100,
  "afterStartPct"  INTEGER NOT NULL DEFAULT 50,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SalesSetting" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;
