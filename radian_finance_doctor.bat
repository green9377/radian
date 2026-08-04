@echo off
REM ============================================================
REM  FINANCE DOCTOR  -  READ ONLY
REM
REM  Runs the real drift check, then goes through the ledger
REM  entry by entry and says which ones are practice and which
REM  could be a real trade. Ends with a verdict: clean up piece
REM  by piece, or start the books again.
REM
REM  IT CHANGES NOTHING. Safe to run any number of times.
REM
REM  Writes to  D:\radian\_finance_doctor.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_finance_doctor.txt

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo Reading the books... (nothing is being changed)
echo.

docker compose exec -T api npx ts-node -T --project tsconfig.json src/finance/finance.doctor.ts > "%OUT%" 2>&1

type "%OUT%"

echo.
echo ============================================
echo  Nothing was changed. Full report:
echo  D:\radian\_finance_doctor.txt
echo ============================================
echo.
pause
