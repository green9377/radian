@echo off
REM ============================================================
REM  HR round 2 - what the owner asked for after seeing round 1
REM
REM    * Job roles are a real list you manage, not typed text
REM    * Employee photo (the column existed; now there is a
REM      button for it)
REM    * Documents - as many per person as you like
REM    * Payroll day count keeps half days
REM    * Practice data you can load and remove from the screen
REM
REM  Nothing existing is dropped. Run this, then reload
REM  http://localhost:3001/employees
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_hr_extras.log

echo ===== radian_hr_extras_migrate ===== > "%LOG%"
date /t >> "%LOG%" 2>&1
time /t >> "%LOG%" 2>&1

echo.
echo [1/5] Checking Docker...
docker version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Open Docker Desktop, wait for
  echo "Engine running", then run this file again.
  pause && exit /b 1
)

echo [2/5] Making sure the containers are up...
docker compose up -d >> "%LOG%" 2>&1
timeout /t 8 /nobreak >nul

echo [3/5] Running the migration (hr_roles_documents)...
docker compose run --rm api npx prisma migrate dev --name hr_roles_documents >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_hr_extras.log
  pause && exit /b 1
)

echo [4/5] Refreshing the Prisma client and restarting the API...
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [5/5] Waiting for the API, then collecting the log...
timeout /t 25 /nobreak >nul
echo. >> "%LOG%"
echo ===== docker compose ps ===== >> "%LOG%"
docker compose ps >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api logs (last 120) ===== >> "%LOG%"
docker compose logs --tail 120 api >> "%LOG%" 2>&1

echo.
echo DONE. Open  http://localhost:3001/employees
echo and press "Load practice staff" on the blue bar to see
echo Attendance and Payroll with real numbers in them.
echo.
pause
