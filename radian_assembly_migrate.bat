@echo off
REM ============================================================
REM  Radian — Assembly module v2 migration (23 Jul 2026)
REM  RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md §V2  ·  DEC-ASM-011..016
REM
REM  New tables:
REM    AssemblyTemplate(+Line) / AssemblyProduction(+Line) + ProductionStatus enum
REM  Changed:
REM    MovementReason enum += ASSEMBLY, UNBUILD   (non-breaking addition)
REM    InventorySetting  += 3 assembly columns (nullable)
REM  "Assembly floor" warehouse is created automatically on the first
REM  production run — no seed needed.
REM
REM  ⚠️ If radian_inventory_migrate.bat (or purchase/item) was NEVER run,
REM  prisma diffs the whole schema — this ONE migration then also creates
REM  those tables. Fine either way.
REM
REM  ⚠️ If prisma asks to DROP AssemblyBuild / AssemblyUnbuild tables:
REM  that's the empty v1 design — answer YES. Any OTHER drop warning:
REM  answer N and paste the message into the chat.
REM ============================================================
cd /d D:\radian

echo.
echo [1/5] starting postgres + api containers...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/5] creating + applying the migration (assembly_module)...
docker compose run --rm api npx prisma migrate dev --name assembly_module
if errorlevel 1 goto fail

echo.
echo [3/5] refreshing the prisma client INSIDE the container...
docker compose exec api npx prisma generate
if errorlevel 1 goto fail

echo.
echo [4/5] rebuilding the api container (it serves compiled dist/)...
docker compose up -d --build api
if errorlevel 1 goto fail

echo.
echo [5/5] refreshing the prisma client on the HOST too...
cd /d D:\radian\apps\api
call npx prisma generate
cd /d D:\radian
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  DONE. Preview:
echo    http://localhost:3001/assembly           -^> Overview
echo    http://localhost:3001/assembly/build     -^> Build entry
echo    http://localhost:3001/assembly/unbuild   -^> Un-build
echo  (admin not running? double-click START_RADIAN.bat first)
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***

:end
pause
