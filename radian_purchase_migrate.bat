@echo off
REM ============================================================
REM  Radian — Purchase module migration (22 Jul 2026)
REM  RADIAN_PURCHASE_MODULE_ARCHITECTURE.md  ·  DEC-PUR-001..009
REM
REM  New tables:
REM    Purchase / PurchaseLine / PurchasePayment
REM    PurchaseReturn / PurchaseReturnLine / SupplierCredit
REM  New enums: PurchaseStatus, PayMethod
REM  Existing models: Item + Unit each gain ONE back-relation line only.
REM
REM  ALSO INCLUDED in this migration run: the Item module tables that were
REM  written earlier but never migrated (Item, ItemComponent, ItemCategory,
REM  ItemAttribute*, ItemTypeMaster) — prisma diffs the whole schema.
REM
REM  Nothing is dropped. NO stock is touched anywhere (DEC-PUR-002):
REM  Product.stockQty and the live DEC-MOD-003 deduction stay exactly as they are.
REM
REM  If prisma warns about DROPPING a column that still holds data:
REM  answer N and paste the message into the chat (see RADIAN_ITEM_HANDOFF_DO_NOT_BREAK.md).
REM ============================================================
cd /d D:\radian

echo.
echo [1/5] starting postgres + api containers...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/5] creating + applying the migration (purchase_module)...
docker compose run --rm api npx prisma migrate dev --name purchase_module
if errorlevel 1 goto fail

echo.
echo [3/5] refreshing the prisma client INSIDE the container...
docker compose exec api npx prisma generate
if errorlevel 1 goto fail

echo.
echo [4/5] rebuilding the api container (it serves compiled dist/)...
docker compose up -d --build api
if errorlevel 1 goto fail

echo.
echo [5/5] refreshing the prisma client on the HOST too...
REM (START_RADIAN.bat runs the api on the host with npm run start:dev —
REM  that copy of the client must also know the new tables)
cd /d D:\radian\apps\api
call npx prisma generate
cd /d D:\radian
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  DONE. Preview:
echo    http://localhost:3001/purchases        -^> Overview
echo    http://localhost:3001/purchases/new    -^> record a purchase
echo    http://localhost:3001/purchases/list   -^> the book
echo  (admin not running? double-click START_RADIAN.bat first)
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
