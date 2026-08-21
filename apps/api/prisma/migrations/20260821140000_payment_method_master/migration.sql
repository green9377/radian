-- DEC-GBL-001 — one payment-method list for the whole Business OS.

CREATE TABLE IF NOT EXISTS "PaymentMethodMaster" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentMethodMaster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethodMaster_code_key" ON "PaymentMethodMaster"("code");

INSERT INTO "PaymentMethodMaster" ("id","code","name","isActive","isSystem","sortOrder","createdAt","updatedAt") VALUES
  ('pm_cash',  'CASH',  'Cash',   true,  false, 10, now(), now()),
  ('pm_bkash', 'BKASH', 'bKash',  true,  false, 20, now(), now()),
  ('pm_nagad', 'NAGAD', 'Nagad',  true,  false, 30, now(), now()),
  ('pm_card',  'CARD',  'Card',   true,  false, 40, now(), now()),
  ('pm_bank',  'BANK',  'Bank',   true,  false, 50, now(), now()),
  ('pm_other', 'OTHER', 'Other',  true,  false, 60, now(), now()),
  ('pm_online','ONLINE','Online payment', true, true, 70, now(), now()),
  ('pm_cod',   'COD',   'Cash on delivery', true, true, 80, now(), now())
ON CONFLICT ("code") DO NOTHING;

-- Carry over what the owner already switched off at the till (DEC-POS-021), so
-- the first day of the global list looks like the last day of the POS-only one.
UPDATE "PaymentMethodMaster" m
   SET "isActive" = false
 WHERE m."code" IN ('CASH','BKASH','NAGAD','CARD')
   AND EXISTS (SELECT 1 FROM "PosSetting" p WHERE COALESCE(array_length(p."enabledMethods", 1), 0) > 0)
   AND NOT EXISTS (
     SELECT 1 FROM "PosSetting" p, unnest(p."enabledMethods") AS e
      WHERE upper(e) = m."code"
   );
