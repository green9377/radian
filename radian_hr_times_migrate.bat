@echo off
REM ============================================================
REM  HR round 4 - clock times, and documents while hiring
REM
REM  Two things the owner asked for after using round 3:
REM
REM   1) "entry time and leaving time - there is nothing"
REM      Each person now has a usual shift (09:00 - 19:00), and
REM      every day on the sheet records when they actually came
REM      in and left. The hours work themselves out from the
REM      clock. A leaving time earlier than the arrival time
REM      means the shift ran past midnight - which is normal
REM      here, Radian delivers at midnight.
REM
REM   2) "there is only a profile picture, no document upload"
REM      Documents were already there, but only on an existing
REM      person's Documents tab. Now they can be attached while
REM      hiring: NID copy, birth certificate, job contract,
REM      certificates, guardian's NID, and so on.
REM
REM  Nothing existing is dropped. Existing staff simply have no
REM  shift set until you fill one in.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_hr_times.log

echo ===== radian_hr_times_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (hr_shift_times)...
docker compose run --rm api npx prisma migrate dev --name hr_shift_times >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_hr_times.log
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
echo DONE.
echo.
echo On /employees press "Remove practice data" then
echo "Load practice staff" again - the new sample has five real
echo shifts, including a delivery boy on 20:00 - 01:00 so you can
echo see a past-midnight shift counted correctly.
echo.
pause
