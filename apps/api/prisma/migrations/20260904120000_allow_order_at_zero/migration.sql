-- "Allow order when stock is 0" (owner, 4 Sep 2026) - one switch for both
-- stock modes. Off by default: nothing changes for any existing product.
ALTER TABLE "Product" ADD COLUMN "allowOrderAtZero" BOOLEAN NOT NULL DEFAULT false;
