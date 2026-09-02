@echo off
REM ============================================================================
REM  RADIAN REGRESSION SUITE - "is everything still working" in one click
REM
REM  WHERE IT RUNS (changed 24 Aug 2026)
REM  This pointed at http://localhost:4000, and the owner shut the local
REM  server down on 17 August. So every run since then has failed to connect,
REM  and 25 locked business rules went unchecked without anybody noticing -
REM  the tool was not broken, its address was out of date.
REM
REM  It now runs against the DEMO deployment by default, which is where the
REM  work actually lives. Demo is exactly the place for this: it writes real
REM  test orders, and that is what demo data is for.
REM
REM    RUN_TESTS.bat            demo, the quick pass
REM    RUN_TESTS.bat full       demo, deep (delivered -> Finance). Leaves one
REM                             delivered test order behind, on purpose
REM    RUN_TESTS.bat local      localhost:4000, if START_RADIAN.bat is running
REM    RUN_TESTS.bat local full both
REM
REM  It will ask for the admin email/password. Those stay on this machine.
REM
REM  WARNING: never point this at the real shop. It places orders.
REM ============================================================================
cd /d "%~dp0"

set "DEMO_API=https://radian-api-qnt6.onrender.com"
set "TARGET=%DEMO_API%"
set "WHERE=DEMO"
set "DEEP="

REM  Both words are optional and may arrive in either order.
for %%A in (%1 %2) do (
  if /i "%%A"=="local" (
    set "TARGET=http://localhost:4000"
    set "WHERE=LOCALHOST"
  )
  if /i "%%A"=="full" set "DEEP=--full"
)

echo.
echo   ---------------------------------------------------------------
echo    Running against: %WHERE%
echo    %TARGET%
if defined DEEP echo    DEEP pass - this leaves a delivered test order behind
echo   ---------------------------------------------------------------
echo.

REM  These need no database and take two seconds. If a locked rule about
REM  pricing or stock is already broken, placing a test order proves nothing.
node apps\api\scripts\no-bangla.selftest.mjs
if errorlevel 1 goto :ruleBroken
node apps\api\scripts\split-stores.selftest.mjs
if errorlevel 1 goto :ruleBroken
node apps\api\scripts\discount-window.selftest.mjs
if errorlevel 1 goto :ruleBroken
node apps\api\scripts\outbound-guard.selftest.mjs
if errorlevel 1 goto :ruleBroken
node apps\api\scripts\escalation.selftest.mjs
if errorlevel 1 goto :ruleBroken
node apps\api\src\administration\registry.drift.mjs
if errorlevel 1 goto :ruleBroken
goto :rulesOk

:ruleBroken
echo.
echo   A locked rule is broken. Fix that before running the rest.
pause
exit /b 1

:rulesOk

REM  The demo API sleeps on the free tier. The first request can take 30-50
REM  seconds to wake it, and a suite that dies on a cold start looks exactly
REM  like a suite that found a bug.
if "%WHERE%"=="DEMO" (
  echo   Waking the demo API - this can take up to a minute...
  REM  ⚠️ `process.exitCode`, never `process.exit()`. Calling exit() from
  REM  inside the async loop tore down a handle libuv was still holding and
  REM  Windows printed a raw C assertion over the results:
  REM    "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), async.c:94"
  REM  It was harmless and it looked like a crash. Setting the code and
  REM  letting the process end by itself does the same job quietly.
  node -e "const u=process.argv[1]+'/health';(async()=>{for(let i=0;i<20;i++){try{const r=await fetch(u);if(r.ok){console.log('  awake');return}}catch{}await new Promise(r=>setTimeout(r,5000))}console.log('  no answer from the API - is the address right?');process.exitCode=1})()" "%TARGET%"
  if errorlevel 1 (
    pause
    exit /b 1
  )
  echo.
)

set "API=%TARGET%"
node apps\api\scripts\regression-suite.js %DEEP%
pause
