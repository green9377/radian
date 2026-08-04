@echo off
REM ============================================================
REM  Radian - POS module migration + rebuild (23 Jul 2026)
REM  RADIAN_POS_MODULE_ARCHITECTURE.md  -  DEC-POS-001..017
REM
REM  New tables (POS-owned peripherals):
REM    PosRegister / PosShift / PosCashMovement /
REM    PosHeldCart / PosDiscountRule / PosSetting
REM  New enums: FulfillmentType, PosShiftStatus, PosCashKind
REM  Enum values ADDED (additive): DeliveryZone += COUNTER;
REM    PaymentMethod += counter, cash, bkash, nagad, card
REM  ADDITIVE columns on Order (nothing dropped, no data touched):
REM    fulfillmentType (default DELIVERY) . branchId . posShiftId .
REM    vatPaisa . taxRateBps
REM
REM  POS sale = an Order (channel=POS, fulfillmentType=COUNTER, DEC-POS-001).
REM  Stock deducts through InventoryService only (INV-RULE-001), parallel /
REM  fail-soft while the owner's Inventory live-verify is pending (DEC-INV-015).
REM
REM  If prisma warns about DROPPING anything: answer N and paste the
REM  message into the chat (this migration is meant to be additive only).
REM ============================================================
cd /d D:\radian

echo.
echo [1/5] starting postgres + api containers...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/5] creating + applying the migration (pos_module)...
docker compose run --rm api npx prisma migrate dev --name pos_module
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
echo    http://localhost:3001/pos            -^> Overview
echo    http://localhost:3001/pos/sell       -^> Sell counter
echo    http://localhost:3001/pos/shift      -^> Today / Shift
echo    http://localhost:3001/pos/day-close  -^> Day-close
echo    http://localhost:3001/pos/due        -^> Due board
echo  API: http://localhost:4000/pos/settings  (should return JSON)
echo  (admin not running? double-click START_RADIAN.bat first)
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
