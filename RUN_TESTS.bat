@echo off
REM ============================================================================
REM  RADIAN REGRESSION SUITE - "is everything still working" in one click
REM
REM  WHERE IT RUNS (changed 2 Sep 2026 - and this is the SECOND time)
REM
REM  24 Aug: it had pointed at http://localhost:4000, which the owner shut down
REM  on 17 August. Every run since had failed to connect and the locked business
REM  rules went unchecked, unnoticed. The address was fixed - to Render.
REM
REM  Render was suspended on 29 Aug. So from that day until today the suite was
REM  aimed at a host that answers nothing, and the same thing happened AGAIN:
REM  rules unchecked, nobody the wiser. A suite that cannot reach its target
REM  looks exactly like a suite nobody ran.
REM
REM  It now runs against DEV - api.development.radianbd.com - which is where
REM  the system actually lives, and where test orders belong.
REM
REM  The line below is not what keeps this safe. The suite WRITES: it places
REM  orders, pays for them, and with `full` walks one to delivered and into the
REM  Finance journal. So the real protection is an ALLOWLIST inside
REM  apps\api\scripts\regression-suite.js, which refuses any host that is not
REM  development or localhost - the old Render URL and radianbd.com by name.
REM  Editing the line below cannot aim this at a real shop.
REM
REM    RUN_TESTS.bat            DEV, the quick pass
REM    RUN_TESTS.bat full       DEV, deep (delivered -> Finance). Leaves one
REM                             delivered test order behind, on purpose
REM    RUN_TESTS.bat local      localhost:4000, if START_RADIAN.bat is running
REM    RUN_TESTS.bat local full both
REM
REM  WHAT IT SENDS: placing an order queues the WhatsApp confirmation and
REM  checkout calls sendDue() straight away. On DEV the WhatsApp integration is
REM  connected with working credentials, so a run WILL message the suite's
REM  fake numbers unless outbound is stopped first (Administration - outbound
REM  kill switch) or the integration is switched off.
REM
REM  It will ask for the admin email/password. Those stay on this machine.
REM
REM  WARNING: never point this at the real shop. It places orders.
REM ============================================================================
cd /d "%~dp0"

set "DEV_API=https://api.development.radianbd.com"
set "TARGET=%DEV_API%"
set "WHERE=DEV"
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
if "%WHERE%"=="DEV" (
  echo   Checking the DEV API answers...
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
