@echo off
REM ============================================================
REM  Craft points + the size heading. Owner decisions, 31 Jul 2026.
REM
REM  1. CraftPoint  - the three "why buy from us" cards under the
REM     fold. Written ONCE on the category; a product that needs
REM     its own story overrides it.
REM
REM  2. Category.sizeLabel - the heading above the size chooser
REM     ("Bouquet Size", "Cake Weight"). Seeded with the wording
REM     the site already shows, so nothing looks different until
REM     you edit it.
REM
REM  Additive only. Nothing is dropped.
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

echo [1/4] Applying the migration (craft_points)...
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
