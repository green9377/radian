@echo off
REM ============================================================
REM  Loyalty points - database migration  (MKT-D21)
REM
REM  Adds, in three places:
REM
REM    MarketingSetting  loyaltyEnabled (OFF), earnRateBp (1%),
REM                      festival multiplier + end date,
REM                      redeemMaxBp (20%), minRedeemPoints (50)
REM    Order             pointsUsed, pointsPaisa
REM    Finance           account 5453 Loyalty Points Cost
REM
REM  No new table. Points already have a ledger - LoyaltyPoint
REM  was built with Referral and the two now share it, which is
REM  the whole reason a customer sees ONE points balance and not
REM  two competing ones.
REM
REM  THE RULES, as locked on 29 July:
REM
REM    EARN   1% of (goods - discount), when the order is
REM           DELIVERED. Not on delivery charge, not on VAT -
REM           the rider takes one and the government takes the
REM           other, so neither was ever Radian's to give away.
REM
REM    SPEND  at most 20% of (goods - discount) on any one
REM           order. The customer pays at least 80% from their
REM           own pocket. No minimum order value, and no banding
REM           below the cap: 95% cash and 5% points is fine.
REM           Smallest redemption 50 points.
REM
REM    BACK   cancelled or returned, and the points come back by
REM           themselves on the nightly sweep.
REM
REM  POINTS ARE A TENDER, NOT A DISCOUNT. Spending them settles
REM  part of the bill; it does not shrink the bill. The invoice
REM  keeps its full value and the VAT is unchanged - which
REM  matters, because that VAT is owed to the government in cash
REM  whatever the customer used to pay.
REM
REM  ONE DOOR REMOVED. "Turn points into store credit" is gone.
REM  Store credit is money and money has no cap, so it walked
REM  straight around the 20% rule. Its accounting was wrong too:
REM  it un-booked the cost of the points AND created an
REM  obligation with no journal entry behind it. Both halves
REM  wrong, in opposite directions.
REM
REM  THE SCHEME STARTS SWITCHED OFF. Turning it on before the
REM  radianbd.com customers are imported would put the man who
REM  has bought forty times level with a stranger. Import first,
REM  seed the opening balances, then switch on.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_loyalty_migrate.log

echo ===== radian_loyalty_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (loyalty_points)...
docker compose run --rm api npx prisma migrate dev --name loyalty_points >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_loyalty_migrate.log
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
echo  Next: Marketing ^& Growth - Loyalty
echo    The scheme is OFF. Look at the screen, change the rate
echo    if you want to, and leave it off until the radianbd.com
echo    customers are imported.
echo.
echo  If the API did not come back up, read
echo    D:\radian\_loyalty_migrate.log
echo ============================================================
echo.
pause
