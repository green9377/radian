@echo off
REM ============================================================
REM  Finance — round 2 (Biznify gap fixes + real Overview)
REM  Schema adds : AppUser + AppSession
REM  After this the admin panel asks for a login. First run shows a
REM  one-time setup form to create the owner account.
REM ============================================================
cd /d D:\radian

echo [1/4] Running Prisma migration (access_login)...
docker compose run --rm api npx prisma migrate dev --name access_login
if errorlevel 1 (
  echo MIGRATION FAILED - read the error above. Nothing was applied.
  echo If Docker Desktop is not running, start it and run this file again.
  pause && exit /b 1
)

echo [2/4] Rebuilding the API image (source is baked in)...
docker compose up -d --build api
if errorlevel 1 ( echo BUILD FAILED && pause && exit /b 1 )

echo [3/4] Refreshing the Prisma client INSIDE the container...
docker compose exec api npx prisma generate

echo [4/4] Restarting the API...
docker compose restart api

echo.
echo DONE. Open these:
echo    http://localhost:3001/finance          overview
echo    http://localhost:3001/finance/chart    chart of accounts
echo    http://localhost:3001/finance/recurring
echo    http://localhost:3001/finance/staff
pause
