@echo off
setlocal enabledelayedexpansion
set "LOG=D:\radian\_setup.log"
set "ROOT=D:\radian"
set "API=D:\radian\apps\api"
rem host 5433 -> container 5432 (host 5432-এ native postgres চলছে, তাই 5433)
set "DATABASE_URL=postgresql://radian_user:radian_pass@localhost:5433/radian_db"

> "%LOG%" echo ===== RADIAN API SETUP START %date% %time% =====

cd /d "%ROOT%"
>> "%LOG%" echo.
>> "%LOG%" echo [1/6] reset + start postgres (fresh volume, host port 5433)
docker compose down -v >> "%LOG%" 2>&1
docker compose up -d postgres >> "%LOG%" 2>&1

>> "%LOG%" echo [2/6] waiting for postgres to be healthy...
set /a tries=0
:waitpg
set "H="
for /f "delims=" %%i in ('docker inspect -f "{{.State.Health.Status}}" radian_postgres 2^>nul') do set "H=%%i"
if /i "!H!"=="healthy" goto pgready
set /a tries+=1
if !tries! geq 40 ( >> "%LOG%" echo     TIMEOUT waiting for postgres & goto pgready )
ping -n 3 127.0.0.1 >nul
goto waitpg
:pgready
>> "%LOG%" echo     postgres health=!H!

cd /d "%API%"
>> "%LOG%" echo.
>> "%LOG%" echo [3/6] npm install (prisma@6 + @prisma/client + deps)
call npm install --no-audit --no-fund >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [4/6] prisma migrate dev (local v6 via npm script)
call npm run prisma:migrate -- --name product_module >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [5/6] prisma generate (local v6)
call npm run prisma:generate >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [6/6] npm run build
call npm run build >> "%LOG%" 2>&1
set "RC=!errorlevel!"

>> "%LOG%" echo.
>> "%LOG%" echo ===== RADIAN API SETUP DONE (build rc=!RC!) %date% %time% =====
endlocal
