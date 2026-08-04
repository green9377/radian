@echo off
set "LOG=D:\radian\_diag.log"
> "%LOG%" echo ===== RADIAN DB DIAG %date% %time% =====

>> "%LOG%" echo.
>> "%LOG%" echo [A] docker ps (names + ports)
docker ps --format "{{.Names}}  |  {{.Image}}  |  {{.Ports}}" >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [B] container env (POSTGRES_*)
docker exec radian_postgres env >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [C] password auth over TCP INSIDE container (tests the real creds)
docker exec radian_postgres psql "postgresql://radian_user:radian_pass@127.0.0.1:5432/radian_db" -c "select current_user, current_database();" >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [D] who is listening on host port 5432
netstat -ano | findstr :5432 >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo [E] postgres container recent logs
docker logs --tail 25 radian_postgres >> "%LOG%" 2>&1

>> "%LOG%" echo.
>> "%LOG%" echo ===== DIAG DONE %date% %time% =====
