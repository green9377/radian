@echo off
REM ============================================================
REM  Radian — Item module: ONE-SHOT SETUP
REM
REM  Run this and everything on /items starts working. It does the three things
REM  that were missing:
REM    1. creates the new tables      (ItemCategory, ItemAttribute, ItemAttributeValue)
REM    2. refreshes the Prisma client (so the API knows about them)
REM    3. restarts the API            (so the new routes exist)
REM
REM  Nothing is dropped. No stock is touched.
REM
REM  ⚠ If Prisma warns that it will DROP a column that still contains values,
REM    answer N and paste the warning into the chat. That is data loss.
REM ============================================================
cd /d D:\radian

echo.
echo ============================================================
echo  [1/5] starting postgres + api
echo ============================================================
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  [2/5] creating the migration
echo         (read any warning carefully before answering y)
echo ============================================================
docker compose run --rm api npx prisma migrate dev --name item_categories_attributes
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  [3/5] refreshing the prisma client inside the container
echo ============================================================
docker compose exec api npx prisma generate
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  [4/5] restarting the api so the new routes load
echo ============================================================
docker compose restart api
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  [5/5] waiting for the api to come up...
echo ============================================================
timeout /t 8 /nobreak >nul
curl -s -o nul -w "  /items          -> %%{http_code}\n" http://localhost:4000/items
curl -s -o nul -w "  /item-categories -> %%{http_code}\n" http://localhost:4000/item-categories
curl -s -o nul -w "  /item-attributes -> %%{http_code}\n" http://localhost:4000/item-attributes
curl -s -o nul -w "  /units           -> %%{http_code}\n" http://localhost:4000/units

echo.
echo ============================================================
echo  All four should say 200. If any says 404 or nothing at all,
echo  copy this whole window into the chat.
echo.
echo  Then open:  http://localhost:3001/items/new
echo  You can now create the category and the colours from inside
echo  that page - no need to visit any other screen first.
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
