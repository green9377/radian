@echo off
REM ============================================================
REM  HR module - one file that does everything and writes a log
REM
REM  Run this if the panel says "The API is not answering".
REM  It starts the containers, applies the HR migration, refreshes
REM  the Prisma client, restarts the API and then writes what
REM  happened to  D:\radian\_hr_fix.log
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_hr_fix.log

echo ===== radian_hr_fix started ===== > "%LOG%"
date /t >> "%LOG%" 2>&1
time /t >> "%LOG%" 2>&1

echo.
echo [1/6] Checking Docker...
docker version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING.
  echo Open Docker Desktop, wait until it says "Engine running",
  echo then run this file again.
  echo DOCKER NOT RUNNING >> "%LOG%"
  pause && exit /b 1
)

echo [2/6] Starting the containers...
echo ===== compose up ===== >> "%LOG%"
docker compose up -d >> "%LOG%" 2>&1

echo [3/6] Waiting for the database...
timeout /t 12 /nobreak >nul

echo [4/6] Applying the HR migration...
echo ===== migrate dev hr_module ===== >> "%LOG%"
docker compose run --rm api npx prisma migrate dev --name hr_module >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_hr_fix.log
  echo MIGRATION FAILED >> "%LOG%"
  pause && exit /b 1
)

echo [5/6] Refreshing the Prisma client and restarting the API...
echo ===== prisma generate ===== >> "%LOG%"
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [6/6] Waiting for the API to come back, then collecting the log...
timeout /t 25 /nobreak >nul
echo. >> "%LOG%"
echo ===== docker compose ps ===== >> "%LOG%"
docker compose ps >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api logs (last 150) ===== >> "%LOG%"
docker compose logs --tail 150 api >> "%LOG%" 2>&1

echo.
echo DONE. Now reload:  http://localhost:3001/employees
echo If it still does not answer, tell Claude - the log is at
echo    D:\radian\_hr_fix.log
echo.
pause
