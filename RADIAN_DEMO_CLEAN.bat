@echo off
setlocal
REM ============================================================================
REM  RADIAN_DEMO_CLEAN.bat — wipe all business/demo data from the DEMO database
REM
REM  What it removes: products (incl. trash), orders, POS sales, customers,
REM  chats, reviews, purchases, suppliers, items, inventory, categories, tags,
REM  brands, collections, banners, offers, campaigns, finance transactions.
REM
REM  What it KEEPS: staff sign-ins, access control, integration keys
REM  (SSLCommerz/WhatsApp), delivery config, company settings, trust badges,
REM  content pages, WhatsApp templates, chart of accounts, all settings.
REM
REM  Runs a DRY RUN first (shows counts, deletes nothing), then asks before
REM  actually deleting. Everything happens in one transaction.
REM
REM  DEMO ONLY. The script refuses any database URL that is not Neon.
REM ============================================================================

cd /d D:\radian

echo ============================================
echo  RADIAN DEMO CLEAN
echo ============================================
echo.

REM -- read the Neon URL from .env.secrets.local -------------------------------
set "NEON_DIRECT_URL="
for /f "usebackq tokens=1,* delims==" %%a in (".env.secrets.local") do (
  if "%%a"=="NEON_DIRECT_URL" set "NEON_DIRECT_URL=%%b"
)
if "%NEON_DIRECT_URL%"=="" (
  echo [X] NEON_DIRECT_URL not found in .env.secrets.local
  goto :fail
)

echo [1/3] Checking Prisma client...
cd apps\api
if not exist node_modules\@prisma\client (
  echo [X] apps\api\node_modules missing - run npm install first.
  goto :fail
)

echo [2/3] Dry run - what WOULD be deleted:
echo.
set "DATABASE_URL=%NEON_DIRECT_URL%"
node scripts\demo-clean.mjs
if errorlevel 1 goto :fail
echo.

set /p CONFIRM="Type YES to permanently delete all of the above from DEMO: "
if /i not "%CONFIRM%"=="YES" (
  echo Cancelled - nothing was deleted.
  goto :done
)

echo.
echo [3/3] Deleting...
node scripts\demo-clean.mjs --yes
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  DONE - demo database holds config only.
echo  Hard-refresh the admin and start uploading
echo  your real catalog: categories first, then
echo  products.
echo ============================================
goto :done

:fail
echo.
echo [X] Failed - nothing was deleted (single transaction).
:done
cd /d D:\radian
pause
