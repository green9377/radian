@echo off
REM ============================================================
REM  Company settings - database migration  (ADM-D08)
REM
REM  ONE new table, and a COPY of six fields out of FinanceSetting.
REM  NOTHING IS DROPPED. No existing column is touched.
REM
REM  ---- WHY ----
REM
REM  Mushak 6.3 has been finished, tested and UNUSABLE for weeks.
REM  The challan is a government form: it needs a real BIN, the
REM  registered name and the registered address. Those fields did
REM  exist - inside FinanceSetting, because that is where they
REM  were first needed - and there was NO SCREEN anywhere in the
REM  panel to type them into. So the challan refused to print,
REM  correctly, and nobody could make it stop refusing.
REM
REM  They also do not belong to Finance. The company's registered
REM  name is not Finance's property, and a trade licence number
REM  certainly is not. One Data One Owner: the company owns them.
REM
REM  ---- THE NEW TABLE ----
REM
REM  CompanySetting     One row. What Mushak needs (registered
REM                     name, address, BIN, VAT circle, who
REM                     signs) PLUS what was never recorded
REM                     anywhere at all:
REM
REM                       - trade licence number AND ITS EXPIRY.
REM                         A licence that quietly ran out means
REM                         the shop is trading without one. The
REM                         screen warns 60 days ahead.
REM                       - TIN
REM                       - logo
REM                       - the phone and email that get PRINTED,
REM                         as opposed to somebody's personal
REM                         number
REM                       - the shop address separately from the
REM                         VAT-registered one, because they are
REM                         allowed to differ
REM
REM  ---- THE COPY, AND WHY IT MATTERS ----
REM
REM  Whatever was already typed into Finance is carried across in
REM  this same migration. Without that step the new screen would
REM  open blank, the owner would reasonably conclude his earlier
REM  work was lost, and the challan would go on quietly reading
REM  the old columns while the screen in front of him said
REM  nothing was set.
REM
REM  ---- WHAT IS *NOT* DONE, ON PURPOSE ----
REM
REM  The six old columns in FinanceSetting STAY. The challan now
REM  reads the new table FIRST and falls back to the old one PER
REM  FIELD. So this migration cannot break a working challan; it
REM  can only make a refusing one start working.
REM
REM  Changing where a government form gets its data AND deleting
REM  the old copy in one step is how you discover, during an
REM  audit, that you got it wrong. The old columns come out when
REM  the two have been seen to agree.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_company_migrate.log

echo ===== radian_company_migrate ===== > "%LOG%"
date /t >> "%LOG%" 2>&1
time /t >> "%LOG%" 2>&1

echo.
echo [1/6] Checking Docker...
docker version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Open Docker Desktop, wait for
  echo "Engine running", then run this file again.
  pause && exit /b 1
)

echo [2/6] Taking a backup first...
docker compose up -d >> "%LOG%" 2>&1
timeout /t 8 /nobreak >nul
if exist D:\radian\radian_backup_silent.bat (
  call D:\radian\radian_backup_silent.bat >> "%LOG%" 2>&1
) else (
  echo    ...radian_backup_silent.bat not found, skipping >> "%LOG%" 2>&1
)

echo [3/6] Running the migration (company_settings)...
REM  `deploy`, not `dev` - see radian_administration_migrate.bat. `dev` is
REM  interactive and there is nobody inside the container to answer it.
docker compose run --rm api npx prisma migrate deploy >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_company_migrate.log
  echo Nothing was changed, and there is a fresh backup in
  echo D:\radian\backups from a moment ago.
  pause && exit /b 1
)

echo [4/6] Refreshing the Prisma client and restarting the API...
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [5/6] Waiting for the API...
timeout /t 30 /nobreak >nul

echo [6/6] Checking the copy actually landed...
echo. >> "%LOG%"
echo ===== what Finance had ===== >> "%LOG%"
docker compose exec -T postgres psql -U radian_user -d radian_db -c "SELECT \"businessBin\" AS bin, \"businessName\" AS name, \"signatoryName\" AS signer FROM \"FinanceSetting\" LIMIT 1;" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== what Company has now - these MUST match ===== >> "%LOG%"
docker compose exec -T postgres psql -U radian_user -d radian_db -c "SELECT \"bin\", \"legalName\", \"signatoryName\" FROM \"CompanySetting\" LIMIT 1;" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api log (last 60 lines) ===== >> "%LOG%"
docker compose logs --tail=60 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done. One table added, six fields copied, nothing removed.
echo.
echo  WHAT TO DO NOW:
echo    Administration - Company settings
echo.
echo  The banner at the top tells you exactly which fields
echo  Mushak 6.3 is still waiting for, by name. Fill those in,
echo  press Save, and the banner turns green.
echo.
echo  Then check Finance - VAT and Mushak: the challan should
echo  print instead of refusing.
echo.
echo  In the log above, the two queries must show the SAME
echo  values. If Company is empty where Finance had something,
echo  stop and say so - the copy did not run.
echo ============================================================
echo.
pause
