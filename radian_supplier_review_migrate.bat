@echo off
REM ============================================================
REM  Radian - Supplier review fixes (23 Jul 2026)  SUP-R11/R12
REM  ONE additive column: SupplierCredit.appliedAt (credit-apply flow)
REM  Then regenerate the prisma client INSIDE the container (the
REM  compose node_modules volume shadows rebuilt images - learned
REM  today) and restart the watcher. Nothing dropped, no stock.
REM ============================================================
cd /d D:\radian

echo.
echo [1/3] applying the migration (supplier_credit_applied)...
docker compose run --rm api npx prisma migrate dev --name supplier_credit_applied
if errorlevel 1 goto fail

echo.
echo [2/3] regenerating the prisma client INSIDE the api container...
docker compose exec -T api npx prisma generate
if errorlevel 1 goto fail

echo.
echo [3/3] restarting the api...
docker compose restart api
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  DONE. Give it ~20s, then refresh the Suppliers pages.
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
