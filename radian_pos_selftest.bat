@echo off
REM ============================================================
REM  POS module self-test
REM
REM  Opens its own counter, rings up paid, split-tender and credit
REM  sales, collects the due, pays out for tea, counts the drawer
REM  short and closes -- then removes every trace of itself.
REM
REM  The two it exists for:
REM    1. two cashiers collecting from ONE customer at the same
REM       moment -- the order must count BOTH payments
REM    2. cash collected on an old bill must reach TODAY'S drawer,
REM       not a shift that closed weeks ago
REM
REM  YOUR DATA IS NOT TOUCHED. Its own register (ZZPOSTEST-REG),
REM  its own item/product (ZZPOSTEST...) and its own customer.
REM  Every shift it opens, it closes. Cleanup runs before and
REM  after, so a crash halfway cannot leave the till blocked.
REM
REM  Writes the result to  D:\radian\_pos_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_pos_selftest.txt

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

docker compose exec -T api npx ts-node -T --project tsconfig.json src/pos/pos.selftest.ts > "%OUT%" 2>&1
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
  echo  Full output: D:\radian\_pos_selftest.txt
  echo ============================================
)
echo.
pause
