@echo off
REM Radian API — Prisma infra bring-up (logged, non-blocking)
cd /d "%~dp0"
set LOG=%~dp0_setup.log
echo ==== SETUP START %DATE% %TIME% ==== > "%LOG%"

echo [1/5] postgres up -d >> "%LOG%"
docker compose up -d postgres >> "%LOG%" 2>&1

echo [2/5] build api (npm install + prisma generate) >> "%LOG%"
docker compose build api >> "%LOG%" 2>&1

echo [3/5] recreate api + web on new image >> "%LOG%"
docker compose up -d --force-recreate api web >> "%LOG%" 2>&1

echo [4/5] wait 15s for boot >> "%LOG%"
timeout /t 15 >nul

echo [5/5] api logs tail >> "%LOG%"
docker compose logs --tail=50 api >> "%LOG%" 2>&1

echo ==== SETUP DONE ==== >> "%LOG%"
