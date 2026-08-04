@echo off
REM ============================================================
REM  Footer & menus — the link columns at the bottom of every
REM  page, the slide-out menu behind the ☰, the social icons,
REM  and the "We accept" badges.
REM
REM  Seeded with exactly what is on the site today.
REM ============================================================
cd /d D:\radian

echo [0/3] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [1/3] Applying the migration (footer)...
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
