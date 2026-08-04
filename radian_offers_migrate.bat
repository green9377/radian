@echo off
REM ============================================================
REM  Pricing & Offers module — schema migrate + API rebuild
REM  (RADIAN_OFFERS_MODULE_ARCHITECTURE.md, DEC-OFR-001..009)
REM  Pattern: supplier/returns bat — migrate, rebuild, generate, restart.
REM ============================================================
cd /d D:\radian

echo [1/4] Running Prisma migration (offers_module)...
docker compose run --rm api npx prisma migrate dev --name offers_module
if errorlevel 1 (
  echo MIGRATION FAILED — read the error above. && pause && exit /b 1
)

echo [2/4] Rebuilding the API image (source is baked in)...
docker compose up -d --build api
if errorlevel 1 ( echo BUILD FAILED && pause && exit /b 1 )

echo [3/4] Refreshing the Prisma client INSIDE the container...
REM anonymous /app/node_modules volume hides the rebuilt client (16 Jul lesson)
docker compose exec api npx prisma generate

echo [4/4] Restarting the API...
docker compose restart api

echo.
echo DONE. Check: http://localhost:4000/offers  and  /offers/settings
pause
