@echo off
REM ============================================================
REM  Marketing module - database migration
REM
REM  RADIAN_MARKETING_MODULE_ARCHITECTURE.md (28 Jul 2026)
REM
REM  What this adds - eight new tables that belong to Marketing:
REM
REM    Campaign              one promotional push (an occasion, not an ad)
REM    OrderAttribution      where one order came from, and how we know
REM    Affiliate             an outside promoter - person or business
REM    AffiliateCommission   what one order earned one affiliate
REM    AffiliatePayout       one withdrawal of that money
REM    Outreach              one contact attempt with one known customer
REM    MarketingOptOut       somebody who asked not to be contacted
REM    MarketingSetting      rate, hold days, minimum withdrawal, template
REM
REM  And three small additions to tables Marketing does NOT own:
REM
REM    Expense.campaignId    an optional tag. The money stays in Finance.
REM    Order.utm* / refCode  raw capture of how the order arrived
REM    FinSourceType.AFFILIATE  so commission entries have a source type
REM
REM  Nothing is dropped. Every new column is nullable or has a default,
REM  so every existing row stays exactly as it is.
REM
REM  Two new accounts (2120 Affiliate Payable, 5451 Affiliate Commission)
REM  are seeded by the API on boot - not by this file.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_marketing_migrate.log

echo ===== radian_marketing_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (marketing_module)...
docker compose run --rm api npx prisma migrate dev --name marketing_module >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_marketing_migrate.log
  pause && exit /b 1
)

echo [4/5] Refreshing the Prisma client and restarting the API...
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [5/5] Waiting for the API, then collecting the log...
timeout /t 25 /nobreak >nul
echo. >> "%LOG%"
echo ===== docker compose ps ===== >> "%LOG%"
docker compose ps >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api log (last 60 lines) ===== >> "%LOG%"
docker compose logs --tail=60 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done. Marketing tables are in.
echo.
echo  Next: open the panel and look at  Marketing  in the sidebar.
echo  If the API did not come back up, read
echo    D:\radian\_marketing_migrate.log
echo ============================================================
echo.
pause
