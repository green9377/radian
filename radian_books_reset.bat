@echo off
REM ============================================================
REM  START THE BOOKS AGAIN
REM
REM  The finance doctor found no real trade in this ledger:
REM  orders numbered RAD-D001..D012 by the demo seeder, seven on
REM  one day, two customers, no purchases, a loan whose note says
REM  "checked by drift test", an expense called "ACCESS TEST".
REM
REM  This removes every TRADE and every LEDGER ENTRY, and keeps
REM  everything you set up: chart of accounts, items, products,
REM  suppliers, delivery methods, offers, employees, logins, PINs
REM  and settings.
REM
REM  It shows you the full list FIRST and only acts if you type
REM  RESET. Nothing happens by accident.
REM ============================================================
cd /d D:\radian

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo.
echo ------------------------------------------------------------
echo  STEP 1 of 2 - showing what WOULD go. Nothing is touched yet.
echo ------------------------------------------------------------
echo.

docker compose exec -T api npx ts-node -T --project tsconfig.json src/finance/books.reset.ts

echo.
echo ------------------------------------------------------------
echo  STEP 2 of 2
echo.
echo  Read the list above. If you are happy, type  RESET
echo  and press Enter. Anything else cancels.
echo ------------------------------------------------------------
echo.
set /p ANSWER="Type RESET to go ahead: "

if /I not "%ANSWER%"=="RESET" (
  echo.
  echo Cancelled. Nothing was changed.
  echo.
  pause && exit /b 0
)

echo.
echo Going ahead...
echo.
docker compose exec -T api npx ts-node -T --project tsconfig.json src/finance/books.reset.ts --confirm > D:\radian\_books_reset.txt 2>&1
type D:\radian\_books_reset.txt

echo.
echo ============================================
echo  Log saved to D:\radian\_books_reset.txt
echo ============================================
echo.
pause
