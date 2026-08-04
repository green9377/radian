@echo off
REM ============================================================
REM  READ-ONLY - what is actually in the books right now
REM
REM  This file changes NOTHING. It only reads, and writes what it
REM  found to  D:\radian\_finance_state.txt  so Claude can look at
REM  the real data instead of guessing before telling you what to
REM  delete. Deleting the wrong row is a money mistake.
REM
REM  Safe to run any number of times.
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_finance_state.txt
set PSQL=docker compose exec -T postgres psql -U radian_user -d radian_db -P pager=off

echo ===== finance state ===== > "%OUT%"
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

echo Reading the books... (nothing is being changed)

echo. >> "%OUT%"
echo ===== 1. ACCOUNTS WITH A BALANCE ===== >> "%OUT%"
%PSQL% -c "select a.code, a.name, a.type, round(sum(l.\"debitPaisa\"-l.\"creditPaisa\")/100.0,2) as balance_taka, count(*) as lines from \"FinanceAccount\" a join \"JournalLine\" l on l.\"accountId\"=a.id group by a.code,a.name,a.type having sum(l.\"debitPaisa\"-l.\"creditPaisa\") <> 0 order by a.code;" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 2. EVERY JOURNAL ENTRY ===== >> "%OUT%"
%PSQL% -c "select \"entryNo\", to_char(\"entryDate\",'YYYY-MM-DD') as on_date, \"sourceType\", left(coalesce(narration,''),60) as narration, coalesce(left(\"sourceKey\",28),'') as source_key, \"isManual\" from \"JournalEntry\" order by \"entryDate\", \"entryNo\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 3. EXPENSES ===== >> "%OUT%"
%PSQL% -c "select \"expenseNo\", to_char(\"spentAt\",'YYYY-MM-DD') as on_date, round(\"amountPaisa\"/100.0,2) as taka, coalesce(\"payeeName\",'') as payee, left(coalesce(note,''),40) as note, \"approvalState\", \"postingState\" from \"Expense\" where \"deletedAt\" is null order by \"spentAt\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 4. INCOME (non-sales) ===== >> "%OUT%"
%PSQL% -c "select \"incomeNo\", to_char(\"receivedAt\",'YYYY-MM-DD') as on_date, round(\"amountPaisa\"/100.0,2) as taka, left(coalesce(note,''),40) as note from \"Income\" where \"deletedAt\" is null order by \"receivedAt\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 5. PARTNERS AND THEIR MOVEMENTS ===== >> "%OUT%"
%PSQL% -c "select id, name, kind, \"sharePercentBp\" from \"Partner\" where \"deletedAt\" is null;" >> "%OUT%" 2>&1
%PSQL% -c "select p.name, t.kind, to_char(t.\"happenedAt\",'YYYY-MM-DD') as on_date, round(t.\"amountPaisa\"/100.0,2) as taka, left(coalesce(t.note,''),40) as note from \"PartnerTransaction\" t join \"Partner\" p on p.id=t.\"partnerId\" where t.\"deletedAt\" is null order by t.\"happenedAt\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 6. FIXED ASSETS ===== >> "%OUT%"
%PSQL% -c "select name, to_char(\"boughtOn\",'YYYY-MM-DD') as bought, round(\"costPaisa\"/100.0,2) as taka, \"usefulLifeMonths\" from \"FixedAsset\" where \"deletedAt\" is null order by \"boughtOn\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 7. PREPAID (rent paid ahead etc) ===== >> "%OUT%"
%PSQL% -c "select name, to_char(\"startsOn\",'YYYY-MM-DD') as starts, \"months\", round(\"totalPaisa\"/100.0,2) as taka from \"PrepaidItem\" where \"deletedAt\" is null order by \"startsOn\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 8. LOANS ===== >> "%OUT%"
%PSQL% -c "select name, kind, to_char(\"takenOn\",'YYYY-MM-DD') as taken, round(\"principalPaisa\"/100.0,2) as principal from \"Loan\" where \"deletedAt\" is null order by \"takenOn\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 9. CARRIER REMITTANCES ===== >> "%OUT%"
%PSQL% -c "select \"remitNo\", to_char(\"receivedAt\",'YYYY-MM-DD') as on_date, round(\"amountPaisa\"/100.0,2) as taka from \"CarrierRemittance\" where \"deletedAt\" is null order by \"receivedAt\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 10. EXPENSE ACCOUNTS MISSING FIXED/VARIABLE ===== >> "%OUT%"
%PSQL% -c "select code, name from \"FinanceAccount\" where type='EXPENSE' and \"deletedAt\" is null and behavior is null order by code;" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 11. FINANCE SETTINGS ===== >> "%OUT%"
%PSQL% -c "select \"goLiveDate\", \"lastClosedDate\", \"autoPostEnabled\", \"vatEnabled\", coalesce(\"businessBin\",'(not set)') as bin from \"FinanceSetting\";" >> "%OUT%" 2>&1

echo. >> "%OUT%"
echo ===== 12. HOW MUCH REAL TRADING IS THERE ===== >> "%OUT%"
%PSQL% -c "select 'orders' as what, count(*) from \"Order\" where \"deletedAt\" is null union all select 'purchases', count(*) from \"Purchase\" where \"deletedAt\" is null union all select 'customers', count(*) from \"Customer\" where \"deletedAt\" is null union all select 'items', count(*) from \"Item\" where \"deletedAt\" is null union all select 'employees', count(*) from \"Employee\" where \"deletedAt\" is null;" >> "%OUT%" 2>&1

echo.
echo DONE - nothing was changed.
echo The report is at  D:\radian\_finance_state.txt
echo Tell Claude it has run and he will read it.
echo.
pause
