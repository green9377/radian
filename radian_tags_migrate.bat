@echo off
REM ============================================================
REM  "Every Occasion, Every Person" + the logo.
REM
REM  Adds one column: Tag.summary — the line under the name on
REM  each card ("Make their day unforgettable"), carried over
REM  from the website so nothing changes until you edit it.
REM
REM  The logo needs no migration: the column already existed.
REM  Upload it under Settings - Company.
REM ============================================================
cd /d D:\radian

echo [0/3] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [1/3] Applying the migration (tag_summary)...
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
