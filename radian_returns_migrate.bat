@echo off
REM ============================================================
REM  Radian - Returns & Refunds module migration + rebuild (23 Jul 2026)
REM  RADIAN_RETURNS_MODULE_ARCHITECTURE.md  -  DEC-RTN-005..015
REM
REM  New tables (Returns-owned):
REM    ReturnReason / SalesReturn / SalesReturnLine /
REM    CustomerCredit / ReturnSetting
REM  New enums: ReturnStatus, ReturnResolution, ReturnRestockAction,
REM    ReturnRefundMethod, CustomerCreditKind
REM  Enum value ADDED (additive): PaymentMethod += bank
REM  ADDITIVE relations only (nothing dropped, no data touched):
REM    Order.returns . OrderLine.returnLines . Customer.returns/credits
REM
REM  Post-delivery grievance -> resolution. Owns Return/Refund entities
REM  (DEC-RTN-001..004). NEVER mutates Order.salesStatus. Refund payout is
REM  capped at what was actually collected. Restock flows through
REM  InventoryService only (SALE_RETURN, INV-RULE-001).
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
echo [2/5] creating + applying the migration (returns_module)...
docker compose run --rm api npx prisma migrate dev --name returns_module
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
echo    http://localhost:3001/returns           -^> Overview / list
echo    http://localhost:3001/returns/new       -^> New return
echo    http://localhost:3001/returns/settings  -^> Reasons + settings
echo  API: http://localhost:4000/returns/settings  (should return JSON)
echo  API: http://localhost:4000/returns/reasons   (should return [])
echo  (admin not running? double-click START_RADIAN.bat first)
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
