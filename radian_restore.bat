@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  Radian - put a backup back
REM
REM  *** READ THIS BEFORE PRESSING ANYTHING ***
REM
REM  This THROWS AWAY the current database and replaces it with
REM  a copy from a chosen night. Everything that happened after
REM  that copy was taken is gone - every sale, every payment,
REM  every payroll run.
REM
REM  There is no undo. It asks twice, and the second time you
REM  have to type the word RESTORE in full.
REM
REM  Before it touches anything it takes a fresh backup of what
REM  is there now, so a restore you regret can itself be undone.
REM
REM  Use it when: the database is corrupt, a migration went
REM  wrong, or somebody deleted something that cannot be got
REM  back any other way.
REM
REM  Do NOT use it to "go back a bit" on a working system. The
REM  shop will have taken orders since then and they will
REM  vanish without a trace.
REM ============================================================
cd /d D:\radian
set DIR=D:\radian\backups
set LOG=D:\radian\_restore.log

echo.
echo ============================================================
echo   RESTORING A BACKUP
echo   This replaces everything in the database.
echo ============================================================
echo.

if not exist "%DIR%" (
  echo There is no backups folder yet. Run radian_backup.bat first.
  pause && exit /b 1
)

docker version >nul 2>&1
if errorlevel 1 (
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and try again.
  pause && exit /b 1
)

echo Backups on this computer, newest first:
echo.
powershell -NoProfile -Command "$i=0; Get-ChildItem '%DIR%\radian_*.dump' | Sort-Object LastWriteTime -Descending | ForEach-Object { $i++; '{0,3}  {1}   {2:N0} bytes   {3}' -f $i, $_.Name, $_.Length, $_.LastWriteTime }"
echo.

set /p PICK=Type the number of the one to put back (or press Enter to stop):
if "%PICK%"=="" echo Nothing was changed. && pause && exit /b 0

for /f "tokens=* usebackq" %%f in (`powershell -NoProfile -Command "(Get-ChildItem '%DIR%\radian_*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Index (%PICK% - 1)).Name"`) do set CHOSEN=%%f
if "%CHOSEN%"=="" echo That number is not in the list. Nothing was changed. && pause && exit /b 1

echo.
echo ============================================================
echo   About to replace the WHOLE database with:
echo.
echo       %CHOSEN%
echo.
echo   Everything the shop has done since that copy was taken
echo   will be gone. Orders, payments, payroll, stock - all of it.
echo ============================================================
echo.
set /p SURE=Type RESTORE in capitals to go ahead:
if not "%SURE%"=="RESTORE" echo Nothing was changed. && pause && exit /b 0

echo.
echo [1/5] Taking a copy of what is there NOW, in case this was a mistake...
for /f "tokens=* usebackq" %%t in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"`) do set STAMP=%%t
docker compose up -d postgres >> "%LOG%" 2>&1
timeout /t 5 /nobreak >nul
docker compose exec -T postgres pg_dump -U radian_user -d radian_db -Fc > "%DIR%\before_restore_%STAMP%.dump" 2>> "%LOG%"
echo       saved as before_restore_%STAMP%.dump

echo [2/5] Stopping the API so nothing writes while we work...
docker compose stop api web >> "%LOG%" 2>&1

echo [3/5] Putting the backup back...
docker compose exec -T postgres pg_restore -U radian_user -d radian_db --clean --if-exists --no-owner < "%DIR%\%CHOSEN%" >> "%LOG%" 2>&1

echo [4/5] Starting everything again...
docker compose up -d >> "%LOG%" 2>&1
timeout /t 25 /nobreak >nul

echo [5/5] Collecting the log...
docker compose ps >> "%LOG%" 2>&1
docker compose logs --tail=40 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done. The database is now as it was in %CHOSEN%.
echo.
echo  If this was a mistake, the copy from a moment ago is:
echo     before_restore_%STAMP%.dump
echo.
echo  Open the panel and check a few things you know:
echo     http://localhost:3001/finance      the ledger
echo     http://localhost:3001/orders/list  recent orders
echo.
echo  pg_restore always prints some warnings about things that
echo  did not exist to be dropped. Those are normal. Look in
echo  D:\radian\_restore.log only if the panel is wrong.
echo ============================================================
echo.
pause
