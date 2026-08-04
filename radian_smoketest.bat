@echo off
set "L=D:\radian\_smoketest.log"
> "%L%" echo ===== SMOKETEST START %date% %time% =====
>> "%L%" echo -- where node --
where node >> "%L%" 2>&1
>> "%L%" echo -- node -v --
node -v >> "%L%" 2>&1
cd /d "D:\radian\apps\api"
>> "%L%" echo -- product smoke --
node "D:\radian\smoke.mjs" >> "%L%" 2>&1
>> "%L%" echo product exit=%errorlevel%
ping -n 4 127.0.0.1 >nul
>> "%L%" echo -- customer smoke --
node "D:\radian\smoke_customer.mjs" >> "%L%" 2>&1
>> "%L%" echo customer exit=%errorlevel%
ping -n 4 127.0.0.1 >nul
>> "%L%" echo -- sales smoke --
node "D:\radian\smoke_sales.mjs" >> "%L%" 2>&1
>> "%L%" echo sales exit=%errorlevel%
>> "%L%" echo ===== SMOKETEST DONE %date% %time% =====
