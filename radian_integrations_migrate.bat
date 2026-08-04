@echo off
REM ============================================================
REM  Integrations - database migration  (ADM-D09)
REM
REM  ONE new table, ONE new enum. Nothing is dropped, nothing is
REM  copied, no existing column is touched.
REM
REM  ---- EVERY OUTSIDE SERVICE, GROUPED ----
REM
REM  Your instruction, 30 July: ALL of them here - Facebook,
REM  WhatsApp, Google, Meta, everything. Grouped, not one flat
REM  list, because a flat list makes
REM
REM     "this one moves money"
REM     "this one counts page views"
REM
REM  look like the same kind of setting. Payment is first for
REM  exactly that reason.
REM
REM     PAYMENT     SSLCommerz, bKash, Nagad
REM     COURIER     Pathao, Steadfast, RedX
REM     MESSAGING   WhatsApp Business API, Email, SMS
REM     SOCIAL      Meta Ads, Facebook Page, Instagram, Google Ads
REM     ANALYTICS   Meta Pixel + CAPI, GA4, Google Ads tag, GTM,
REM                 TikTok, Clarity, Snap, Pinterest
REM
REM  ---- HOW A KEY STILL ONLY HAS ONE HOME ----
REM
REM  The line is CONNECTION vs CONTENT:
REM
REM    connection  keys, tokens, account numbers, pixel IDs,
REM                on/off, sandbox-or-live. "Who are we connected
REM                to." -> HERE.
REM    content     the WhatsApp message wording, the SEO titles,
REM                the loyalty rates. "What we send over that
REM                connection." -> stays with Marketing and SEO,
REM                which own those business rules.
REM
REM  Keys that were in MessagingSetting and TrackingSetting are
REM  COPIED here by this migration. The old columns are NOT
REM  dropped - doing that the same day they move would leave no
REM  way back on a live shop. Instead there is exactly ONE read
REM  path on the server (IntegrationsService.credentials), which
REM  checks the new row first and falls back to the old column,
REM  per field. Nothing else is allowed to read them. When they
REM  are finally removed, only that one method changes.
REM
REM  Couriers themselves - names, tracking links - stay in
REM  Delivery's CourierService table. Those are couriers you USE.
REM  This table holds the keys to their APIs, which is a separate
REM  thing: Steadfast works today with no key at all, by typing
REM  the consignment number in by hand.
REM
REM  ---- WHY THERE ARE THREE MIGRATION FILES ----
REM
REM  Postgres refuses to USE a new enum value in the same
REM  transaction that ADDED it. Prisma runs one file per
REM  transaction, so the enum values, the new column and the data
REM  copy have to be separate files - otherwise this fails on your
REM  machine with an error that reads like nothing to do with the
REM  change.
REM
REM  ---- TWO THINGS WORTH KNOWING ABOUT THE DESIGN ----
REM
REM  1. SANDBOX AND LIVE ARE SEPARATE FLAGS, on purpose. A gateway
REM     switched ON with sandbox keys accepts payments that NEVER
REM     ARRIVE. To the customer it looks like a completed order; to
REM     you it looks like a paid order with no money behind it. The
REM     screen shouts about that state in red.
REM
REM  2. A SAVED KEY IS NOT A WORKING KEY. There are separate fields
REM     for "when was this last checked" and "did it work", and
REM     until something checks, the screen says "never checked"
REM     rather than showing a green tick that only means a string
REM     is present.
REM
REM  ---- SECRETS ----
REM
REM  Keys are never sent back to the browser in full - only the
REM  last four characters ("....3f8a"). A key in a JSON response
REM  is a key in the browser cache, in a screenshot, and in
REM  whatever logs that response passed through.
REM
REM  The audit trail records WHICH keys changed and never their
REM  values. A secret written into AuditLog is a secret in a table
REM  nobody thinks of as secret, kept forever, by design.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_integrations_migrate.log

echo ===== radian_integrations_migrate ===== > "%LOG%"
date /t >> "%LOG%" 2>&1
time /t >> "%LOG%" 2>&1

echo.
echo [1/5] Checking Docker...
docker version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Open Docker Desktop, wait for
  echo "Engine running", then run this file again.
  pause && exit /b 1
)

echo [2/5] Making sure the containers are up...
docker compose up -d >> "%LOG%" 2>&1
timeout /t 8 /nobreak >nul

echo [3/5] Running the migration (integrations)...
REM  `deploy`, not `dev` - `dev` is interactive and there is nobody inside
REM  the container to answer it. See radian_administration_migrate.bat.
docker compose run --rm api npx prisma migrate deploy >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_integrations_migrate.log
  echo Nothing was changed.
  pause && exit /b 1
)

echo [4/5] Refreshing the Prisma client and restarting the API...
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [5/5] Waiting for the API, then checking the keys were carried across...
timeout /t 30 /nobreak >nul
echo. >> "%LOG%"
echo ===== the table exists ===== >> "%LOG%"
docker compose exec -T postgres psql -U radian_user -d radian_db -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='Integration';" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== WHAT WAS CARRIED ACROSS ===== >> "%LOG%"
echo ===== (key values are NOT shown - only whether one is set) ===== >> "%LOG%"
docker compose exec -T postgres psql -U radian_user -d radian_db -c "SELECT \"kind\", \"provider\", \"isEnabled\", (\"apiKey\" IS NOT NULL) AS has_key, \"clientId\" FROM \"Integration\" ORDER BY \"kind\", \"provider\";" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== what the OLD columns still hold, to compare against ===== >> "%LOG%"
docker compose exec -T postgres psql -U radian_user -d radian_db -c "SELECT (\"emailApiKey\" IS NOT NULL) AS email_key, (\"smsApiKey\" IS NOT NULL) AS sms_key FROM \"MessagingSetting\" LIMIT 1;" >> "%LOG%" 2>&1
docker compose exec -T postgres psql -U radian_user -d radian_db -c "SELECT \"metaPixelId\", \"ga4MeasurementId\", \"gtmId\", \"adAccountId\" FROM \"TrackingSetting\" LIMIT 1;" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api log (last 60 lines) ===== >> "%LOG%"
docker compose logs --tail=60 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done. One table added, nothing removed.
echo.
echo  WHERE TO LOOK:
echo    Administration - Integrations and keys
echo      - All keys                everything at once
echo      - Payment gateways        SSLCommerz, bKash, Nagad
echo      - Courier and delivery    Pathao, Steadfast, RedX
echo      - Messaging               WhatsApp API, Email, SMS
echo      - Social and ads          Meta Ads, FB Page, Instagram
echo      - Tracking and analytics  Pixel, GA4, GTM, TikTok...
echo.
echo  It will say "Checkout cannot take money" and that is
echo  CORRECT - no payment gateway is switched on yet.
echo.
echo  CHECK THE LOG: anything that was already saved in
echo  Marketing - a pixel ID, an ad account, an email key -
echo  should now appear in the Integration rows too. The two
echo  queries at the bottom of the log are there to compare.
echo  Key VALUES are never printed, only whether one is set.
echo.
echo  ONE THING TO BE CAREFUL OF: sandbox keys and live keys are
echo  different keys. Switching a gateway to LIVE without pasting
echo  the live ones in will simply stop working, and switching it
echo  ON while still in sandbox will take payments that never
echo  arrive. The screen warns about both in red.
echo ============================================================
echo.
pause
