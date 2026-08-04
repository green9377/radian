@echo off
REM ─────────────────────────────────────────────────────────────
REM  One job: migrate deploy → prisma generate → restart → log.
REM  No pause anywhere — output goes to _migrate_out.txt so the
REM  result can be read even when this window is not visible.
REM  Written 3 Aug 2026 while two sessions worked the same repo
REM  and the interactive migrate window could not be read.
REM ─────────────────────────────────────────────────────────────
cd /d D:\radian
echo [1] migrate deploy > _migrate_out.txt
docker compose exec -T api npx prisma migrate deploy >> _migrate_out.txt 2>&1
echo [2] prisma generate >> _migrate_out.txt
docker compose exec -T api npx prisma generate >> _migrate_out.txt 2>&1
echo [3] restart >> _migrate_out.txt
docker compose restart api >> _migrate_out.txt 2>&1
timeout /t 80 /nobreak >nul
docker compose logs --tail 150 api > _api_log.txt 2>&1
echo [4] DONE >> _migrate_out.txt
