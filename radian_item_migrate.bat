@echo off
REM ============================================================
REM  Radian — Item module migration (round 2)
REM
REM  Item table gains:
REM    imageUrl                                   DEC-ITM-012  item photo
REM    isSaleable / isPurchasable / isReturnable  DEC-ITM-013  behaviour flags
REM    weightGram                                 DEC-ITM-014  courier weight
REM    itemCategoryId                             DEC-ITM-007  own category tree
REM
REM  New tables:
REM    ItemCategory        the Item module's OWN tree (storefront Category untouched)
REM    ItemAttribute       Colour / Size / Grade  — the STOCKROOM's own labels
REM    ItemAttributeValue  Red, White, Large ...  (never the storefront's)
REM    Item <-> ItemAttributeValue join           DEC-ITM-015 / 016
REM
REM  Nothing is dropped. No stock is touched. Product.stockQty and DEC-MOD-003 untouched.
REM
REM  Runs INSIDE docker so Prisma reaches postgres at @postgres:5432.
REM  Running it from the host with a localhost URL breaks the container.
REM  Ref: RADIAN_ADMIN_PROGRESS.md 10.6
REM ============================================================
cd /d D:\radian

echo.
echo [1/4] starting postgres + api...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/4] creating the migration...
docker compose run --rm api npx prisma migrate dev --name item_categories_attributes
if errorlevel 1 goto fail

echo.
echo [3/4] refreshing the prisma client in the running container...
docker compose exec api npx prisma generate
if errorlevel 1 goto fail

echo.
echo [4/4] restarting the api...
docker compose restart api
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  DONE. Set it up in this order:
echo    1. http://localhost:3001/items/units       -^> add units
echo    2. http://localhost:3001/items/categories  -^> "Create starter categories"
echo    3. http://localhost:3001/items/attributes  -^> "Create Colour, Size ^& Grade"
echo    4. http://localhost:3001/items/new         -^> "Several variants" -^> Rose
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
