@echo off
REM ============================================================
REM  Category page - what is actually wrong.
REM
REM  Everything goes into category_check.txt and Notepad opens it,
REM  because the answer scrolls off the top of a cmd window and
REM  the part that scrolls away is the part that matters.
REM ============================================================
setlocal
cd /d D:\radian
set SLUG=%1
if "%SLUG%"=="" set SLUG=flower
set OUT=D:\radian\category_check.txt

echo Checking... this takes a few seconds.

> "%OUT%" echo ============================================================
>>"%OUT%" echo  1. Which slugs does the shop actually have?
>>"%OUT%" echo ============================================================
>>"%OUT%" curl -s http://localhost:4000/shop/categories
>>"%OUT%" echo.

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  2. Is the new endpoint mapped at all?
>>"%OUT%" echo ============================================================
>>"%OUT%" docker compose logs api 2>^&1 | findstr /C:"/shop/category" /C:"/shop/products"
>>"%OUT%" echo   ^(nothing above = the route was never registered^)

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  3. Asking for "%SLUG%"
>>"%OUT%" echo ============================================================
for /f %%i in ('curl -s -o nul -w "%%{http_code}" http://localhost:4000/shop/category/%SLUG%') do >>"%OUT%" echo   HTTP %%i
>>"%OUT%" echo.
>>"%OUT%" echo   Body:
>>"%OUT%" curl -s http://localhost:4000/shop/category/%SLUG%
>>"%OUT%" echo.

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  4. Products endpoint
>>"%OUT%" echo ============================================================
for /f %%i in ('curl -s -o nul -w "%%{http_code}" "http://localhost:4000/shop/products?category=%SLUG%&limit=1"') do >>"%OUT%" echo   HTTP %%i
>>"%OUT%" curl -s "http://localhost:4000/shop/products?category=%SLUG%&limit=1"
>>"%OUT%" echo.

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  5. Migrations
>>"%OUT%" echo ============================================================
>>"%OUT%" docker compose exec -T api npx prisma migrate status 2>^&1

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  6. Any error in the API log
>>"%OUT%" echo ============================================================
>>"%OUT%" docker compose logs --tail 200 api 2>^&1 | findstr /I /C:"error" /C:"exception" /C:"prisma"

echo Done. Opening category_check.txt
start notepad "%OUT%"
