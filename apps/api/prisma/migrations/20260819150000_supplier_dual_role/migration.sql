-- DEC-SUP-010 (owner, 19 Aug 2026): one tick shows the same supplier in both
-- the Suppliers and Vendors workspaces. One row, one ledger.
ALTER TABLE "Supplier" ADD COLUMN "dualRole" BOOLEAN NOT NULL DEFAULT false;
