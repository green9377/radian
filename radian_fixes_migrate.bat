@echo off
REM ============================================================
REM  The homepage audit fixes (31 Jul 2026).
REM
REM  Adds two columns for the small card floating over the shop
REM  photograph, which was typed into the code.
REM
REM  Everything else in this batch of fixes needed no migration —
REM  the data was already in the admin and simply was not being
REM  read.
REM ============================================================
cd /d D:\radian

echo [0/3] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [1/3] Applying the migration (shop_chip)...
docker compose exec api npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - read the error above. Nothing was applied.
  pause && exit /b 1
)

echo [2/3] Refreshing the Prisma client inside the container...
docker compose exec api npx prisma generate
if errorlevel 1 (
  echo CLIENT GENERATE FAILED - read the error above.
  pause && exit /b 1
)

echo [3/3] Restarting and waiting for the API...
call D:\radian\radian_apply.bat
