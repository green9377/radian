@echo off
REM ============================================================
REM  Employee / HR module  -  database migration
REM
REM  Adds:  Employee, Attendance, Payroll, PayrollLine
REM         + JournalLine.employeeId (the new dimension beside
REM           the old employeeName, which is NOT touched)
REM         + AppUser <-> Employee optional link
REM
REM  Nothing existing is dropped or rewritten. Every old ledger
REM  line keeps the exact name and amount it was posted with.
REM ============================================================
cd /d D:\radian

echo [1/3] Running the migration (hr_module)...
docker compose run --rm api npx prisma migrate dev --name hr_module
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - read the error above. Nothing was applied.
  echo If Docker Desktop is not running, start it and run this file again.
  pause && exit /b 1
)

echo [2/3] Refreshing the Prisma client inside the container...
docker compose exec api npx prisma generate

echo [3/3] Restarting the API...
docker compose restart api

echo.
echo DONE. Open:  http://localhost:3001/employees
echo.
echo First run: add your staff, then Finance -^> Staff advance ^& salary
echo will only let you pay someone who is on that list.
echo.
pause
