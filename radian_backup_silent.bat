@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  Radian - the nightly backup, with nothing to press
REM
REM  Same job as radian_backup.bat, but it never waits for a
REM  key and never opens a window that stays open. This is the
REM  one Windows Task Scheduler runs at 1:30 AM.
REM
REM  Do not double-click this yourself - use radian_backup.bat,
REM  which tells you what happened.
REM
REM  Everything it does is written to D:\radian\_backup.log
REM ============================================================
cd /d D:\radian
set DIR=D:\radian\backups
set LOG=D:\radian\_backup.log
set KEEP=14

if not exist "%DIR%" mkdir "%DIR%"

for /f "tokens=* usebackq" %%t in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"`) do set STAMP=%%t
set FILE=radian_%STAMP%.dump

echo ===== nightly backup %STAMP% ===== >> "%LOG%"

docker version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo DOCKER NOT RUNNING - no backup taken >> "%LOG%"
  exit /b 1
)

docker compose up -d postgres >> "%LOG%" 2>&1
timeout /t 8 /nobreak >nul

docker compose exec -T postgres pg_dump -U radian_user -d radian_db -Fc > "%DIR%\%FILE%" 2>> "%LOG%"
if errorlevel 1 (
  echo pg_dump FAILED >> "%LOG%"
  del "%DIR%\%FILE%" 2>nul
  exit /b 1
)

for %%A in ("%DIR%\%FILE%") do set SIZE=%%~zA
if "%SIZE%"=="0" (
  echo the dump came out EMPTY - deleted >> "%LOG%"
  del "%DIR%\%FILE%" 2>nul
  exit /b 1
)

powershell -NoProfile -Command "Get-ChildItem '%DIR%\radian_*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip %KEEP% | Remove-Item -Force" >> "%LOG%" 2>&1

docker compose exec -T postgres psql -U radian_user -d radian_db -c "INSERT INTO \"AuditLog\" (\"id\",\"entityType\",\"entityId\",\"action\",\"actorName\",\"changes\") VALUES (md5(random()::text || clock_timestamp()::text), 'Backup', 'database', 'CREATE', 'nightly', json_build_object('file','%FILE%','bytes',%SIZE%)::jsonb);" >> "%LOG%" 2>&1

echo ok %FILE% %SIZE% bytes >> "%LOG%"
exit /b 0
