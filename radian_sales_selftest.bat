@echo off
REM ============================================================
REM  SALES . RETURNS . SUPPLIER self-test
REM
REM  All three were already marked "review-fixed" -- Sales on
REM  17 July, Returns and Supplier on 23 July. The 30 July sweep
REM  found nine fire-and-forget finance calls across them anyway,
REM  plus two lost updates in Sales.
REM
REM  Not carelessness: FINANCE DID NOT EXIST when those reviews
REM  ran. The hooks came later and the reviews were never re-run.
REM
REM  Section 4 therefore does not test a behaviour -- it walks the
REM  whole source tree and fails if ANY finance or inventory
REM  hand-off is fire-and-forget again.
REM
REM  YOUR DATA IS NOT TOUCHED. Everything it makes is prefixed
REM  ZZSALESTEST. Cleanup runs before and after.
REM
REM  Writes the result to  D:\radian\_sales_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_sales_selftest.txt

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

docker compose exec -T api npx ts-node -T --project tsconfig.json src/orders/sales.selftest.ts > "%OUT%" 2>&1
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
  echo  Full output: D:\radian\_sales_selftest.txt
  echo ============================================
)
echo.
pause
