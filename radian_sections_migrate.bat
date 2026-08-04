@echo off
REM ============================================================
REM  Section headings — the three lines above every part of the
REM  website ("Curated for every moment" / "Shop by Category").
REM
REM  Adds one table: SectionText. It starts EMPTY; the API fills
REM  it on the next start with the wording that is on the site
REM  today, so nothing changes until you edit it.
REM ============================================================
cd /d D:\radian

echo [0/4] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [1/4] Applying the migration (section_text)...
docker compose exec api npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - read the error above. Nothing was applied.
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
