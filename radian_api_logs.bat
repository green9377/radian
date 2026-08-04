@echo off
cd /d D:\radian
echo ===== docker compose ps ===== > D:\radian\_api_logs.txt
docker compose ps >> D:\radian\_api_logs.txt 2>&1
echo. >> D:\radian\_api_logs.txt
echo ===== api logs (last 120) ===== >> D:\radian\_api_logs.txt
docker compose logs --tail 120 api >> D:\radian\_api_logs.txt 2>&1
