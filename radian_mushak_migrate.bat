@echo off
REM ============================================================
REM  Mushak 6.3 — the government VAT challan
REM  Schema adds 5 columns to FinanceSetting: registered name,
REM  address, VAT circle, and who signs the challan.
REM  (The BIN column already existed.)
REM ============================================================
cd /d D:\radian

echo [1/3] Running the migration (mushak_business_details)...
docker compose run --rm api npx prisma migrate dev --name mushak_business_details
if errorlevel 1 (
  echo MIGRATION FAILED - read the error above. Nothing was applied.
  echo If Docker Desktop is not running, start it and run this file again.
  pause && exit /b 1
)

echo [2/3] Refreshing the Prisma client inside the container...
docker compose exec api npx prisma generate

echo [3/3] Restarting the API...
docker compose restart api

echo.
echo DONE. Open:  http://localhost:3001/finance/vat
echo Fill in your BIN and registered details once - then every VAT sale
echo prints a challan in one click.
echo.
pause
