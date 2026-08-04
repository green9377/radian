@echo off
REM ============================================================
REM  ITEM module self-test
REM
REM  Invents its own items, builds a recipe out of them, checks
REM  that the cost adds up and rolls up, tries every rule that is
REM  supposed to say no, deletes and destroys what it made --
REM  and then removes every trace of itself.
REM
REM  YOUR DATA IS NOT TOUCHED. Every row it creates has a SKU
REM  starting ZZSELFTEST. The cleanup only ever matches that
REM  prefix, and it runs both before and after, so a crash
REM  halfway through cannot leave rubbish behind.
REM
REM  Writes the result to  D:\radian\_item_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_item_selftest.txt

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

docker compose exec -T api npx ts-node -T --project tsconfig.json src/items/items.selftest.ts > "%OUT%" 2>&1
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
  echo  Full output: D:\radian\_item_selftest.txt
  echo ============================================
)
echo.
pause
