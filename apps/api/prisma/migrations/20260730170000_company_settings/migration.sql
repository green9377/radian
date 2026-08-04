-- Company settings (ADM-D08) — RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md
--
-- One new table, and a COPY of six fields out of FinanceSetting.
--
-- Nothing is dropped. The six columns stay where they are for one release, and
-- the Mushak challan reads the new table first with the old one as a fallback,
-- per field. Mushak 6.3 is a finished, tested government form that was waiting
-- on the BIN alone — moving its data and changing its source in one step is how
-- you find out in an audit that you got it wrong.

-- CreateTable
CREATE TABLE "CompanySetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "legalName" TEXT,
    "tradeName" TEXT,
    "bin" TEXT,
    "tin" TEXT,
    "tradeLicenceNo" TEXT,
    "tradeLicenceExpiry" TIMESTAMP(3),
    "vatCircle" TEXT,
    "registeredAddress" TEXT,
    "operatingAddress" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Bangladesh',
    "publicPhone" TEXT,
    "publicEmail" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "signatoryName" TEXT,
    "signatoryDesignation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("id")
);

-- Carry across whatever the owner already typed into Finance.
--
-- Without this the Company screen would open blank, he would reasonably think
-- the work was lost, and the challan would quietly fall back to Finance while
-- the screen in front of him said nothing was set. One row, once.
INSERT INTO "CompanySetting" (
    "id", "legalName", "registeredAddress", "bin", "vatCircle",
    "signatoryName", "signatoryDesignation", "updatedAt"
)
SELECT
    'singleton',
    NULLIF(TRIM(COALESCE(f."businessName", '')), ''),
    NULLIF(TRIM(COALESCE(f."businessAddress", '')), ''),
    NULLIF(TRIM(COALESCE(f."businessBin", '')), ''),
    NULLIF(TRIM(COALESCE(f."businessVatCircle", '')), ''),
    NULLIF(TRIM(COALESCE(f."signatoryName", '')), ''),
    NULLIF(TRIM(COALESCE(f."signatoryDesignation", '')), ''),
    CURRENT_TIMESTAMP
FROM "FinanceSetting" f
LIMIT 1
ON CONFLICT ("id") DO NOTHING;

-- If Finance has no settings row at all yet, there is still a company.
INSERT INTO "CompanySetting" ("id", "updatedAt")
VALUES ('singleton', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
