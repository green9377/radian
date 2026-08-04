@echo off
REM ============================================================
REM  Radian - Returns & Refunds DEMO DATA (23 Jul 2026)
REM
REM  Fills the Returns module with example data so you can click
REM  through every state:
REM    - 5 return reasons + policy settings
REM    - RTN-D001  pending approval  (Damaged, crafted -> write-off)
REM    - RTN-D002  approved, ready to complete  (Wrong item)
REM    - RTN-D003  completed, cash refund posted onto the order (Quality)
REM    - RTN-D004  completed, store credit issued to the customer (Changed mind)
REM
REM  RUN THE MIGRATION FIRST (once):  radian_returns_migrate.bat
REM  This is safe to re-run: it clears its own RTN-D rows and reverses
REM  the demo refund/credit it posted before seeding again.
REM ============================================================
cd /d D:\radian

echo.
echo [1/3] making sure postgres + api are up...
docker compose up -d postgres api
if errorlevel 1 goto fail

echo.
echo [2/3] seeding demo delivered orders (RAD-D...) so returns have something to attach to...
docker compose exec api node prisma/seed-orders.js
if errorlevel 1 goto fail

echo.
echo [3/3] seeding demo returns (RTN-D...)...
docker compose exec api node prisma/seed-returns.js
if errorlevel 1 goto fail

echo.
echo ============================================================
echo  DONE. Open the admin (:3001) and explore:
echo    http://localhost:3001/returns           -^> list (4 demo returns)
echo    http://localhost:3001/returns/new        -^> start one yourself
echo    http://localhost:3001/returns/settings   -^> reasons + policy
echo  Click RTN-D002 -^> "Complete & pay out" to feel the payout flow.
echo ============================================================
goto end

:fail
echo.
echo  ***  Something failed above. Copy the error into the chat.  ***
echo  ( If it says a Returns table is missing, run
echo    radian_returns_migrate.bat first, then this again. )

:end
pause
