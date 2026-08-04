@echo off
REM  Silent log grab — writes what the API is saying right now to
REM  D:\radian\_now.log and closes itself. Changes nothing.
cd /d D:\radian
echo ===== docker compose ps ===== > D:\radian\_now.log
docker compose ps >> D:\radian\_now.log 2>&1
echo. >> D:\radian\_now.log
echo ===== curl :4000 ===== >> D:\radian\_now.log
curl -s -m 6 -o nul -w "http_code=%%{http_code}" http://localhost:4000/audit/stats >> D:\radian\_now.log 2>&1
echo. >> D:\radian\_now.log
echo. >> D:\radian\_now.log
echo ===== api log, last 120 lines ===== >> D:\radian\_now.log
docker compose logs --tail=120 api >> D:\radian\_now.log 2>&1
exit
