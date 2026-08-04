@echo off
REM ============================================================
REM  FINISH THE FINANCE CLEAN-UP
REM
REM  Clears the last red flag and sets the go-live date.
REM
REM  What it does:
REM    * clears the practice "opening due" left on supplier
REM      profiles - the one thing the books reset could not
REM      reach, because it is master data, not a transaction
REM    * sets the go-live date to today, if it is not set
REM    * removes the five practice staff
REM    * runs the drift check again and shows the result
REM
REM  What it deliberately does NOT do:
REM    * post opening balances. Those are your real figures and
REM      Finance accepts them exactly once. Posting zeroes now
REM      would shut the door on the real ones for good.
REM
REM  Shows you everything FIRST and only acts if you type FIX.
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
echo  STEP 1 of 2 - showing what WOULD change. Nothing yet.
echo ------------------------------------------------------------
echo.

docker compose exec -T api npx ts-node -T --project tsconfig.json src/finance/finance.finish.ts

echo.
echo ------------------------------------------------------------
echo  STEP 2 of 2
echo.
echo  If that looks right, type  FIX  and press Enter.
echo  Anything else cancels.
echo ------------------------------------------------------------
echo.
set /p ANSWER="Type FIX to go ahead: "

if /I not "%ANSWER%"=="FIX" (
  echo.
  echo Cancelled. Nothing was changed.
  echo.
  pause && exit /b 0
)

echo.
docker compose exec -T api npx ts-node -T --project tsconfig.json src/finance/finance.finish.ts --confirm > D:\radian\_finance_finish.txt 2>&1
type D:\radian\_finance_finish.txt

echo.
echo ============================================
echo  Log saved to D:\radian\_finance_finish.txt
echo ============================================
echo.
pause
