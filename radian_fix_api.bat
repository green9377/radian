@echo off
REM ============================================================
REM  FIX THE API  --  30 July 2026
REM
REM  WHAT IS WRONG
REM  prisma/schema.prisma has five new models (Position,
REM  AccessNode, PositionAccess, UserAccessOverride,
REM  CompanySetting) plus AppUser.positionId and AppUser.email.
REM  The GENERATED Prisma client does not have them -- it is
REM  dated 29 July, the schema changes are 30 July.
REM
REM  So src/administration/* does not compile (101 type errors,
REM  all of the form "Property 'companySetting' does not exist"),
REM  and nest start:dev therefore never begins serving.
REM
REM  WHY REBUILDING DID NOT HELP
REM  docker-compose.yml declares an ANONYMOUS volume for
REM  /app/node_modules. Docker only fills an anonymous volume
REM  from the image the FIRST time it creates it. The image was
REM  rebuilt and did run prisma generate -- but the container
REM  kept reusing the old volume, with the 29 July client in it.
REM  That is why "Built" looked fine and nothing changed.
REM
REM  WHAT THIS DOES, in order, safest first:
REM    1. regenerate the client INSIDE the container
REM       (writes into the live volume -- no database change)
REM    2. show which migrations are still pending
REM    3. apply them  (this DOES change the database, but
REM       migrate deploy only runs the migrations that are
REM       already committed in prisma/migrations -- it never
REM       resets and never drops data)
REM    4. restart and report
REM
REM  Your Postgres data lives in the NAMED volume
REM  radian_postgres_data and is not touched at any point.
REM
REM  Writes everything to  D:\radian\_fix_api.log
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_fix_api.log
echo Radian API fix - %DATE% %TIME% > "%LOG%"

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo [1/5] Making sure the containers are up...
docker compose up -d >> "%LOG%" 2>&1
timeout /t 6 /nobreak >nul

echo [2/5] Regenerating the Prisma client inside the container...
echo ---- prisma generate ---- >> "%LOG%"
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo       Could not run generate inside the container.
  echo       Falling back to recreating the node_modules volume.
  echo       ^(This only removes the api service's anonymous volume.
  echo        Your database volume is named and is NOT affected.^)
  echo ---- rm -sfv api + rebuild ---- >> "%LOG%"
  docker compose rm -sfv api >> "%LOG%" 2>&1
  docker compose up -d --build api >> "%LOG%" 2>&1
  timeout /t 25 /nobreak >nul
) else (
  echo       Done.
)

echo [3/5] Which migrations are still pending...
echo ---- migrate status ---- >> "%LOG%"
docker compose exec -T api npx prisma migrate status >> "%LOG%" 2>&1
docker compose exec -T api npx prisma migrate status 2>&1 | findstr /I "pending following have not applied up to date"

echo.
echo [4/5] Applying any pending migrations...
echo ---- migrate deploy ---- >> "%LOG%"
docker compose exec -T api npx prisma migrate deploy >> "%LOG%" 2>&1
if errorlevel 1 (
  echo       migrate deploy reported a problem - see the log.
) else (
  echo       Done.
)

echo [5/5] Restarting the API and waiting for it...
docker compose restart api >> "%LOG%" 2>&1
timeout /t 25 /nobreak >nul

echo.
echo ============================================================
echo  RESULT
echo ============================================================
docker compose ps api
echo.
echo Last 25 lines of the API log:
echo ---- final logs ---- >> "%LOG%"
docker compose logs --tail=25 api >> "%LOG%" 2>&1
docker compose logs --tail=25 api

echo.
echo ============================================================
echo  Now open  http://localhost:3001  and press Ctrl+F5.
echo.
echo  If it still says the API is not answering, send me
echo  D:\radian\_fix_api.log  -- it has every step in it.
echo ============================================================
echo.
pause
