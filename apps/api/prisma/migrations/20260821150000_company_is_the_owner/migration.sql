-- DEC-GBL-003 — who we are is written once, in CompanySetting. Finance kept a
-- second copy of the same government facts; the Mushak reader already prefers
-- the company row, and the writer does now too. This copies anything that only
-- ever got typed into the Finance copy, so nothing is lost.

UPDATE "CompanySetting" c
   SET "legalName"            = COALESCE(NULLIF(TRIM(c."legalName"), ''), NULLIF(TRIM(f."businessName"), '')),
       "bin"                  = COALESCE(NULLIF(TRIM(c."bin"), ''), NULLIF(TRIM(f."businessBin"), '')),
       "registeredAddress"    = COALESCE(NULLIF(TRIM(c."registeredAddress"), ''), NULLIF(TRIM(f."businessAddress"), '')),
       "vatCircle"            = COALESCE(NULLIF(TRIM(c."vatCircle"), ''), NULLIF(TRIM(f."businessVatCircle"), '')),
       "signatoryName"        = COALESCE(NULLIF(TRIM(c."signatoryName"), ''), NULLIF(TRIM(f."signatoryName"), '')),
       "signatoryDesignation" = COALESCE(NULLIF(TRIM(c."signatoryDesignation"), ''), NULLIF(TRIM(f."signatoryDesignation"), ''))
  FROM "FinanceSetting" f
 WHERE c.id = 'singleton';
