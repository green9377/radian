@echo off
REM ============================================================
REM  HR round 3 - "half day" now means something
REM
REM  The owner's question: one person's duty is 8 hours, another's
REM  is 12 - so what is a "half day"? Without a full-day length
REM  the button was a word, not a quantity.
REM
REM  Adds:
REM    * Employee.dutyHoursPerDay   what a FULL day is for this
REM                                 person (default 8)
REM    * hours are now recorded for EVERYONE, not only hourly staff
REM    * PayrollLine.absentDays     the unpaid part of the month, so
REM                                 a monthly deduction can be shown
REM                                 with its arithmetic
REM
REM  Existing staff all start on 8 hours - change anyone who differs
REM  on their Edit screen. Nothing is dropped.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_hr_duty.log

echo ===== radian_hr_duty_hours_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (hr_duty_hours)...
docker compose run --rm api npx prisma migrate dev --name hr_duty_hours >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_hr_duty.log
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
echo NOTE: the practice staff from before were made with the old
echo rules. On /employees press "Remove practice data" and then
echo "Load practice staff" again - the new set has five different
echo duty lengths (4, 5, 9, 10 and 12 hours) so you can see how
echo "half day" changes per person.
echo.
pause
