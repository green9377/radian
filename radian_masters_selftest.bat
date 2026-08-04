@echo off
REM ============================================================
REM  MASTER DATA self-test -- Catalog . Customers . Products
REM
REM  The two it exists for:
REM    1. the WALK-IN customer must NOT be deletable. Deleting it
REM       bricks the till for ever, and no POS error message
REM       contains the word "customer".
REM    2. a phone or slug belonging to a TRASHED row is NOT free.
REM       It used to pass the check and then 500 on the index.
REM
REM  Section 6 also re-runs the whole system sweep: it walks every
REM  service file looking for a NEW lazily-created unique row that
REM  is not wrapped in ensureSingleton. Seven were found on 30 Jul.
REM  If an eighth appears, this goes red.
REM
REM  YOUR DATA IS NOT TOUCHED. Everything it makes is prefixed
REM  ZZMASTERTEST. It never deletes the real WALK-IN customer --
REM  it only checks that it may not be. Cleanup runs before and
REM  after.
REM
REM  Writes the result to  D:\radian\_masters_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_masters_selftest.txt

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo Running the self-test... this takes under a minute.
echo.

docker compose exec -T api npx ts-node -T --project tsconfig.json src/catalog/masters.selftest.ts > "%OUT%" 2>&1
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
  echo  Full output: D:\radian\_masters_selftest.txt
  echo ============================================
)
echo.
pause
