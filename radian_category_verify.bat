@echo off
REM ============================================================
REM  Category page — is today's work actually live?
REM
REM  Run this AFTER the API has been restarted, because every
REM  change today is code: no migration, nothing to apply. If the
REM  API is still running yesterday's build, every answer below
REM  will be yesterday's answer.
REM
REM      radian_api_restart.bat        (first)
REM      radian_category_verify.bat    (then this)
REM
REM  Everything goes into category_verify.txt and Notepad opens
REM  it, because the part that scrolls off a cmd window is always
REM  the part that mattered.
REM ============================================================
setlocal
cd /d D:\radian
set SLUG=%1
if "%SLUG%"=="" set SLUG=fresh-flowers
set OUT=D:\radian\category_verify.txt

echo Checking "%SLUG%"... a few seconds.

> "%OUT%" echo ============================================================
>>"%OUT%" echo  1. Do the tiles link to a filter the page can READ?
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  Looking for "?tag=" and "?occasions=" and "?colour=".
>>"%OUT%" echo  Seeing "?style=" here means the API is still the old build —
>>"%OUT%" echo  those tiles reload the page and filter nothing.
>>"%OUT%" echo.
>>"%OUT%" curl -s "http://localhost:4000/shop/category/%SLUG%" ^| findstr /C:"href"
>>"%OUT%" echo.

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  2. Does the filter actually change the answer?
>>"%OUT%" echo ============================================================
>>"%OUT%" echo   all products:
for /f %%i in ('curl -s "http://localhost:4000/shop/products?category=%SLUG%&limit=1" ^| findstr /C:"total"') do >>"%OUT%" echo   %%i
>>"%OUT%" echo   express only ^(should be fewer^):
>>"%OUT%" curl -s "http://localhost:4000/shop/products?category=%SLUG%&speed=express&limit=1"
>>"%OUT%" echo.
>>"%OUT%" echo   sorted by price, low to high ^(first one should be the cheapest^):
>>"%OUT%" curl -s "http://localhost:4000/shop/products?category=%SLUG%&sort=price_asc&limit=1"
>>"%OUT%" echo.

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  3. The admin's hand-pick box — new "search" parameter
>>"%OUT%" echo ============================================================
>>"%OUT%" echo   ^(empty list here = old build; the box will look broken^)
>>"%OUT%" curl -s "http://localhost:4000/shop/products?category=%SLUG%&search=a&limit=3"
>>"%OUT%" echo.

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  4. Delivery band — real names, real countdown
>>"%OUT%" echo ============================================================
>>"%OUT%" echo   "minutesLeft" is minutes to today's cutoff. null = no cutoff
>>"%OUT%" echo   for that method ^(courier^), and then no countdown is drawn.
>>"%OUT%" echo   An EMPTY list means nothing is set up in Delivery ^> Zones,
>>"%OUT%" echo   and the band falls back to the six cards in the code.
>>"%OUT%" echo.
>>"%OUT%" curl -s "http://localhost:4000/shop/delivery-modes"
>>"%OUT%" echo.
>>"%OUT%" curl -s "http://localhost:4000/shop/delivery-modes?zone=NATIONWIDE"
>>"%OUT%" echo.

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  5. The wording rows for the category page
>>"%OUT%" echo ============================================================
>>"%OUT%" echo   "category.deliveryBand" is new today. Missing = the API has
>>"%OUT%" echo   not booted with the new code yet ^(these rows are created on
>>"%OUT%" echo   boot, there is no migration to run^).
>>"%OUT%" echo.
>>"%OUT%" docker compose exec -T api npx prisma db execute --stdin < nul 2>nul
>>"%OUT%" curl -s "http://localhost:4000/shop/category/%SLUG%" ^| findstr /C:"deliveryBand"
>>"%OUT%" echo.

>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo  6. Anything angry in the log
>>"%OUT%" echo ============================================================
>>"%OUT%" docker compose logs --tail 200 api 2>^&1 ^| findstr /I /C:"error" /C:"exception"

echo Done. Opening category_verify.txt
start notepad "%OUT%"
