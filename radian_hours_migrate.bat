@echo off
REM ============================================================
REM  Opening hours — the times, the days the shop is shut, and
REM  the three remaining "Visit the shop" fields (map link,
REM  WhatsApp number, shop photo).
REM
REM  Seeded with 9 AM - 10 PM every day, which is what the site
REM  claims today, so nothing changes until you edit it.
REM ============================================================
cd /d D:\radian

echo [0/3] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [1/3] Applying the migration (shop_hours)...
docker compose exec api npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - read the error above. Nothing was applied.
  pause && exit /b 1
)

echo [2/3] Refreshing the Prisma client inside the container...
docker compose exec api npx prisma generate
if errorlevel 1 (
  echo CLIENT GENERATE FAILED - read the error above.
  pause && exit /b 1
)

echo [3/3] Restarting and waiting for the API...
call D:\radian\radian_apply.bat
