@echo off
REM ============================================================
REM  APPLY EVERY PENDING MIGRATION. Run this one, always.
REM
REM  WHY IT EXISTS, 31 Jul 2026. Each feature got its own
REM  migrate .bat, and each one runs `prisma migrate deploy`,
REM  which applies EVERYTHING pending anyway. So the per-feature
REM  files only ever differed in what they printed - and the day
REM  a migration was written after one of them had already been
REM  run, it sat unapplied with nothing to say so.
REM
REM  That is exactly what happened: Category.sizeLabel existed in
REM  the code and not in the database, so saving a product died
REM  with "Internal server error" - the product save reads the
REM  category, and the category had a column Prisma expected and
REM  Postgres had never heard of.
REM
REM  This file lists what is pending BEFORE and AFTER, so you can
REM  see it happen instead of trusting it.
REM
REM  Safe: `migrate deploy` never drops, never resets, and does
REM  nothing at all when everything is already applied.
REM ============================================================
cd /d D:\radian

echo [0/5] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo.
  echo   The API container is not running. Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo.
echo [1/5] What is pending right now:
echo ------------------------------------------------------------
docker compose exec api npx prisma migrate status
echo ------------------------------------------------------------

echo.
echo [2/5] Applying everything pending...
docker compose exec api npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - read the error above. Nothing else will run.
  pause && exit /b 1
)

echo.
echo [3/5] Confirming nothing is left:
echo ------------------------------------------------------------
docker compose exec api npx prisma migrate status
echo ------------------------------------------------------------

echo.
echo [4/5] Refreshing the Prisma client inside the container...
REM  This is the half people forget. The database can be right and
REM  the client still be generated from an older schema - the same
REM  mismatch, in the other direction, with the same 500s.
docker compose exec api npx prisma generate
if errorlevel 1 (
  echo CLIENT GENERATE FAILED - read the error above.
  pause && exit /b 1
)

echo.
echo [5/5] Restarting and waiting for the API...
call D:\radian\radian_apply.bat
