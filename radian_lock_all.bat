@echo off
REM ============================================================
REM  ACCESS — round 2: the lock now covers the WHOLE panel
REM
REM  No database change. The API container watches the source and
REM  recompiles by itself, so normally you do NOT need this file.
REM  Run it only if the panel says "The API is not answering".
REM ============================================================
cd /d D:\radian

echo Restarting the API...
docker compose restart api

echo.
echo DONE. Open these:
echo    http://localhost:3001/settings/people    who can sign in
echo    http://localhost:3001/settings/me        your own password and PIN
echo.
pause
