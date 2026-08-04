@echo off
REM ============================================================
REM  POS post-migrate client fix (23 Jul 2026) — the compose
REM  anonymous /app/node_modules volume can shadow the rebuilt
REM  image's freshly generated prisma client (the §16 lesson).
REM  Regenerate INSIDE the running container (into the volume),
REM  then restart the watcher so the API sees the POS models.
REM ============================================================
cd /d D:\radian

echo [1/2] regenerating the prisma client INSIDE the api container...
docker compose exec -T api npx prisma generate
if errorlevel 1 goto fail

echo [2/2] restarting the api...
docker compose restart api
if errorlevel 1 goto fail

echo DONE. Test: http://localhost:4000/pos/settings  (should return JSON)
goto end

:fail
echo FAILED - copy the error into the chat.

:end
pause
