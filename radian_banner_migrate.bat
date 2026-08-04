@echo off
REM ============================================================
REM  Banners — the homepage slider, the promo strip and the
REM  purple announcement line, all managed from the admin panel.
REM
REM  Adds two tables: Banner and StorefrontSetting.
REM
REM  The migration also copies the banners that were hard-coded in
REM  the website into the database, so nothing disappears when the
REM  homepage starts reading from here. You edit what is already
REM  there instead of filling a blank screen.
REM ============================================================
cd /d D:\radian

echo [1/4] Applying the migration (banners)...
docker compose exec api npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - read the error above. Nothing was applied.
  echo If Docker Desktop is not running, start it and run this file again.
  pause && exit /b 1
)

echo [2/4] Refreshing the Prisma client inside the container...
docker compose exec api npx prisma generate
if errorlevel 1 (
  echo CLIENT GENERATE FAILED - read the error above.
  pause && exit /b 1
)

echo [3/4] Restarting and waiting for the API...
call D:\radian\radian_apply.bat
