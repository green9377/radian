@echo off
REM ============================================================
REM  Vendor split fix (23 Jul 2026) — the compose anonymous volume
REM  (/app/node_modules) shadows the image's freshly generated
REM  prisma client after a rebuild. Regenerate INSIDE the running
REM  container (into the volume), then restart the watcher.
REM  Lesson recorded: every future api rebuild bat must keep the
REM  "docker compose exec api npx prisma generate" step.
REM ============================================================
cd /d D:\radian

echo [1/2] regenerating the prisma client INSIDE the api container... > _vendor_fix.log 2>&1
docker compose exec -T api npx prisma generate >> _vendor_fix.log 2>&1
if errorlevel 1 goto fail

echo [2/2] restarting the api... >> _vendor_fix.log 2>&1
docker compose restart api >> _vendor_fix.log 2>&1
if errorlevel 1 goto fail

echo DONE >> _vendor_fix.log 2>&1
goto end

:fail
echo FAILED — see above >> _vendor_fix.log 2>&1

:end
