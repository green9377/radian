@echo off
setlocal enabledelayedexpansion
set "LOG=D:\radian\_build.log"
cd /d "D:\radian\apps\api"
> "%LOG%" echo ===== BUILD START %date% %time% =====
call npm run build >> "%LOG%" 2>&1
set "RC=!errorlevel!"
>> "%LOG%" echo.
>> "%LOG%" echo ===== BUILD DONE rc=!RC! %date% %time% =====
endlocal
