@echo off
REM ============================================================
REM  Marketing tracking - database migration
REM
REM  Adds ONE table: TrackingSetting.
REM
REM  One row holding every pixel and tag id in one place:
REM    Google Tag Manager, Meta Pixel, Google Analytics 4,
REM    Google Ads, TikTok, Snapchat, Pinterest, Clarity,
REM    plus the Meta Conversions API dataset and token.
REM
REM  Pasted once in the panel, read by the storefront at run
REM  time. A new pixel becomes a paste, not a code change, and
REM  nobody has to open a separate Tag Manager account to add
REM  one.
REM
REM  SAID PLAINLY, because the screen says it too: a pixel is
REM  only worth the events it sees. PageView, ViewContent,
REM  Search and AddToCart will work as soon as the ids are in.
REM  PURCHASE WILL NOT - the storefront cannot create an order
REM  yet, so there is no sale to report. That is the Ecommerce
REM  job, not this one.
REM
REM  Nothing is dropped. One new table, nothing else touched.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_tracking_migrate.log

echo ===== radian_tracking_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (marketing_tracking)...
docker compose run --rm api npx prisma migrate dev --name marketing_tracking >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_tracking_migrate.log
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
echo  Next: Marketing - Tracking codes
echo    Paste the ids you already have. Meta Pixel and GA4 are
echo    the two worth doing first.
echo.
echo  If the API did not come back up, read
echo    D:\radian\_tracking_migrate.log
echo ============================================================
echo.
pause
