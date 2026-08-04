-- Carry the existing keys into Integration (ADM-D09, part 2 of 2)
--
-- ⚠️ WHY THIS IS A SEPARATE MIGRATION FILE AND NOT THE END OF THE LAST ONE.
--
-- Postgres refuses to USE a new enum value in the same transaction that ADDED
-- it: "unsafe use of new value of enum type". Prisma runs each migration file in
-- one transaction, so putting the ALTER TYPE and these INSERTs together would
-- fail on the owner's machine with an error that looks like nothing to do with
-- the change. Two files, two transactions, no trap.
--
-- Everything the owner already typed into Marketing is carried across. Without
-- this the Integrations screen would open blank, he would reasonably conclude
-- the work was lost, and the code would quietly go on reading the old columns
-- while the screen in front of him said nothing was set.
--
-- Rows are only created where something is ACTUALLY SET. An empty row would show
-- as "0/3 keys" instead of honestly showing nothing, and would count as a
-- decision nobody made.

-- ---- MESSAGING: email ----
INSERT INTO "Integration" (
  "id", "kind", "provider", "label", "isEnabled", "isLive",
  "apiKey", "variant", "username", "clientId", "baseUrl", "updatedAt"
)
SELECT
  'int_email_carried', 'MESSAGING', 'EMAIL', 'Email sending',
  m."emailEnabled", true,
  NULLIF(TRIM(COALESCE(m."emailApiKey", '')), ''),
  NULLIF(TRIM(COALESCE(m."emailProvider", '')), ''),
  NULLIF(TRIM(COALESCE(m."emailFromAddress", '')), ''),
  NULLIF(TRIM(COALESCE(m."emailFromName", '')), ''),
  NULLIF(TRIM(COALESCE(m."emailDomain", '')), ''),
  CURRENT_TIMESTAMP
FROM "MessagingSetting" m
WHERE COALESCE(NULLIF(TRIM(COALESCE(m."emailApiKey", '')), ''),
               NULLIF(TRIM(COALESCE(m."emailFromAddress", '')), '')) IS NOT NULL
ON CONFLICT ("kind", "provider") DO NOTHING;

-- ---- MESSAGING: SMS ----
INSERT INTO "Integration" (
  "id", "kind", "provider", "label", "isEnabled", "isLive",
  "apiKey", "variant", "username", "baseUrl", "updatedAt"
)
SELECT
  'int_sms_carried', 'MESSAGING', 'SMS', 'SMS sending',
  m."smsEnabled", true,
  NULLIF(TRIM(COALESCE(m."smsApiKey", '')), ''),
  NULLIF(TRIM(COALESCE(m."smsProvider", '')), ''),
  NULLIF(TRIM(COALESCE(m."smsSenderId", '')), ''),
  NULLIF(TRIM(COALESCE(m."smsCustomUrl", '')), ''),
  CURRENT_TIMESTAMP
FROM "MessagingSetting" m
WHERE NULLIF(TRIM(COALESCE(m."smsApiKey", '')), '') IS NOT NULL
ON CONFLICT ("kind", "provider") DO NOTHING;

-- ---- SOCIAL: Meta Ads ----
INSERT INTO "Integration" (
  "id", "kind", "provider", "label", "isEnabled", "isLive",
  "clientId", "apiKey", "variant", "updatedAt"
)
SELECT
  'int_metaads_carried', 'SOCIAL', 'META_ADS', 'Meta Ads (Facebook & Instagram)',
  t."adsEnabled", true,
  NULLIF(TRIM(COALESCE(t."adAccountId", '')), ''),
  NULLIF(TRIM(COALESCE(t."adsAccessToken", '')), ''),
  NULLIF(TRIM(COALESCE(t."adsCurrency", '')), ''),
  CURRENT_TIMESTAMP
FROM "TrackingSetting" t
WHERE NULLIF(TRIM(COALESCE(t."adAccountId", '')), '') IS NOT NULL
ON CONFLICT ("kind", "provider") DO NOTHING;

