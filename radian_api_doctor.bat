@echo off
REM ============================================================
REM  Radian - why is the API not answering?
REM
REM  Run this whenever the panel says "The API is not answering".
REM  It asks the four questions in order and stops at the first
REM  one that has a bad answer, so there is no guessing:
REM
REM    1. is Docker running at all?
REM    2. are the containers up?
REM    3. does the API answer on port 4000?
REM    4. if not - WHAT DOES ITS LOG SAY?
REM
REM  It changes nothing. Safe at any time.
REM
REM  Nine times out of ten the answer is in step 4, and it is a
REM  TypeScript mistake stopping the code from compiling. To
REM  avoid that entirely, use radian_check_and_restart.bat
REM  instead of radian_lock_all.bat - it checks first and
REM  refuses to restart a broken build.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_api_doctor.log

echo. > "%LOG%"
echo.
echo ============================================================
echo   WHY IS THE API NOT ANSWERING?
echo ============================================================
echo.

echo -- 1. Docker ------------------------------------------------
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo   DOCKER IS NOT RUNNING.
  echo   Open Docker Desktop, wait until it says "Engine running",
  echo   then run this again. That is the whole fix.
  echo.
  pause && exit /b 1
)
echo   Running.
echo.

echo -- 2. The containers ----------------------------------------
docker compose ps
echo.

echo -- 3. Does the API answer? ----------------------------------
curl -s -m 5 -o nul -w "   HTTP %%{http_code} from localhost:4000" http://localhost:4000/audit/stats
echo.
curl -s -m 5 -o nul -w "" http://localhost:4000/audit/stats >nul 2>&1
if not errorlevel 1 (
  echo.
  echo   The API IS answering. If the panel still says otherwise,
  echo   reload the page with Ctrl+F5 - the browser is holding an
  echo   old copy.
  echo.
  pause && exit /b 0
)

echo   No answer. Reading its log.
echo.
echo -- 4. What the API said -------------------------------------
echo ===== api log ===== >> "%LOG%"
docker compose logs --tail=60 api >> "%LOG%" 2>&1
docker compose logs --tail=60 api 2>nul | findstr /C:"error" /C:"Error" /C:"ERROR" /C:"Cannot find" /C:"TS2" /C:"TS1"
echo.
echo   ----------------------------------------------------------
echo   The lines above are the reason. If nothing showed, the
echo   full log is in  D:\radian\_api_doctor.log
echo.
echo   If it looks like a TypeScript mistake, run
echo     D:\radian\radian_check_and_restart.bat
echo   which prints the exact file and line.
echo   ----------------------------------------------------------
echo.
pause
