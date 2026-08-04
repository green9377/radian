-- Every outside service in one place (ADM-D09, extended)
--
-- The owner's instruction, 30 July: ALL of them here — Facebook, WhatsApp,
-- Google, Meta, everything. Not just payment and courier.
--
-- Three new enum values, one new column, and a COPY of the keys that were
-- living in MessagingSetting and TrackingSetting.
--
-- ---- HOW THIS DOES NOT CREATE TWO SOURCES ----
--
-- The line is CONNECTION vs CONTENT:
--
--   connection  keys, tokens, account numbers, pixel IDs, on/off, sandbox/live
--               -> Integration, owned by Administration
--   content     the WhatsApp message wording, SEO titles, loyalty rates
--               -> stay with Marketing and SEO, which own those rules
--
-- The old columns are NOT dropped. Dropping them in the same release that moves
-- them would leave no way back on a live shop. Instead there is exactly ONE read
-- path — IntegrationsService.credentials() — which checks the new row first and
-- falls back to the old column per field. Nothing else may read those columns.
-- When they are finally removed, only that one method changes.

-- AlterEnum
ALTER TYPE "IntegrationKind" ADD VALUE 'MESSAGING';
ALTER TYPE "IntegrationKind" ADD VALUE 'SOCIAL';
ALTER TYPE "IntegrationKind" ADD VALUE 'ANALYTICS';

-- AlterTable
-- Which provider inside one service: BREVO or RESEND for email, which SMS
-- gateway, which currency an ad account bills in.
ALTER TABLE "Integration" ADD COLUMN "variant" TEXT;
