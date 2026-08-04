@echo off
REM ============================================================
REM  Delivery Management module — schema migrate + API rebuild
REM  (RADIAN_DELIVERY_MODULE_ARCHITECTURE.md, DEC-DLV-001..006)
REM ============================================================
cd /d D:\radian

echo [1/4] Running Prisma migration (delivery_module)...
docker compose run --rm api npx prisma migrate dev --name delivery_module
if errorlevel 1 (
  echo MIGRATION FAILED — read the error above. && pause && exit /b 1
)

echo [2/4] Rebuilding the API image (source is baked in)...
docker compose up -d --build api
if errorlevel 1 ( echo BUILD FAILED && pause && exit /b 1 )

echo [3/4] Refreshing the Prisma client INSIDE the container...
docker compose exec api npx prisma generate

echo [4/4] Restarting the API...
docker compose restart api

echo.
echo DONE. Check: http://localhost:4000/delivery/config  and  /delivery/board
pause
