@echo off
REM ============================================================
REM  Referral & Points - database migration
REM
REM  The owner's rule (28 Jul 2026):
REM    whoever brings a friend gets POINTS in their account,
REM    the friend gets a DISCOUNT on their first order,
REM    and the points land as soon as that order is CONFIRMED.
REM    1 point = 1 taka. How many points per referral is a
REM    setting, changeable whenever you like.
REM
REM  What this adds:
REM
REM   1) LoyaltyPoint - THE points ledger. One ledger, not two.
REM      Loyalty is coming later and will write to this same
REM      table. Two separate point systems would give a customer
REM      two balances that never agree, and that is a mistake
REM      nobody can unwind afterwards.
REM      Append-only: a correction is another row with a minus,
REM      never an edit and never a delete.
REM
REM   2) ReferralCode - one code per customer, made on demand.
REM
REM   3) Referral - one row per person actually brought in.
REM
REM   4) Settings for the reward amounts, on MarketingSetting.
REM
REM  Two new accounts are seeded by the API on boot:
REM    2130  Customer Points Payable   (LIABILITY)
REM    5452  Referral & Points Cost    (EXPENSE)
REM
REM  Why a liability: one point is a promise to give away 1 taka
REM  of future revenue. It costs the shop the day it is earned,
REM  not the day it is spent. Without this the books would show
REM  a profit that has already been half promised away.
REM
REM  Nothing is dropped.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_referral_migrate.log

echo ===== radian_referral_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (referral_points)...
docker compose run --rm api npx prisma migrate dev --name referral_points >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_referral_migrate.log
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
echo  Next: Marketing - Referral
echo    Set how many points a referral is worth, then give a
echo    customer their code from the same screen.
echo.
echo  If the API did not come back up, read
echo    D:\radian\_referral_migrate.log
echo ============================================================
echo.
pause
