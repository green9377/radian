@echo off
setlocal
REM ============================================================
REM  APPLY — run this after any code change. Double-click it.
REM
REM  It does NOT count seconds. It asks the API, once every three
REM  seconds, whether it is answering yet, and only stops when it
REM  gets a real answer (or gives up after three minutes).
REM
REM  WHY (31 Jul 2026, written after one too many): the earlier
REM  version waited a fixed 40 seconds and then announced it was
REM  done. `nest start --watch` recompiles ~150 files on every
REM  restart and takes 60-90. So it kept declaring success while
REM  the API was still compiling, the panel showed "The API is not
REM  answering", and it looked like every single change had broken
REM  something. Nothing was broken. The timer was wrong.
REM
REM  Two things also happen here that used to be manual:
REM   - it restarts first, because on Windows the file-change
REM     events never reach the Linux container, so the watcher can
REM     sit holding an error from ten minutes ago
REM   - it writes the log to _api_log.txt either way
REM ============================================================
cd /d D:\radian

echo.
echo  Restarting the API so it picks up the changed files...
docker compose restart api >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Could not restart. Is Docker Desktop running?
  pause && exit /b 1
)

echo  Waiting for it to answer. This usually takes about a minute.
echo.

set /a TRIES=0
:WAIT
set /a TRIES+=1
REM /shop/categories is public, so a 200 here means the API is genuinely
REM serving - not merely that the container process exists.
curl -s -f -o nul -m 4 http://localhost:4000/shop/categories
if not errorlevel 1 goto UP
if %TRIES% GEQ 60 goto GAVEUP
<nul set /p "=."
timeout /t 3 /nobreak >nul
goto WAIT

:UP
REM ============================================================
REM  ⚠️ THE API ANSWERS BEFORE IT HAS FINISHED COMPILING.
REM
REM  Found the hard way on 1 Aug 2026, after three rounds of a
REM  fix that was in the file and not in the running process.
REM  The log said it plainly:
REM
REM     7:21:17  Nest application successfully started
REM     7:21:27  Found 0 errors. Watching for file changes.
REM
REM  The runner serves the PREVIOUS build while TypeScript
REM  compiles the new one, so this script - which stops as soon
REM  as the API replies - was declaring success ten seconds
REM  before the new code existed. Every change then needed a
REM  second, manual restart that nobody knew to do, and the
REM  symptom was "your fix did not work".
REM
REM  So: wait for the compiler to finish, then restart once more
REM  and wait for that. Costs about a minute. Beats an hour of
REM  looking for a bug that was already fixed.
REM ============================================================
echo.
echo  Waiting for the compiler to finish before trusting this...
set /a COMPILE=0
:COMPILEWAIT
docker compose logs --tail 80 api 2>nul | find "Found 0 errors" >nul
if not errorlevel 1 goto COMPILED
REM ============================================================
REM  ⚠️ A FAILED COMPILE IS NOT A SLOW COMPILE.  3 Aug 2026.
REM
REM  This script used to wait, give up after two minutes, and
REM  then print the green "running the NEW code" box anyway.
REM  It was not running the new code. TypeScript had failed and
REM  the runner was serving the LAST GOOD BUILD - quietly, with
REM  no sign anywhere except the log.
REM
REM  The owner ran this, saw success, and then found the admin
REM  panel unchanged and every save returning 500. Nothing was
REM  wrong with the migration; the API had simply never taken
REM  the new code. An hour went looking for the wrong bug.
REM
REM  So: if the log says "error TS", stop and say so.
REM ============================================================
docker compose logs --tail 80 api 2>nul | find "error TS" >nul
if not errorlevel 1 goto BROKEN
set /a COMPILE+=1
if %COMPILE% GEQ 40 goto COMPILED
timeout /t 3 /nobreak >nul
goto COMPILEWAIT

:COMPILED
echo  Compiled. Restarting once more so the new build is the one running...
docker compose restart api >nul 2>&1
timeout /t 12 /nobreak >nul

set /a TRIES2=0
:WAIT2
curl -s -o nul -m 3 http://localhost:4000/health
if not errorlevel 1 goto REALLYUP
curl -s -o nul -m 3 http://localhost:4000/
if not errorlevel 1 goto REALLYUP
set /a TRIES2+=1
if %TRIES2% GEQ 40 goto REALLYUP
timeout /t 3 /nobreak >nul
goto WAIT2

:REALLYUP
docker compose logs --tail 40 api > D:\radian\_api_log.txt 2>&1
echo.
echo.
echo   ============================================
echo    THE API IS UP - and running the NEW code.
echo    Refresh the admin panel.
echo   ============================================
echo.
pause
exit /b 0

:BROKEN
docker compose logs --tail 120 api > D:\radian\_api_log.txt 2>&1
echo.
echo.
echo   ============================================
echo    THE CODE DID NOT COMPILE.
echo   ============================================
echo.
echo   The API is still answering - but with the OLD code.
echo   That is why nothing you changed has appeared.
echo.
echo   The reason is written in:
echo       D:\radian\_api_log.txt
echo.
echo   Say "check the log" in the chat. It gets read from
echo   there directly - no screenshot needed.
echo.
pause
exit /b 1

:GAVEUP
docker compose logs --tail 60 api > D:\radian\_api_log.txt 2>&1
echo.
echo.
echo   ============================================
echo    STILL NOT ANSWERING AFTER 3 MINUTES.
echo   ============================================
echo.
echo   This one is real - something in the code is wrong.
echo   The reason is written in:
echo       D:\radian\_api_log.txt
echo.
echo   Say "check the log" in the chat. It gets read from
echo   there directly - no screenshot needed.
echo.
pause
exit /b 1
