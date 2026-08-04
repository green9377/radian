@echo off
REM ============================================================
REM  Category page - demo data.
REM
REM  Run this AFTER radian_category_migrate.bat.
REM
REM  It fills in the things the page needs before every block can
REM  be seen working:
REM
REM    - Colour master (Red, Pink, White, Yellow, Purple, Mixed)
REM    - "Style" tag group (Bouquet, Box, Basket, Vase)
REM    - Occasions and Recipients tags
REM    - Four budget bands
REM    - Every published product gets a colour and three tags
REM      (only if it has none - your own choices are never
REM       overwritten)
REM    - Some products marked express and best seller
REM    - Five starter questions on every top-level category
REM
REM  Safe to run twice. It never deletes a product, never changes
REM  a price, and never overwrites something you set yourself.
REM  Everything it adds is editable in the admin afterwards.
REM ============================================================
cd /d D:\radian

echo [1/2] Is the API container up?
docker compose ps api | find "Up" >nul
if errorlevel 1 (
  echo   Starting it first...
  docker compose up -d api
  timeout /t 20 /nobreak >nul
)

echo [2/2] Filling in the demo data...
docker compose exec api node prisma/seed-category-demo.js
if errorlevel 1 (
  echo.
  echo FAILED - read the error above.
  echo If it mentions categoryFaq or variantValueId, run
  echo radian_category_migrate.bat first.
  pause && exit /b 1
)

echo.
echo Now open:  http://localhost:3000/categories/flower
pause
