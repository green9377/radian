@echo off
setlocal enabledelayedexpansion
set "NAME=%~1"
if "%NAME%"=="" set "NAME=migration"
set "LOG=D:\radian\_migrate.log"
set "DATABASE_URL=postgresql://radian_user:radian_pass@localhost:5433/radian_db"
cd /d "D:\radian\apps\api"
> "%LOG%" echo ===== MIGRATE (%NAME%) START %date% %time% =====
>> "%LOG%" echo.
>> "%LOG%" echo [1/3] prisma migrate dev --name %NAME%
call npm run prisma:migrate -- --name %NAME% >> "%LOG%" 2>&1
>> "%LOG%" echo.
>> "%LOG%" echo [2/3] prisma generate
call npm run prisma:generate >> "%LOG%" 2>&1
>> "%LOG%" echo.
>> "%LOG%" echo [3/3] npm run build
call npm run build >> "%LOG%" 2>&1
set "RC=!errorlevel!"
>> "%LOG%" echo.
>> "%LOG%" echo ===== MIGRATE DONE rc=!RC! %date% %time% =====
endlocal
