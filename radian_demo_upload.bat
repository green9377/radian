@echo off
setlocal
REM ============================================================================
REM  radian_demo_upload.bat — local DB --> Neon demo DB
REM
REM  কী করে: local Docker Postgres-এর পুরো ডেটা (পণ্য, category, banner,
REM  content — সব) Neon-এর demo ডেটাবেজে কপি করে। Neon-এর পুরনো ডেটা মুছে
REM  local-এর হুবহু কপি বসায়।
REM
REM  আগে একবার করতে হবে: .env.secrets.local ফাইলে এই লাইনটা যোগ করুন —
REM     NEON_DIRECT_URL=postgresql://...
REM  (Neon dashboard-এর connection string, "Pooled connection" OFF করা অবস্থায়।
REM   এটাই deploy-এর সময় Render-এ DIRECT_URL হিসেবে বসিয়েছিলেন।)
REM
REM  সাবধান: এটা DEMO-র জন্য। Real/production DB-তে কখনো চালাবেন না।
REM ============================================================================

cd /d D:\radian

echo ============================================
echo  RADIAN DEMO UPLOAD  (local DB to Neon)
echo ============================================
echo.

REM -- চেক ১: Docker চালু আছে কিনা --------------------------------------------
docker ps >nul 2>&1
if errorlevel 1 (
  echo [X] Docker is not running. Start Docker Desktop first.
  goto :fail
)

docker exec radian_postgres echo ok >nul 2>&1
if errorlevel 1 (
  echo [X] Container radian_postgres is not running. Run START_RADIAN.bat first.
  goto :fail
)

REM -- চেক ২: Neon-এর ঠিকানা .env.secrets.local থেকে পড়া ----------------------
set "NEON_DIRECT_URL="
for /f "usebackq tokens=1,* delims==" %%a in (".env.secrets.local") do (
  if "%%a"=="NEON_DIRECT_URL" set "NEON_DIRECT_URL=%%b"
)

if not defined NEON_DIRECT_URL (
  echo [X] NEON_DIRECT_URL not found in .env.secrets.local
  echo.
  echo     Open .env.secrets.local and add one line:
  echo     NEON_DIRECT_URL=postgresql://...
  echo.
  echo     Get it from Neon dashboard - connection string with Pooled OFF.
  goto :fail
)

REM -- সাবধানতা: ভুল করে production-এ চালানো আটকানো ---------------------------
echo This will ERASE everything in the Neon demo database
echo and replace it with a full copy of your local database.
echo.
set /p CONFIRM="Type YES to continue: "
if /i not "%CONFIRM%"=="YES" (
  echo Cancelled.
  goto :end
)

REM -- ধাপ ১: local থেকে dump --------------------------------------------------
echo.
echo [1/3] Dumping local database...
docker exec radian_postgres pg_dump -U radian_user -d radian_db --no-owner --no-privileges --clean --if-exists -f /tmp/radian_dump.sql
if errorlevel 1 (
  echo [X] pg_dump failed.
  goto :fail
)

REM -- ধাপ ২: Neon-এ restore (container-এর ভেতর থেকে, ওখানে psql আছে) ---------
echo [2/3] Uploading to Neon... (this can take a few minutes)
docker exec radian_postgres sh -c "psql '%NEON_DIRECT_URL%' -q -f /tmp/radian_dump.sql" > _demo_upload.log 2>&1

REM  DROP ... IF EXISTS-এর কিছু নিরীহ NOTICE আসবে — ERROR গুনি, NOTICE না
findstr /c:"ERROR" _demo_upload.log >nul 2>&1
if not errorlevel 1 (
  echo [!] Some errors were logged - check _demo_upload.log
  echo     Most DROP/role errors are harmless. Verifying data next...
)

REM -- ধাপ ৩: যাচাই — Neon-এ পণ্য গুনে দেখা ------------------------------------
echo [3/3] Verifying...
docker exec radian_postgres sh -c "psql '%NEON_DIRECT_URL%' -t -c 'SELECT count(*) FROM \"Product\";'" > _demo_upload_count.txt 2>&1
set /p PRODUCT_COUNT=<_demo_upload_count.txt
echo.
echo     Products now in Neon demo DB: %PRODUCT_COUNT%
echo.

echo ============================================
echo  DONE. Now check https://radian-web-tan.vercel.app
echo  NOTE: admin login is now your LOCAL username/password.
echo ============================================
goto :end

:fail
echo.
echo Upload did NOT run.
exit /b 1

:end
endlocal
