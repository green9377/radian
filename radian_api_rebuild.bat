@echo off
cd /d D:\radian
echo Rebuilding the api container with the latest source...
docker compose up -d --build api
echo. > D:\radian\_rebuild_done.txt
docker compose ps >> D:\radian\_rebuild_done.txt 2>&1
