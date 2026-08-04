@echo off
REM ============================================================
REM  Email & SMS - database migration
REM
REM  Adds two tables:
REM    MessagingSetting  which provider, the key, who it is from
REM    MessageLog        every message handed to a provider, and
REM                      exactly what the provider said back
REM
REM  NOTHING IS INSTALLED. Every email and SMS service worth
REM  using speaks plain HTTP, so the API talks to all of them
REM  with a normal web request. No npm package, no container
REM  rebuild - which matters, because a rebuild is the sort of
REM  chore that gets postponed for a month.
REM
REM  PROVIDER-AGNOSTIC on purpose. You do not have an account
REM  with any of them yet, and guessing which one you open
REM  would be a coin toss. Pick from a dropdown, paste the key,
REM  press Test. Bangladeshi SMS gateways get swapped on price
REM  two or three times a year - that should be a dropdown, not
REM  a rewrite.
REM
REM  Email:  Brevo · Resend · SendGrid · Mailgun
REM  SMS:    BulkSMSBD · MIM · REVE · or paste any URL
REM
REM  NOTHING SENDS until the channel is switched on AND a key
REM  is saved. A half-configured channel refuses loudly instead
REM  of failing quietly at three in the morning.
REM
REM  Why the log matters, especially for SMS: several gateways
REM  here answer HTTP 200 and put the failure in the body. So
REM  "it returned 200" is not the same as "it was delivered",
REM  and the raw answer is kept either way.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_messaging_migrate.log

echo ===== radian_messaging_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (email_sms)...
docker compose run --rm api npx prisma migrate dev --name email_sms >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_messaging_migrate.log
  pause && exit /b 1
)

echo [4/5] Refreshing the Prisma client and restarting the API...
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [5/5] Waiting for the API, then collecting the log...
timeout /t 30 /nobreak >nul
echo. >> "%LOG%"
echo ===== docker compose ps ===== >> "%LOG%"
docker compose ps >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api log (last 80 lines) ===== >> "%LOG%"
docker compose logs --tail=80 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done.
echo.
echo  Next: Marketing - Email ^& SMS
echo    Nothing works until you open an account somewhere and
echo    paste a key. Brevo is free for 300 emails a day and is
echo    the usual starting point here.
echo.
echo  If the API did not come back up, read
echo    D:\radian\_messaging_migrate.log
echo ============================================================
echo.
pause
