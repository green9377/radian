@echo off
REM ============================================================
REM  SEO - database migration
REM
REM  What this adds:
REM
REM   1) SEO fields on Product
REM      metaTitle, metaDescription, ogTitle, ogDescription,
REM      ogImageUrl, noIndex.
REM
REM      Category and Brand have carried these since the first
REM      build. Product never did - and a product page is what
REM      somebody actually searches for ("red rose bouquet
REM      dhaka"), not a category. That was the real hole.
REM
REM   2) noIndex on Category, for the same reason.
REM
REM   3) SeoSetting - one row holding the site-wide defaults:
REM      title template, fallback description, fallback share
REM      picture, Google and Bing verification tags, robots.txt
REM      extras, and a master "hide the whole site" switch.
REM
REM   4) SeoRedirect - old address to new address.
REM      This is the one that matters for the move off
REM      radianbd.com: every address Google already knows will
REM      change, and without a redirect each one becomes a 404
REM      and the ranking behind it is lost.
REM
REM  Nothing is dropped. Every new column is nullable or has a
REM  default, so every existing product stays exactly as it is -
REM  a blank meta title simply falls back to the product name.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_seo_migrate.log

echo ===== radian_seo_migrate ===== > "%LOG%"
date /t >> "%LOG%" 2>&1
time /t >> "%LOG%" 2>&1

echo.
echo [1/5] Checking Docker...
docker version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Open Docker Desktop, wait for
  echo "Engine running", then run this file again.
  pause && exit /b 1
)

echo [2/5] Making sure the containers are up...
docker compose up -d >> "%LOG%" 2>&1
timeout /t 8 /nobreak >nul

echo [3/5] Running the migration (seo_module)...
docker compose run --rm api npx prisma migrate dev --name seo_module >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_seo_migrate.log
  pause && exit /b 1
)

echo [4/5] Refreshing the Prisma client and restarting the API...
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [5/5] Waiting for the API, then collecting the log...
timeout /t 25 /nobreak >nul
echo. >> "%LOG%"
echo ===== docker compose ps ===== >> "%LOG%"
docker compose ps >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api log (last 60 lines) ===== >> "%LOG%"
docker compose logs --tail=60 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done. The SEO tables and fields are in.
echo.
echo  Next: open the panel and look at
echo    Settings - SEO
echo.
echo  If the API did not come back up, read
echo    D:\radian\_seo_migrate.log
echo ============================================================
echo.
pause
