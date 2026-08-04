@echo off
REM ============================================================
REM  Category page — step 1 of the connection.
REM
REM  Adds three things, all additive (nothing is dropped, nothing
REM  changes meaning, the site keeps working while it runs):
REM
REM    1. CategoryFaq            - each category's own questions
REM    2. Product.variantValueId - the colour, picked from the
REM                                Variant & Option master instead
REM                                of typed into the product
REM    3. VariantValue.imageUrl  - the PHOTO option finally has
REM                                somewhere to keep the photo
REM
REM  Nothing on the storefront changes until the screens and the
REM  API that follow are built. Safe to run now.
REM ============================================================
cd /d D:\radian

echo [0/3] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [1/3] Applying the migration (category page)...
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
