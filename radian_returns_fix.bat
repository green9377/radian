@echo off
REM ============================================================
REM  Returns review-pass rebuild (23 Jul 2026)
REM  The review fixes (REV-RTN-1 double-payout cap · REV-RTN-2
REM  numbering · REV-RTN-3 order timeline) are CODE-ONLY — no
REM  schema change. If you already ran radian_returns_migrate.bat
REM  before these fixes, run THIS to pick them up (rebuild the
REM  baked image + regenerate the prisma client into the compose
REM  anonymous node_modules volume, the §16 lesson).
REM
REM  If you have NOT migrated yet, just run radian_returns_migrate.bat
REM  instead — it already rebuilds with the fixed code.
REM ============================================================
cd /d D:\radian

echo [1/3] rebuilding the api image (source is baked in)...
docker compose up -d --build api
if errorlevel 1 goto fail

echo [2/3] regenerating the prisma client INSIDE the running container...
docker compose exec -T api npx prisma generate
if errorlevel 1 goto fail

echo [3/3] restarting the api watcher...
docker compose restart api
if errorlevel 1 goto fail

echo.
echo DONE. Test: http://localhost:4000/returns/settings  (should return JSON)
goto end

:fail
echo FAILED - copy the error into the chat.

:end
pause
