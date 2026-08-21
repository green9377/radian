-- DEC-RTN-017 / DEC-RTN-018
-- What goes out of the shop on a replacement, and how much credit was decided.

ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "creditAskPaisa" INTEGER;

CREATE TABLE IF NOT EXISTS "ReturnReplacementLine" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "itemId" TEXT,
  "productId" TEXT,
  "name" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "unitPaisa" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ReturnReplacementLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReturnReplacementLine_returnId_idx" ON "ReturnReplacementLine"("returnId");

ALTER TABLE "ReturnReplacementLine"
  ADD CONSTRAINT "ReturnReplacementLine_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
