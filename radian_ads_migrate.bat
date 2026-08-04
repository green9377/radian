@echo off
REM ============================================================
REM  Meta ad numbers - database migration
REM
REM  Adds:
REM    AdInsight                one row per Meta campaign per day
REM    TrackingSetting          + ad account id, ads token, currency
REM    Campaign.metaCampaignIds which Meta campaigns belong to ours
REM
REM  NOTHING IS INSTALLED. The Graph API is a normal web request,
REM  so no npm package and no container rebuild.
REM
REM  WHAT THIS IS FOR
REM    What Facebook and Instagram charged, and what it bought -
REM    spend, impressions, clicks, CTR, cost per click, per
REM    campaign, without leaving the panel.
REM
REM  WHAT IT IS NOT: THE MONEY.
REM    Meta reports what it billed in the ad account's currency,
REM    usually US dollars. The bank charges something else once
REM    the conversion rate, the card fee and the government's
REM    levies land. Both are true and they never match.
REM
REM    So nothing here writes to the ledger. The button beside a
REM    campaign opens the Finance expense form with the payee and
REM    the campaign filled in, and a person types what the bank
REM    statement actually says. Finance owns every taka.
REM
REM    If the ad account bills in dollars, the amount is left
REM    BLANK on purpose. A dollar figure sitting in a taka field
REM    is exactly the mistake this screen exists to prevent.
REM
REM  THE TOKEN
REM    It needs the ads_read permission. That is NOT the same as
REM    the Conversions API token on the Tracking screen - one
REM    sends events to Meta, this one reads what the ads cost,
REM    and a token minted for one will not do the other's job.
REM
REM    Use a System User token from Business settings if you can.
REM    The quick ones from the Graph API Explorer stop working
REM    after about an hour, which is long enough to look like it
REM    worked and short enough to be a puzzle tomorrow.
REM
REM  Cached, not live: a pull writes rows and the screen reads
REM  rows. Meta rate-limits an ad account hard enough that a busy
REM  afternoon of refreshes starts returning errors.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_ads_migrate.log

echo ===== radian_ads_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (meta_ad_insights)...
docker compose run --rm api npx prisma migrate dev --name meta_ad_insights >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_ads_migrate.log
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
echo ===== curl :4000 ===== >> "%LOG%"
curl -s -m 6 -o nul -w "http_code=%%{http_code}" http://localhost:4000/audit/stats >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api log (last 80 lines) ===== >> "%LOG%"
docker compose logs --tail=80 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done.
echo.
echo  Next: Marketing ^& Growth - Ad numbers
echo    Paste the ad account id (act_...) and an ads_read token,
echo    press "Check the connection", then "Fetch from Meta".
echo.
echo  If the API did not come back up, read
echo    D:\radian\_ads_migrate.log
echo ============================================================
echo.
pause
