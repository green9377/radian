@echo off
REM ============================================================
REM  Radian - Supplier module migration + rebuild (23 Jul 2026)
REM  RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md  -  DEC-SUP-001..008
REM
REM  New tables:
REM    Supplier / SupplierType / SupplierPayment /
REM    SupplierPaymentAllocation / SupplierAdjustment
REM  New enums: SupplierStatus, NotifyChannel, NotifyMode
REM  ADDITIVE columns on existing tables (nothing dropped, no data touched):
REM    Purchase.supplierId  (nullable FK - DEC-SUP-007)
REM    SupplierCredit.supplierId (nullable FK)
REM    Item.supplierId (nullable FK - DEC-SUP-004)
REM
REM  NO stock is touched anywhere (SUP-R09). Assembly/Inventory paths untouched.
REM
REM  If prisma warns about DROPPING anything: answer N and paste the
REM  message into the chat.
REM ============================================================
cd /d D:\radian

echo.
echo [1/5] starting postgres + api containers...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/5] creating + applying the migration (supplier_module)...
docker compose run --rm api npx prisma migrate dev --name supplier_module
if errorlevel 1 goto fail

echo.
echo [3/5] refreshing the prisma client INSIDE the container...
docker compose exec api npx prisma generate
if errorlevel 1 goto fail

echo.
echo [4/5] rebuilding the api container (source is baked into the image)...
docker compose up -d --build api
if errorlevel 1 goto fail

echo.
echo [5/5] refreshing the prisma client on the HOST too...
cd /d D:\radian\apps\api
call npx prisma generate
cd /d D:\radian
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  DONE. Preview:
echo    http://localhost:3001/suppliers          -^> Overview / due board
echo    http://localhost:3001/suppliers/new      -^> add a supplier
echo    http://localhost:3001/suppliers/list     -^> the book
echo    http://localhost:3001/suppliers/settings -^> types + link old names
echo  (admin not running? double-click START_RADIAN.bat first)
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
