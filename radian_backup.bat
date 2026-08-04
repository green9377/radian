@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  Radian - database backup
REM
REM  Right now the whole business lives in ONE Docker volume:
REM  the ledger, staff, payroll, customers, products, orders,
REM  marketing. There is no copy of it anywhere. One bad
REM  "docker volume rm", one failed disk, one migration that
REM  goes sideways, and all of it is gone.
REM
REM  This takes a compressed copy and keeps the last 14.
REM
REM  Where it goes:  D:\radian\backups\
REM  What it makes:  radian_YYYY-MM-DD_HHMM.dump
REM
REM  It also writes a line into the audit trail, so the panel
REM  can say when the last backup happened without anybody
REM  having to go and look at the folder.
REM
REM  SAFE TO RUN ANY TIME. It only reads. The shop can keep
REM  selling while it runs.
REM ============================================================
cd /d D:\radian
set DIR=D:\radian\backups
set LOG=D:\radian\_backup.log
set KEEP=14

if not exist "%DIR%" mkdir "%DIR%"

REM ---- a sortable timestamp that does not depend on the locale ----
for /f "tokens=* usebackq" %%t in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"`) do set STAMP=%%t
set FILE=radian_%STAMP%.dump

echo ===== radian_backup %STAMP% ===== > "%LOG%"

echo.
echo [1/5] Checking Docker...
docker version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Open Docker Desktop, wait for
  echo "Engine running", then run this file again.
  pause && exit /b 1
)

echo [2/5] Making sure the database is up...
docker compose up -d postgres >> "%LOG%" 2>&1
timeout /t 5 /nobreak >nul

echo [3/5] Taking the backup...
REM -Fc = compressed custom format, the one pg_restore likes best
docker compose exec -T postgres pg_dump -U radian_user -d radian_db -Fc > "%DIR%\%FILE%" 2>> "%LOG%"
if errorlevel 1 (
  echo.
  echo BACKUP FAILED - see %LOG%
  del "%DIR%\%FILE%" 2>nul
  pause && exit /b 1
)

REM ---- a zero-byte file is a failed backup wearing a filename ----
for %%A in ("%DIR%\%FILE%") do set SIZE=%%~zA
if "%SIZE%"=="0" (
  echo.
  echo BACKUP FAILED - the file came out empty. See %LOG%
  del "%DIR%\%FILE%" 2>nul
  pause && exit /b 1
)
if %SIZE% LSS 10000 (
  echo.
  echo WARNING - the backup is only %SIZE% bytes. That is very small
  echo for a whole database. Check %LOG% before trusting it.
)

echo [4/5] Removing copies older than the last %KEEP%...
REM keep the newest %KEEP%, delete the rest
powershell -NoProfile -Command "Get-ChildItem '%DIR%\radian_*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip %KEEP% | Remove-Item -Force" >> "%LOG%" 2>&1

echo [5/5] Writing it into the audit trail...
docker compose exec -T postgres psql -U radian_user -d radian_db -c "INSERT INTO \"AuditLog\" (\"id\",\"entityType\",\"entityId\",\"action\",\"actorName\",\"changes\") VALUES (md5(random()::text || clock_timestamp()::text), 'Backup', 'database', 'CREATE', 'backup script', json_build_object('file','%FILE%','bytes',%SIZE%)::jsonb);" >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Backup done.
echo.
echo    %DIR%\%FILE%
echo    %SIZE% bytes
echo.
echo  Keeping the last %KEEP% copies. Older ones are removed.
echo.
echo  A backup sitting on the same disk as the database is only
echo  half a backup - it survives a mistake, not a dead drive.
echo  Copy this folder to Google Drive, a pen drive, anywhere
echo  that is not this computer.
echo.
echo  To make this run by itself every night:
echo    D:\radian\radian_backup_schedule.bat
echo ============================================================
echo.
pause
