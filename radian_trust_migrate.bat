@echo off
REM ============================================================
REM  Trust strip — the row of promises under the big banner.
REM  "2-Hour Delivery", "Freshness Promise", "Secure Payment".
REM
REM  Adds one table: TrustBadge, seeded with the six that are
REM  already on the website, so nothing changes visually until
REM  you edit them.
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

echo [1/4] Applying the migration (trust_badges)...
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
