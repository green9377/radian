@echo off
REM ============================================================
REM  WhatsApp templates & send lists - database migration
REM
REM  Adds four tables:
REM    WhatsappTemplate  the messages, written once and reused
REM    Broadcast         a list of people to send one message to
REM    BroadcastTarget   one row per person, and whether it is done
REM
REM  NO WHATSAPP API IS NEEDED FOR ANY OF THIS.
REM
REM  Sending works the way it already does on the occasion list:
REM  the button opens WhatsApp with the message written out, one
REM  customer at a time, and a person presses Send. What is new
REM  is that the message is saved and reused, the list is built
REM  from real filters, and the system remembers exactly who has
REM  been reached.
REM
REM  That is slower than a bulk blast, and it has one advantage
REM  the blast does not: somebody sees each message before it
REM  goes, so the wrong list cannot reach three thousand people
REM  in four seconds.
REM
REM  When the Business API is confirmed, a "send them all"
REM  button joins the same screen. The templates, the lists and
REM  the history are already here and do not change.
REM
REM  Every send still writes an Outreach row, so the do-not-
REM  contact list and the "did it work" report keep working -
REM  a broadcast cannot become a second, less careful way to
REM  message people.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_whatsapp_migrate.log

echo ===== radian_whatsapp_migrate ===== > "%LOG%"
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

echo [3/5] Running the migration (whatsapp_broadcast)...
docker compose run --rm api npx prisma migrate dev --name whatsapp_broadcast >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_whatsapp_migrate.log
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
echo ===== api log (last 80 lines) ===== >> "%LOG%"
docker compose logs --tail=80 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done.
echo.
echo  Next: Marketing - WhatsApp
echo    Write a message, build a list, then work down the queue.
echo.
echo  If the API did not come back up, read
echo    D:\radian\_whatsapp_migrate.log
echo ============================================================
echo.
pause
