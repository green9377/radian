@echo off
REM ============================================================
REM  Demo catalogue -> database (31 Jul 2026)
REM
REM  SAFE TO RUN, AND SAFE TO RUN TWICE. Unlike radian_seed.bat
REM  this one does NOT truncate anything. It only adds what is
REM  missing: a category, tag or product that already exists is
REM  left exactly as it is.
REM
REM  Adds the 71 demo products so every product page, rail and
REM  category page has something real behind it. Edit or delete
REM  them in the admin like any other product.
REM ============================================================
cd /d "D:\radian\apps\api"
node seed_demo_products.mjs
echo.
echo Demo seed finished - open D:\radian\_seed_demo.log to see what happened
pause
