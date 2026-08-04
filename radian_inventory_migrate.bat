@echo off
REM ============================================================
REM  Radian — Inventory module migration (22 Jul 2026)
REM  RADIAN_INVENTORY_MODULE_ARCHITECTURE.md  ·  DEC-INV-001..015
REM
REM  New tables:
REM    Warehouse / InventoryStock / InventoryMovement
REM    StockTransfer(+Line) / StockIssue(+Line) / Stocktake(+Line)
REM    ItemExpiryLot / InventorySetting
REM  New enums: MovementReason, IssueKind, NegativeStockPolicy
REM  Item gains: trackExpiry + back-relation lines only.
REM
REM  ⚠️ If radian_purchase_migrate.bat was NEVER run, prisma diffs the whole
REM  schema — this ONE migration will then also create the Purchase + Item
REM  tables. That is fine; nothing is dropped either way.
REM
REM  NO stock behaviour changes yet: Product.stockQty and the live
REM  DEC-MOD-003 deduction stay untouched (repoint is DEC-INV-015, later step).
REM
REM  If prisma warns about DROPPING a column that still holds data:
REM  answer N and paste the message into the chat.
REM ============================================================
cd /d D:\radian

echo.
echo [1/6] starting postgres + api containers...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/6] creating + applying the migration (inventory_module)...
docker compose run --rm api npx prisma migrate dev --name inventory_module
if errorlevel 1 goto fail

echo.
echo [3/6] refreshing the prisma client INSIDE the container...
docker compose exec api npx prisma generate
if errorlevel 1 goto fail

echo.
echo [4/6] seeding warehouses (SHOP + STORE) + settings row...
docker compose exec api node prisma/seed-inventory.js
if errorlevel 1 goto fail

echo.
echo [5/6] rebuilding the api container (it serves compiled dist/)...
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
echo  DONE. Preview:
echo    http://localhost:3001/inventory          -^> Overview
echo    http://localhost:3001/inventory/stock    -^> Stock board
echo    http://localhost:3001/inventory/opening  -^> Opening stock entry
echo  (admin not running? double-click START_RADIAN.bat first)
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
