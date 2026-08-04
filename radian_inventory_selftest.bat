@echo off
REM ============================================================
REM  INVENTORY module self-test
REM
REM  Builds its own store and shop, opens stock, transfers,
REM  wastes, gifts, counts and corrects -- and checks that the
REM  ledger and the balance never disagree.
REM
REM  It also races itself on purpose: two openings at once, three
REM  gift notes at once, three callers asking for the assembly
REM  floor at once. Those are the three faults this review found.
REM
REM  YOUR DATA IS NOT TOUCHED. It works in its own warehouses
REM  (ZZINVTEST-WH / -WH2) with its own items (SKU ZZINVTEST...)
REM  and removes both afterwards. Cleanup runs before and after.
REM
REM  Writes the result to  D:\radian\_inventory_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_inventory_selftest.txt

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

docker compose exec -T api npx ts-node -T --project tsconfig.json src/inventory/inventory.selftest.ts > "%OUT%" 2>&1
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
  echo  Full output: D:\radian\_inventory_selftest.txt
  echo ============================================
)
echo.
pause
