@echo off
REM ============================================================
REM  Marketing module self-test
REM
REM  Invents its own campaign, affiliate, customer, recipient and
REM  orders. Drives an order through every rung of the attribution
REM  ladder, earns commission, tries to withdraw it too early,
REM  returns an order and checks the money is clawed back, opens
REM  the resulting journal entries and reads them -- and tries
REM  every rule that is supposed to say no.
REM
REM  YOUR DATA IS NOT TOUCHED. Every row it creates is marked
REM  "[selftest]" or SELFTEST-, and every ledger entry it writes
REM  itself has a sourceKey starting SELFTEST:. The commission and
REM  payout entries it causes carry AFFCOM:/AFFREV:/AFFPAY: keys
REM  with no marker of ours, so the cleanup sweeps those too --
REM  that leak is exactly what hid the worst bug in HR.
REM
REM  Cleanup runs BEFORE and AFTER, so a crash halfway through
REM  cannot leave anything behind.
REM
REM  Writes the result to  D:\radian\_marketing_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_marketing_selftest.txt

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo Running the Marketing self-test... this takes about a minute.
echo.

docker compose exec -T api npx ts-node -T --project tsconfig.json src/marketing/marketing.selftest.ts > "%OUT%" 2>&1
set RESULT=%errorlevel%

type "%OUT%"

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo  ALL CHECKS PASSED - nothing was left behind
  echo ============================================
) else (
  echo ============================================
  echo  SOMETHING DID NOT HOLD UP - see above
  echo  Full output: D:\radian\_marketing_selftest.txt
  echo ============================================
)
echo.
pause