-- ---- ANALYTICS: Meta Pixel + Conversions API ----
INSERT INTO "Integration" (
  "id", "kind", "provider", "label", "isEnabled", "isLive",
  "clientId", "username", "apiKey", "updatedAt"
)
SELECT
  'int_metapixel_carried', 'ANALYTICS', 'META_PIXEL', 'Meta Pixel & Conversions API',
  t."enabled", true,
  NULLIF(TRIM(COALESCE(t."metaPixelId", '')), ''),
  NULLIF(TRIM(COALESCE(t."capiDatasetId", '')), ''),
  NULLIF(TRIM(COALESCE(t."capiAccessToken", '')), ''),
  CURRENT_TIMESTAMP
FROM "TrackingSetting" t
WHERE NULLIF(TRIM(COALESCE(t."metaPixelId", '')), '') IS NOT NULL
ON CONFLICT ("kind", "provider") DO NOTHING;

-- ---- ANALYTICS: the single-field ones ----
INSERT INTO "Integration" (
  "id", "kind", "provider", "label", "isEnabled", "isLive", "clientId", "username", "updatedAt"
)
SELECT * FROM (
  SELECT 'int_ga4_carried' AS id, 'ANALYTICS'::"IntegrationKind" AS kind, 'GA4' AS provider,
         'Google Analytics 4' AS label, t."enabled" AS en, true AS live,
         NULLIF(TRIM(COALESCE(t."ga4MeasurementId", '')), '') AS cid,
         NULL::text AS uname, CURRENT_TIMESTAMP AS upd
  FROM "TrackingSetting" t
  UNION ALL
  SELECT 'int_gads_carried', 'ANALYTICS'::"IntegrationKind", 'GOOGLE_ADS_TAG',
         'Google Ads conversion tag', t."enabled", true,
         NULLIF(TRIM(COALESCE(t."googleAdsId", '')), ''),
         NULLIF(TRIM(COALESCE(t."googleAdsConversionLabel", '')), ''), CURRENT_TIMESTAMP
  FROM "TrackingSetting" t
  UNION ALL
  SELECT 'int_gtm_carried', 'ANALYTICS'::"IntegrationKind", 'GTM',
         'Google Tag Manager', t."enabled", true,
         NULLIF(TRIM(COALESCE(t."gtmId", '')), ''), NULL, CURRENT_TIMESTAMP
  FROM "TrackingSetting" t
  UNION ALL
  SELECT 'int_tiktok_carried', 'ANALYTICS'::"IntegrationKind", 'TIKTOK_PIXEL',
         'TikTok Pixel', t."enabled", true,
         NULLIF(TRIM(COALESCE(t."tiktokPixelId", '')), ''), NULL, CURRENT_TIMESTAMP
  FROM "TrackingSetting" t
  UNION ALL
  SELECT 'int_clarity_carried', 'ANALYTICS'::"IntegrationKind", 'CLARITY',
         'Microsoft Clarity', t."enabled", true,
         NULLIF(TRIM(COALESCE(t."clarityId", '')), ''), NULL, CURRENT_TIMESTAMP
  FROM "TrackingSetting" t
  UNION ALL
  SELECT 'int_snap_carried', 'ANALYTICS'::"IntegrationKind", 'SNAP_PIXEL',
         'Snapchat Pixel', t."enabled", true,
         NULLIF(TRIM(COALESCE(t."snapPixelId", '')), ''), NULL, CURRENT_TIMESTAMP
  FROM "TrackingSetting" t
  UNION ALL
  SELECT 'int_pinterest_carried', 'ANALYTICS'::"IntegrationKind", 'PINTEREST_TAG',
         'Pinterest Tag', t."enabled", true,
         NULLIF(TRIM(COALESCE(t."pinterestTagId", '')), ''), NULL, CURRENT_TIMESTAMP
  FROM "TrackingSetting" t
) carried
-- only where the ID is actually set — an empty row is a decision nobody made
WHERE carried.cid IS NOT NULL
ON CONFLICT ("kind", "provider") DO NOTHING;
