@echo off
REM ============================================================
REM  AUDIT . CONTENT self-test
REM
REM  Audit is the module every other module writes through --
REM  about a hundred call sites -- and it had never been reviewed.
REM
REM  The one it exists for: an audit write could FAIL THE BUSINESS
REM  ACTION IT WAS RECORDING. Every caller writes its trace after
REM  its own write has committed, so a throw here could not undo
REM  anything -- it could only return a 500 for work that had
REM  succeeded, and the user then presses Save again. On a
REM  purchase that means a DUPLICATE purchase, duplicate stock and
REM  a duplicate ledger entry.
REM
REM  Section 3 checks the opposite too: the ONE caller that WANTS
REM  the throw (Item.purge, which writes its trace before
REM  destroying the row) must still get it.
REM
REM  YOUR DATA IS NOT TOUCHED. It writes audit rows against a
REM  made-up entityType, ZZAUDITTEST, and no business data at all.
REM
REM  Writes the result to  D:\radian\_audit_selftest.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_audit_selftest.txt

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo Running the self-test... this is quick.
echo.

docker compose exec -T api npx ts-node -T --project tsconfig.json src/audit/audit.selftest.ts > "%OUT%" 2>&1
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
  echo  Full output: D:\radian\_audit_selftest.txt
  echo ============================================
)
echo.
pause
