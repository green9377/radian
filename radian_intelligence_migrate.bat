@echo off
REM ============================================================
REM  Intelligence - database migration  (DEC-INT-002/003/007)
REM
REM  Adds three tables and ONE field on an existing table.
REM
REM  ---- THE THREE TABLES ----
REM
REM  DailySnapshot      One row per CLOSED day. It is a CACHE, not a
REM                     source. Every figure in it was worked out by
REM                     the module that owns it - Finance for money,
REM                     Orders for counts - and copied here so that
REM                     six months of history is not recomputed every
REM                     single time the dashboard is opened.
REM
REM                     If a row ever disagrees with Finance, FINANCE
REM                     IS RIGHT and the row is thrown away and built
REM                     again. That rule is what stops this table
REM                     becoming a second, competing set of books.
REM
REM                     It fills itself every night, and it fills in
REM                     any night it missed. The shop laptop is not on
REM                     at 2 AM, so it also catches up shortly after
REM                     the API starts.
REM
REM  KpiTarget          What "a good month" means: monthly sales, gross
REM                     margin, on-time delivery. One row per month per
REM                     KPI. Only the OWNER sets these.
REM
REM                     A month with NO target shows the figure with no
REM                     colour at all - never green. A target nobody
REM                     set is not a target that was met.
REM
REM  IntelligenceSetting  Single row. The green/amber/red bands, and
REM                     how many days of history the forecast needs
REM                     before it stops being demo (365 - one full
REM                     year, because a flower shop that has not seen
REM                     a Valentine's Day has not seen anything).
REM
REM  ---- THE ONE FIELD ----
REM
REM  Order.promisedBy   WHEN DELIVERY WAS PROMISED, as a real date and
REM                     time.
REM
REM                     Why this is needed: the panel shows "On-time
REM                     94%" today, and that number is INVENTED. It
REM                     comes from a demo file. Nothing in the system
REM                     works it out, and nothing can, because what we
REM                     promised the customer is stored only as text -
REM                     "10:00-13:00" - which is something to read, not
REM                     something to compare against a clock.
REM
REM                     So the promise is frozen once, here, when the
REM                     order is taken. Then on-time is just:
REM                     delivered time is not after promised time.
REM
REM                     Every order taken BEFORE today has no promised
REM                     time and never will. Those orders are reported
REM                     as UNMEASURABLE - they are never counted as
REM                     late. The screen says how many, out loud. A
REM                     percentage that hides its own denominator is
REM                     how a number stops being true.
REM
REM  This field belongs to Sales/Delivery, NOT to Intelligence.
REM  Intelligence only reads it. It is added in this migration only
REM  because making the owner run two migrations for one afternoon's
REM  work would be rude.
REM
REM  NO DATA IS CHANGED OR DELETED by this migration. Three new
REM  tables, one new empty column.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_intelligence_migrate.log

echo ===== radian_intelligence_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (intelligence)...
docker compose run --rm api npx prisma migrate dev --name intelligence >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_intelligence_migrate.log
  pause && exit /b 1
)

echo [4/5] Refreshing the Prisma client and restarting the API...
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [5/5] Waiting for the API, then collecting the log...
timeout /t 30 /nobreak >nul
echo. >> "%LOG%"
echo ===== docker compose ps ===== >> "%LOG%"
docker compose ps >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== curl :4000 /intelligence/dashboard ===== >> "%LOG%"
curl -s -m 10 -o nul -w "http_code=%%{http_code}" http://localhost:4000/intelligence/dashboard >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api log (last 80 lines) ===== >> "%LOG%"
docker compose logs --tail=80 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done.
echo.
echo  Next: open the panel - Intelligence - Executive Dashboard
echo.
echo  What you should expect to see:
echo.
echo    Today     real, live, this minute
echo    Business  sales and margin real; ON-TIME will say it
echo              cannot be measured yet, and that is CORRECT -
echo              no order has a promised time until Orders is
echo              wired to fill it in. That is the next piece.
echo    Money     real, from Finance
echo.
echo  The history strip will be empty until the first night has
echo  passed. That is also correct. It is not broken; it has
echo  nothing to remember yet.
echo.
echo  A 401 above just means nobody is signed in - that is fine.
echo  A 500 is not. If you see one, read
echo    D:\radian\_intelligence_migrate.log
echo ============================================================
echo.
pause
