@echo off
REM ============================================================
REM  Homepage contents (3 Aug 2026).
REM
REM  Adds "show on the homepage" to tag groups, occasion/relation
REM  cards, and delivery speed cards — so the owner can choose
REM  what goes INSIDE each section, not just whether the section
REM  appears.
REM
REM  Nothing on the site changes look until he unticks something:
REM  the migration copies today's arrangement into the new
REM  columns first.
REM ============================================================
cd /d D:\radian

echo [0/3] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [1/3] Applying the migration (homepage_contents)...
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
