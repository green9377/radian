@echo off
REM ============================================================
REM  PURCHASE module self-test
REM
REM  Invents its own flowers, buys them, receives them in parts,
REM  returns some, and checks that the stock, the moving average
REM  AND the ledger all say the same thing -- then removes every
REM  trace of itself.
REM
REM  The one it exists for: a QUICK purchase (goods already in
REM  the van) updated stock and cost but never reached the books.
REM  This test goes red if that ever comes back.
REM
REM  YOUR DATA IS NOT TOUCHED. Every item it makes has a SKU
REM  starting ZZPURTEST and every purchase is noted [selftest].
REM  Cleanup matches only those two markers and runs both before
REM  and after, so a crash halfway cannot leave rubbish behind.
REM
REM  Writes the result to  D:\radian\_purchase_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_purchase_selftest.txt

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo Running the self-test... this takes about a minute.
echo.

docker compose exec -T api npx ts-node -T --project tsconfig.json src/purchases/purchases.selftest.ts > "%OUT%" 2>&1
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
  echo  Full output: D:\radian\_purchase_selftest.txt
  echo ============================================
)
echo.
pause
