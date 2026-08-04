-- Shop opening hours, dated closures, and the last of the "Visit the shop"
-- fields (31 Jul 2026).

ALTER TABLE "CompanySetting" ADD COLUMN IF NOT EXISTS "mapUrl" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN IF NOT EXISTS "whatsappPhone" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN IF NOT EXISTS "shopImageUrl" TEXT;

CREATE TABLE "ShopHour" (
    "id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    -- minutes since midnight: 9 AM = 540, 10 PM = 1320
    "openMin" INTEGER,
    "closeMin" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopHour_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopHour_weekday_key" ON "ShopHour"("weekday");

CREATE TABLE "ShopClosure" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopClosure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopClosure_date_key" ON "ShopClosure"("date");

-- Seven days, 9 AM to 10 PM — what the site claims today ("Open every day,
-- 9 AM – 10 PM · Including Fridays and holidays"). Seeded so the card reads the
-- same the moment it goes live, and so the owner edits rather than fills.
INSERT INTO "ShopHour" ("id","weekday","isClosed","openMin","closeMin","updatedAt") VALUES
('sh_0',0,false,540,1320,CURRENT_TIMESTAMP),
('sh_1',1,false,540,1320,CURRENT_TIMESTAMP),
('sh_2',2,false,540,1320,CURRENT_TIMESTAMP),
('sh_3',3,false,540,1320,CURRENT_TIMESTAMP),
('sh_4',4,false,540,1320,CURRENT_TIMESTAMP),
('sh_5',5,false,540,1320,CURRENT_TIMESTAMP),
('sh_6',6,false,540,1320,CURRENT_TIMESTAMP);
