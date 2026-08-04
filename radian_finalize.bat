@echo off
setlocal enabledelayedexpansion
set "LOG=D:\radian\_finalize.log"
set "DATABASE_URL=postgresql://radian_user:radian_pass@localhost:5433/radian_db"
cd /d "D:\radian\apps\api"
> "%LOG%" echo ===== FINALIZE START %date% %time% =====

>> "%LOG%" echo.
>> "%LOG%" echo [1/4] prisma migrate dev --name sales_module
call npm run prisma:migrate -- --name sales_module >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [2/4] prisma generate
call npm run prisma:generate >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [3/4] npm run build
call npm run build >> "%LOG%" 2>&1
set "RC=!errorlevel!"
>> "%LOG%" echo build rc=!RC!

if not "!RC!"=="0" (
  >> "%LOG%" echo BUILD FAILED — smokes skipped. Fix TS errors above.
  >> "%LOG%" echo ===== FINALIZE DONE (build failed) %date% %time% =====
  goto :done
)

>> "%LOG%" echo.
>> "%LOG%" echo [4/4] running smokes (product, customer, sales)
node "D:\radian\smoke.mjs" >> "%LOG%" 2>&1
ping -n 4 127.0.0.1 >nul
node "D:\radian\smoke_customer.mjs" >> "%LOG%" 2>&1
ping -n 4 127.0.0.1 >nul
node "D:\radian\smoke_sales.mjs" >> "%LOG%" 2>&1
>> "%LOG%" echo.
>> "%LOG%" echo ===== FINALIZE DONE %date% %time% =====

:done
endlocal
