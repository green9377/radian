-- DEC-GBL-004 — the wastage/gift reasons stop living in the screen.

CREATE TABLE IF NOT EXISTS "ReasonMaster" (
  "id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ReasonMaster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReasonMaster_purpose_label_key" ON "ReasonMaster"("purpose", "label");
CREATE INDEX IF NOT EXISTS "ReasonMaster_purpose_idx" ON "ReasonMaster"("purpose");

INSERT INTO "ReasonMaster" ("id","purpose","label","sortOrder","createdAt","updatedAt") VALUES
  ('rsn_w1','WASTAGE','Rotten',10,now(),now()),
  ('rsn_w2','WASTAGE','Dried out',20,now(),now()),
  ('rsn_w3','WASTAGE','Broken',30,now(),now()),
  ('rsn_w4','WASTAGE','Expired',40,now(),now()),
  ('rsn_w5','WASTAGE','Damaged in transit',50,now(),now()),
  ('rsn_w6','WASTAGE','Other',60,now(),now()),
  ('rsn_g1','GIFT','Marketing',10,now(),now()),
  ('rsn_g2','GIFT','Relationship',20,now(),now()),
  ('rsn_g3','GIFT','Corporate sample',30,now(),now()),
  ('rsn_g4','GIFT','Compensation',40,now(),now()),
  ('rsn_g5','GIFT','Other',50,now(),now())
ON CONFLICT ("purpose","label") DO NOTHING;
