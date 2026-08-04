@echo off
REM ============================================================
REM  Radian - CHECK THE CODE, THEN restart
REM
REM  *** USE THIS INSTEAD OF radian_lock_all.bat ***
REM
REM  Why it exists:
REM
REM  radian_lock_all.bat restarts the API whether the code is
REM  good or not. If a mistake slipped in, the container comes
REM  back up, fails to compile, and the panel just says "The
REM  API is not answering" with no clue why.
REM
REM  This asks the TypeScript compiler first, INSIDE the
REM  container where the database types are correct, and
REM  refuses to restart if the answer is bad. A working API is
REM  never replaced by a broken one.
REM
REM  IT CHECKS WHAT THE API ACTUALLY BUILDS (tsconfig.build.json).
REM  The self-test files are deliberately NOT part of the build -
REM  they are run by hand through their own .bat - so a mistake
REM  in one of them cannot stop the shop working, and it is
REM  reported as a warning rather than treated as a disaster.
REM  (The first version of this file got that wrong and blocked
REM  a restart over a self-test typo. Fixed 28 Jul.)
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_api_check.log
set LOG2=D:\radian\_api_check_selftests.log

echo.
echo ============================================================
echo   CHECKING THE CODE BEFORE RESTARTING
echo ============================================================
echo.

docker version >nul 2>&1
if errorlevel 1 (
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and try again.
  pause && exit /b 1
)

echo [1/4] Making sure the container is up...
docker compose up -d api >nul 2>&1
timeout /t 4 /nobreak >nul

echo [2/4] Checking the code the API actually runs...
docker compose exec -T api npx tsc --noEmit -p tsconfig.build.json > "%LOG%" 2>&1
set TSRESULT=%errorlevel%

if not "%TSRESULT%"=="0" (
  echo.
  echo ============================================================
  echo   THE CODE HAS A PROBLEM - NOTHING WAS RESTARTED
  echo ============================================================
  echo.
  type "%LOG%"
  echo.
  echo ============================================================
  echo  The API is still running the last good version, so the
  echo  panel keeps working. Send the lines above to Claude.
  echo.
  echo  Full output: D:\radian\_api_check.log
  echo ============================================================
  echo.
  pause && exit /b 1
)
echo       Clean.

echo [3/4] Checking the self-tests (a warning only)...
docker compose exec -T api npx tsc --noEmit -p tsconfig.json > "%LOG2%" 2>&1
if not "%errorlevel%"=="0" (
  echo.
  echo       ---------------------------------------------------
  echo       Note: something in a self-test file does not compile.
  echo       The shop is NOT affected - self-tests are not part of
  echo       the API. Only the .selftest.bat files would fail.
  echo       See D:\radian\_api_check_selftests.log
  echo       ---------------------------------------------------
  echo.
) else (
  echo       Clean.
)

echo [4/4] Restarting the API...
docker compose restart api >nul 2>&1
timeout /t 20 /nobreak >nul

docker compose ps api | findstr /C:"Up" >nul
if errorlevel 1 (
  echo.
  echo ============================================================
  echo  THE CONTAINER IS NOT UP. Last 40 lines of its log:
  echo ============================================================
  docker compose logs --tail=40 api
  echo.
  pause && exit /b 1
)

echo.
echo ============================================================
echo  Done - the code checked out and the API is back.
echo.
echo    http://localhost:3001   the panel
echo.
echo  If the panel still says the API is not answering, press
echo  Ctrl+F5 - the browser is holding an old copy.
echo ============================================================
echo.
pause
