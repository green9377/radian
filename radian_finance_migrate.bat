@echo off
REM ============================================================
REM  Finance module (ledger) — schema migrate + API rebuild
REM  RADIAN_FINANCE_MODULE_ARCHITECTURE.md v1.1 (DEC-FIN-001..028)
REM  Adds: FinanceAccount, JournalEntry/Line, Expense, Income, Transfer,
REM        Partner(+Transaction), FixedAsset, PrepaidItem, Loan(+Payment),
REM        CarrierRemittance, AccountReconciliation, PostingFailure, Setting
REM        + financePostedAt / buyerBin / DeliveryAssignment.costPaisa
REM ============================================================
cd /d D:\radian

echo [1/4] Running Prisma migration (finance_module)...
docker compose run --rm api npx prisma migrate dev --name finance_module
if errorlevel 1 (
  echo MIGRATION FAILED — read the error above. Nothing was applied. && pause && exit /b 1
)

echo [2/4] Rebuilding the API image (source is baked in)...
docker compose up -d --build api
if errorlevel 1 ( echo BUILD FAILED && pause && exit /b 1 )

echo [3/4] Refreshing the Prisma client INSIDE the container...
docker compose exec api npx prisma generate

echo [4/4] Restarting the API...
docker compose restart api

echo.
echo DONE. Check these in the browser:
echo    http://localhost:4000/finance/accounts          (should list ~50 accounts)
echo    http://localhost:4000/finance/accounts/summary
echo    http://localhost:4000/finance/settings
echo Then open the admin panel:  http://localhost:3001/finance/accounts
pause
