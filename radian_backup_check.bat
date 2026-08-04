@echo off
REM ============================================================
REM  Radian - is the backup actually happening?
REM
REM  A backup you have not checked is a backup you do not have.
REM  This answers three questions and changes nothing:
REM
REM    1. is the nightly task registered, and when does it run?
REM    2. what copies exist, and how old is the newest?
REM    3. is the newest one a real database dump, or an empty
REM       file wearing the right name?
REM
REM  Safe to run whenever. It only looks.
REM ============================================================
cd /d D:\radian
set DIR=D:\radian\backups

echo.
echo ============================================================
echo   BACKUP CHECK
echo ============================================================
echo.

echo -- 1. The nightly task --------------------------------------
schtasks /query /tn "RadianBackup" /fo LIST /v 2>nul | findstr /C:"TaskName" /C:"Status" /C:"Next Run Time" /C:"Last Run Time" /C:"Last Result"
if errorlevel 1 (
  echo.
  echo   NOT REGISTERED. The backup will only happen when you
  echo   run radian_backup.bat by hand.
  echo.
  echo   To fix: right-click radian_backup_schedule.bat and
  echo   choose "Run as administrator".
)
echo.

echo -- 2. The copies on this computer ---------------------------
if not exist "%DIR%" (
  echo   No backups folder at all. Run radian_backup.bat.
  goto :done
)
powershell -NoProfile -Command "$f = Get-ChildItem '%DIR%\radian_*.dump' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending; if (-not $f) { '   None yet. Run radian_backup.bat.'; exit }; '   {0} copies, oldest {1:yyyy-MM-dd}' -f $f.Count, $f[-1].LastWriteTime; ''; $f | Select-Object -First 5 | ForEach-Object { '   {0}   {1:N0} bytes   {2:yyyy-MM-dd HH:mm}' -f $_.Name, $_.Length, $_.LastWriteTime }"
echo.

echo -- 3. How old is the newest, and is it real? ----------------
powershell -NoProfile -Command "$f = Get-ChildItem '%DIR%\radian_*.dump' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not $f) { exit }; $h = [math]::Round(((Get-Date) - $f.LastWriteTime).TotalHours, 1); if ($h -lt 30) { '   Newest is ' + $h + ' hours old - fine.' } else { '   *** Newest is ' + $h + ' hours old. Something is not running. ***' }; $b = [System.IO.File]::ReadAllBytes($f.FullName)[0..4]; $s = -join ($b | ForEach-Object { [char]$_ }); if ($s -eq 'PGDMP') { '   It starts with PGDMP - a real database dump.' } else { '   *** It does NOT look like a database dump. Do not trust it. ***' }"

:done
echo.
echo ============================================================
echo  Remember: a copy on this same disk survives a mistake,
echo  not a dead drive. Copy D:\radian\backups\ to Google Drive
echo  or a pen drive now and then.
echo ============================================================
echo.
pause
