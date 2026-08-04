@echo off
REM ============================================================
REM  Colour backfill — the old typed word becomes a real link.
REM
REM  Until 31 Jul a product's colour was a word typed into the
REM  product ("Red") plus a copy of its hex. Now it is a link
REM  into Variant & Options (D-CAT-01). The two old columns are
REM  finished and will be dropped — but not before every product
REM  carries the link, or those products lose their colour.
REM
REM  RUN IT TWICE.
REM    1. plain          - shows what it WOULD do, writes nothing
REM    2. with  apply    - actually links them
REM
REM      radian_colour_backfill.bat
REM      radian_colour_backfill.bat apply
REM
REM  It never invents a colour. A product saying "Rose Gold" when
REM  the master has no Rose Gold is REPORTED, not guessed — that
REM  is a decision about the shop's colour list, and it is yours.
REM ============================================================
setlocal
cd /d D:\radian

echo [0/2] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

if /I "%1"=="apply" (
  echo [1/2] Linking the products...
  docker compose exec -T api node prisma/backfill-variant-colour.js --apply
) else (
  echo [1/2] Dry run — nothing will be written...
  docker compose exec -T api node prisma/backfill-variant-colour.js
)

if errorlevel 1 (
  echo.
  echo FAILED — read the error above. Nothing was changed.
  pause && exit /b 1
)

echo.
echo [2/2] Done.
if /I not "%1"=="apply" (
  echo.
  echo   Nothing was written. Happy with the list above?
  echo   Run it again like this:  radian_colour_backfill.bat apply
)
echo.
pause
