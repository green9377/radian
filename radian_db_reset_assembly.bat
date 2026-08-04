@echo off
REM ============================================================
REM  Radian — DB reset + full migration catch-up (23 Jul 2026)
REM  Owner-approved: dev DB holds test data only; drift found
REM  (Item/Purchase/Inventory tables existed without migration files).
REM
REM  1) drop + re-apply the 12 recorded migrations
REM  2) ONE new migration captures everything missing:
REM     Item/Purchase/Inventory + Assembly v2 (DEC-ASM-011..016)
REM  3) prisma client refresh (container + host) + api rebuild
REM  4) warehouse seed (Shop + Storeroom + settings)
REM  Demo data afterwards (optional): radian_seed.bat
REM ============================================================
cd /d D:\radian

echo.
echo [1/6] starting postgres + api containers...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/6] resetting the database (drops ALL data, re-applies old migrations)...
docker compose run --rm api npx prisma migrate reset --force --skip-seed
if errorlevel 1 goto fail

echo.
echo [3/6] creating + applying the catch-up migration (assembly_v2_full)...
docker compose run --rm api npx prisma migrate dev --name assembly_v2_full
if errorlevel 1 goto fail

echo.
echo [4/6] refreshing prisma client in the container + seeding warehouses...
docker compose exec api npx prisma generate
docker compose exec api node prisma/seed-inventory.js
if errorlevel 1 goto fail

echo.
echo [5/6] rebuilding the api container (serves compiled dist/)...
docker compose up -d --build api
if errorlevel 1 goto fail

echo.
echo [6/6] refreshing the prisma client on the HOST too...
cd /d D:\radian\apps\api
call npx prisma generate
cd /d D:\radian
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  DONE. Open:
echo    http://localhost:3001/assembly/templates  -^> build a template
echo    http://localhost:3001/assembly/pipeline   -^> produce it
echo  Optional demo data: double-click radian_seed.bat
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
