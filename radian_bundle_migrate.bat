@echo off
REM ============================================================
REM  Bundle — the "+ Chocolates" / "+ Cake" cards on a product
REM  page. Owner decision, 31 Jul 2026.
REM
REM  Adds one table: Bundle. Nothing is dropped, nothing is
REM  seeded, and no page changes until you create your first
REM  bundle in the admin.
REM
REM  The table stores a DISCOUNT, never a price. The chocolate's
REM  price always comes from the chocolate's own product page,
REM  so raising it there raises it everywhere at once.
REM ============================================================
cd /d D:\radian

echo [0/4] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo.
  echo   The API container is not running, so the migration cannot
  echo   be applied inside it. Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [1/4] Applying the migration (bundles)...
docker compose exec api npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - read the error above. Nothing was applied.
  pause && exit /b 1
)

echo [2/4] Refreshing the Prisma client inside the container...
docker compose exec api npx prisma generate
if errorlevel 1 (
  echo CLIENT GENERATE FAILED - read the error above.
  pause && exit /b 1
)

echo [3/4] Restarting and waiting for the API...
call D:\radian\radian_apply.bat
