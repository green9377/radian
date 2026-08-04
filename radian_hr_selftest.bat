@echo off
REM ============================================================
REM  HR module self-test
REM
REM  Invents its own staff, marks a week of attendance, gives an
REM  advance, runs a payroll, approves it, checks what landed in
REM  the books, tries every rule that is supposed to say no --
REM  and then removes every trace of itself.
REM
REM  YOUR DATA IS NOT TOUCHED. Everything it creates is marked
REM  "[selftest]" and every ledger entry it writes has a sourceKey
REM  starting SELFTEST:. The cleanup only ever matches those two
REM  markers, and it runs both before and after, so a crash
REM  halfway through cannot leave rubbish behind.
REM
REM  Writes the result to  D:\radian\_hr_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_hr_selftest.txt

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

docker compose exec -T api npx ts-node -T --project tsconfig.json src/hr/hr.selftest.ts > "%OUT%" 2>&1
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
  echo  Full output: D:\radian\_hr_selftest.txt
  echo ============================================
)
echo.
pause
