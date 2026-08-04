@echo off
title Radian - fix the API
REM ============================================================
REM  REBUILD AND RESTART THE API
REM
REM  Why: the maintenance scripts written on 28 Jul (the HR
REM  self-test, the finance doctor, the books reset) live inside
REM  src/, so `nest start` was type-checking them as part of the
REM  API. They are run with `ts-node -T`, which SKIPS type
REM  checking - so a fault in a one-off cleanup tool could stop
REM  the whole API from starting, and nothing would have shown it.
REM
REM  tsconfig.build.json now leaves them out of the build. This
REM  file applies that and shows what the API says on the way up.
REM
REM  Nothing in the database is touched.
REM ============================================================
cd /d D:\radian

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause
  exit /b 1
)

echo [1/3] Stopping the API...
docker compose stop api

echo.
echo [2/3] Starting it again with the corrected build settings...
docker compose up -d api

echo.
echo [3/3] Waiting, then showing what it said...
timeout /t 45 /nobreak >nul
docker compose logs --tail 60 api > D:\radian\_api_fix.log 2>&1
type D:\radian\_api_fix.log

echo.
echo ============================================
echo  Look for "Nest application successfully started"
echo  above. If it is there, the API is up - open
echo  http://localhost:3001
echo.
echo  If you see red errors instead, tell Claude.
echo  Full log: D:\radian\_api_fix.log
echo ============================================
echo.
pause
