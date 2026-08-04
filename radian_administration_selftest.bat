@echo off
REM ============================================================
REM  ADMINISTRATION module self-test
REM
REM  TWO STEPS, and the FIRST one is the important one.
REM
REM  ---- STEP 1: THE DRIFT CHECK (runs on this PC, not in Docker) ----
REM
REM  This module exists because "who can do what" was answered in
REM  THREE places that did not agree:
REM
REM     73 @Roles decorators in the API
REM     10 hand-written ifs
REM     11 roles: arrays in AdminSidebar.tsx, out of 166 screens
REM
REM  On the day Intelligence was built, one of those roles: arrays
REM  hid the ENTIRE module from staff - while the decision had
REM  been the opposite, and the API was serving it happily.
REM  Nothing errored. Nothing was logged. Staff simply never saw a
REM  screen written for them, and nobody found out for weeks.
REM
REM  registry.def.ts is GENERATED from AdminSidebar.tsx. The moment
REM  somebody adds a screen to the sidebar and forgets to
REM  regenerate, the two disagree again - and the failure mode is
REM  SILENCE, exactly as before.
REM
REM  Nobody can hold that invariant by being careful. Only this
REM  check can, and it has been proven to go red: removing a
REM  single node makes it fail and name the node.
REM
REM  It runs OUTSIDE Docker because the API container mounts only
REM  apps/api - AdminSidebar.tsx lives in apps/admin and is
REM  invisible from in there.
REM
REM  ---- STEP 2: THE SERVICE TESTS (inside the container) ----
REM
REM  1. THE OWNER CANNOT BE LOCKED OUT. Every route into "the last
REM     owner is gone" leaves a business nobody can administer,
REM     and the screen that would fix it is the one that closed.
REM
REM  2. PRECEDENCE. Ticking Finance opens its screens; closing one
REM     screen beats the module above it; a person-level exception
REM     beats their position. Get this backwards and the
REM     accountant sees the profit page.
REM
REM  3. AN UNDECIDED SCREEN IS CLOSED, NOT OPEN. Failing open is
REM     how a brand new Finance screen reaches the whole shop for
REM     a day.
REM
REM  4. A LINK WORKS ONCE. An invite or reset link sitting in a
REM     forwarded email must already be spent - and issuing a new
REM     one must kill the old one the same instant.
REM
REM  5. THE RAW TOKEN IS NEVER STORED. Only its hash. A leaked
REM     backup must open nobody's account.
REM
REM  6. THE PIN NEVER TRAVELS BY EMAIL. This is the one to care
REM     about most. Money actions need the 4-digit PIN. If setting
REM     a password from a link ever touched pinHash, then holding
REM     somebody's inbox would mean holding the power to move
REM     money. The test sets a PIN, resets the password by link,
REM     and insists the PIN is untouched.
REM
REM  7. RESETTING ENDS EVERY OPEN SESSION. If the reason for the
REM     reset was that somebody else got in, leaving their session
REM     alive makes the reset decorative.
REM
REM  8. "FORGOT PASSWORD" GIVES NOTHING AWAY. It must answer
REM     identically for a real address and a made-up one, or the
REM     box becomes a way to find out who works here - and the
REM     owner's own address is one of them.
REM
REM  9. THE SETTINGS MAP IS A MAP, NOT A MERGED TABLE. If settings
REM     ever end up owned by one module, One Data One Owner has
REM     been broken and this is where it shows.
REM
REM  10. THE SINGLETON UNDER A DOUBLE FIRST LOAD - the P2002 bug
REM      that took the Intelligence dashboard down on its very
REM      first page view.
REM
REM  SAFETY: every row it creates is marked ZZ-SELFTEST and is
REM  deleted by that name, FIRST and LAST, so a crash halfway
REM  leaves nothing behind. It never touches an existing user,
REM  position or access row, and it puts the real company row back
REM  exactly as it found it. It writes NO ledger entries -
REM  Administration has no money path.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_administration_selftest.txt

echo ===== radian_administration_selftest ===== > "%LOG%"
date /t >> "%LOG%" 2>&1
time /t >> "%LOG%" 2>&1

echo.
echo ============================================================
echo   STEP 1 of 2  -  THE DRIFT CHECK
echo   Are the sidebar and the registry still one list?
echo ============================================================
REM  Run ONCE into a file, then show it. Running it twice to get both
REM  the screen and the log would be wasteful here and outright wrong
REM  in step 2, where each run creates and deletes rows.
echo. >> "%LOG%"
echo ===== step 1: drift check ===== >> "%LOG%"
node apps\api\src\administration\registry.drift.mjs > "%TEMP%\radian_drift.txt" 2>&1
set DRIFT=%errorlevel%
type "%TEMP%\radian_drift.txt"
type "%TEMP%\radian_drift.txt" >> "%LOG%"

if %DRIFT% NEQ 0 (
  echo.
  echo ============================================================
  echo  THE TWO LISTS HAVE DRIFTED APART.
  echo.
  echo  This is the exact bug this module was built to end, and it
  echo  is SILENT in the panel - a screen just stops appearing for
  echo  somebody, with no error anywhere.
  echo.
  echo  The failing node is named above. Nothing else was run.
  echo  Send those lines to Claude.
  echo ============================================================
  echo.
  pause && exit /b 1
)

echo.
echo ============================================================
echo   STEP 2 of 2  -  THE SERVICE TESTS
echo ============================================================
echo.

docker version >nul 2>&1
if errorlevel 1 (
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and try again.
  pause && exit /b 1
)

echo Making sure the containers are up...
docker compose up -d >nul 2>&1
timeout /t 6 /nobreak >nul

echo Running the tests ^(this talks to the REAL database^)...
echo.
REM  `-T` skips type checking, the same as the Intelligence and Marketing
REM  self-tests. Self-test files are deliberately OUTSIDE tsconfig.build.json,
REM  so a mistake in one can never stop the shop from working - which also
REM  means ts-node must not insist on compiling the whole project to run one.
echo. >> "%LOG%"
echo ===== step 2: service tests ===== >> "%LOG%"
docker compose exec -T api npx ts-node -T --project tsconfig.json src/administration/administration.selftest.ts > "%TEMP%\radian_admin_selftest.txt" 2>&1
set RESULT=%errorlevel%
type "%TEMP%\radian_admin_selftest.txt"
type "%TEMP%\radian_admin_selftest.txt" >> "%LOG%"

echo.
echo ============================================================
if %RESULT% NEQ 0 (
  echo  SOMETHING FAILED. The list of what failed is above, and in
  echo    D:\radian\_administration_selftest.txt
  echo.
  echo  Anything the test created was still cleaned up - that runs
  echo  in a finally block. Send the failing lines to Claude.
) else (
  echo  All green, both steps.
  echo.
  echo  Worth knowing what that does and does not mean:
  echo.
  echo  IT DOES mean the sidebar and the API read one list, the
  echo  owner cannot be locked out, links work exactly once, and
  echo  a PIN cannot be reached from an inbox.
  echo.
  echo  IT DOES NOT mean the ticks are being ENFORCED yet. The
  echo  API guard is still in its silent stage: it works out the
  echo  real answer and turns nobody away. Check the panel -
  echo  Administration - Access control, at the bottom. Stage 3
  echo  waits until that list stays empty through a normal day.
)
echo ============================================================
echo.
pause
