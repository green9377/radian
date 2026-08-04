@echo off
REM ============================================================
REM  Radian - Vendor workspace split (23 Jul 2026)  DEC-SUP-009
REM  ONE additive column only:
REM    SupplierType.isFulfillment Boolean default(false)
REM  (seed rows backfill themselves on first /suppliers/types read)
REM  Nothing dropped, no data touched, no stock touched.
REM ============================================================
cd /d D:\radian

echo.
echo [1/4] starting postgres + api containers...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/4] creating + applying the migration (supplier_vendor_split)...
docker compose run --rm api npx prisma migrate dev --name supplier_vendor_split
if errorlevel 1 goto fail

echo.
echo [3/4] rebuilding the api container (source is baked into the image)...
docker compose up -d --build api
if errorlevel 1 goto fail

echo.
echo [4/4] refreshing the prisma client on the HOST too...
cd /d D:\radian\apps\api
call npx prisma generate
cd /d D:\radian
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  DONE. Preview:
echo    http://localhost:3001/suppliers          -^> supplier book + vendor door
echo    http://localhost:3001/suppliers/vendors  -^> the Vendors workspace
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
