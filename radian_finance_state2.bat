@echo off
REM ============================================================
REM  READ-ONLY - part 2, with the column names corrected
REM
REM  Six of the twelve questions in the first file failed because
REM  I guessed the column names instead of reading the schema.
REM  This asks those six again, properly. It still changes
REM  NOTHING - only reads.
REM
REM  Writes to  D:\radian\_finance_state2.txt
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_finance_state2.txt
set PSQL=docker compose exec -T postgres psql -U radian_user -d radian_db -P pager=off

echo ===== finance state part 2 ===== > "%OUT%"
date /t >> "%OUT%" 2>&1
time /t >> "%OUT%" 2>&1

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo Reading... (nothing is being changed)

echo. >> "%OUT%"
echo ===== 3. EXPENSES ===== >> "%OUT%"
%PSQL% -c "select e.\"expenseNo\", to_char(e.\"spentAt\",'YYYY-MM-DD') as on_date, round(e.\"amountPaisa\"/100.0,2) as taka, a.name as category, coalesce(e.\"payeeName\",'') as payee, left(coalesce(e.note,''),42) as note, e.approval from \"Expense\" e join \"FinanceAccount\" a on a.id=e.\"accountId\" where e.\"deletedAt\" is null order by e.\"spentAt\", e.\"expenseNo\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 4. INCOME (non-sales) ===== >> "%OUT%"
%PSQL% -c "select \"incomeNo\", to_char(\"earnedAt\",'YYYY-MM-DD') as on_date, round(\"amountPaisa\"/100.0,2) as taka, coalesce(\"payerName\",'') as payer, left(coalesce(note,''),42) as note from \"Income\" where \"deletedAt\" is null order by \"earnedAt\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 6. FIXED ASSETS ===== >> "%OUT%"
%PSQL% -c "select \"assetNo\", name, to_char(\"purchasedAt\",'YYYY-MM-DD') as bought, round(\"costPaisa\"/100.0,2) as taka, \"usefulLifeMonths\" as life_months, round(\"accumDepPaisa\"/100.0,2) as depreciated from \"FixedAsset\" where \"deletedAt\" is null order by \"purchasedAt\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 8. LOANS ===== >> "%OUT%"
%PSQL% -c "select \"loanNo\", \"lenderName\", kind, to_char(\"startsOn\",'YYYY-MM-DD') as starts, round(\"principalPaisa\"/100.0,2) as principal, \"interestRateBp\" as rate_bp, left(coalesce(note,''),36) as note from \"Loan\" where \"deletedAt\" is null order by \"startsOn\";" >> "%OUT%" 2>&1
%PSQL% -c "select l.\"loanNo\", to_char(p.\"paidOn\",'YYYY-MM-DD') as paid_on, round(p.\"amountPaisa\"/100.0,2) as taka from \"LoanPayment\" p join \"Loan\" l on l.id=p.\"loanId\" order by p.\"paidOn\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 9. CARRIER REMITTANCES ===== >> "%OUT%"
%PSQL% -c "select \"remittanceNo\", to_char(\"receivedAt\",'YYYY-MM-DD') as on_date, \"carrierName\", round(\"grossPaisa\"/100.0,2) as gross, round(\"chargePaisa\"/100.0,2) as charge, round(\"netPaisa\"/100.0,2) as net from \"CarrierRemittance\" where \"deletedAt\" is null order by \"receivedAt\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 10. EXPENSE ACCOUNTS MISSING FIXED/VARIABLE ===== >> "%OUT%"
%PSQL% -c "select code, name, coalesce(\"costBehavior\"::text,'-- NOT SET --') as behavior from \"FinanceAccount\" where type='EXPENSE' and \"deletedAt\" is null order by (\"costBehavior\" is not null), code;" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 13. ORDERS - are they real or seeded? ===== >> "%OUT%"
%PSQL% -c "select \"orderNo\", to_char(\"placedAt\",'YYYY-MM-DD') as placed, \"salesStatus\", \"deliveryStatus\", round(\"grandTotalPaisa\"/100.0,2) as taka from \"Order\" where \"deletedAt\" is null order by \"placedAt\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 14. WHAT IS SITTING IN EACH MONEY ACCOUNT, ENTRY BY ENTRY ===== >> "%OUT%"
%PSQL% -c "select a.code, a.name, e.\"entryNo\", to_char(e.\"entryDate\",'YYYY-MM-DD') as on_date, round((l.\"debitPaisa\"-l.\"creditPaisa\")/100.0,2) as movement, left(coalesce(e.narration,''),44) as narration from \"JournalLine\" l join \"FinanceAccount\" a on a.id=l.\"accountId\" join \"JournalEntry\" e on e.id=l.\"entryId\" where a.code in ('1000','1010','1040') order by a.code, e.\"entryDate\", e.\"entryNo\";" >> "%OUT%" 2>&1

echo.
echo DONE - nothing was changed.
echo The report is at  D:\radian\_finance_state2.txt
echo.
pause
