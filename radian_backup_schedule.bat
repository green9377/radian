@echo off
REM ============================================================
REM  Radian - make the backup run by itself, every night
REM
REM  Registers a Windows Scheduled Task called "RadianBackup"
REM  that runs the backup at 1:30 AM daily.
REM
REM  1:30 AM is chosen on purpose: before the 2 AM sweeps
REM  (Finance drift, Marketing) so the copy is of a quiet
REM  database, and late enough that the shop is closed.
REM
REM  IF THE COMPUTER IS OFF AT 1:30 AM the task runs as soon
REM  as it is switched on again - a shop laptop is usually not
REM  running all night.
REM
REM  NO ADMINISTRATOR NEEDED. Just double-click it.
REM  (An earlier version asked for "Run as administrator". That
REM  was a mistake in the script - it carried /rl HIGHEST, which
REM  the backup never needed. Taking the parcel of your own
REM  database does not require the keys to the whole machine.)
REM
REM  To stop it later:
REM    schtasks /delete /tn RadianBackup /f
REM ============================================================
cd /d D:\radian

echo.
echo Registering the nightly backup...
echo.

schtasks /query /tn "RadianBackup" >nul 2>&1
if not errorlevel 1 (
  echo A task called RadianBackup already exists. Replacing it.
  schtasks /delete /tn "RadianBackup" /f >nul 2>&1
)

REM plain user rights - the backup only needs to talk to Docker,
REM which this account already can
schtasks /create /tn "RadianBackup" /tr "\"D:\radian\radian_backup_silent.bat\"" /sc daily /st 01:30 /f
if errorlevel 1 goto :failed

REM run it as soon as the machine is on again if 1:30 AM was missed
powershell -NoProfile -Command "try { $t = Get-ScheduledTask -TaskName 'RadianBackup'; $t.Settings.StartWhenAvailable = $true; $t.Settings.ExecutionTimeLimit = 'PT30M'; Set-ScheduledTask -TaskName 'RadianBackup' -Settings $t.Settings | Out-Null; 'catch-up on next start-up: on' } catch { 'note: could not set catch-up - the task still runs at 1:30 AM' }"

echo.
echo ============================================================
echo  Done. The backup runs every night at 1:30 AM.
echo.
echo  Check it took:   D:\radian\radian_backup_check.bat
echo  Run one now:     D:\radian\radian_backup.bat
echo  Stop it later:   schtasks /delete /tn RadianBackup /f
echo.
echo  STILL WORTH DOING BY HAND: copy D:\radian\backups\ to
echo  Google Drive or a pen drive now and then. A backup on the
echo  same disk survives a mistake, not a dead drive.
echo ============================================================
echo.
pause
exit /b 0

:failed
echo.
echo ============================================================
echo  COULD NOT REGISTER THE TASK.
echo.
echo  Some company-managed machines block scheduled tasks
echo  outright. If that is this one, nothing is broken - just
echo  run D:\radian\radian_backup.bat yourself once a week.
echo  It takes a few seconds.
echo ============================================================
echo.
pause
exit /b 1
