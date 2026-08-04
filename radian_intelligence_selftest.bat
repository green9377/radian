@echo off
REM ============================================================
REM  INTELLIGENCE module self-test
REM
REM  Runs against the REAL services and the REAL database, the
REM  same way the Marketing self-test does. It talks to the Nest
REM  services directly rather than over HTTP, so no password is
REM  needed and each rule is exercised exactly where it lives.
REM
REM  WHAT IT IS ACTUALLY LOOKING FOR
REM
REM  1. A SECOND SET OF BOOKS. This is the one that matters. The
REM     whole point of Intelligence is that it never works out a
REM     number that another module owns - it asks. The test
REM     compares the dashboard's sales and margin against what
REM     Finance itself answers for the same dates, to the paisa.
REM
REM     If somebody one day adds up profit inside the dashboard
REM     "just to save a call", every screen will still look fine
REM     and this check will go red. That is the only warning
REM     anyone will get.
REM
REM  2. THE CACHE PRETENDING TO BE THE TRUTH. DailySnapshot is a
REM     copy, kept so six months of history is not recomputed on
REM     every page load. The test deliberately corrupts a row and
REM     insists the real source wins and the row is rebuilt.
REM
REM  3. SILENCE. A night the computer was switched off must be
REM     filled in by the next sweep. The test removes three days
REM     from the middle and checks all three come back - not one.
REM
REM  4. THE FENCE ROUND THE MONEY. Staff are not shown cost or
REM     profit. The test checks the actual data sent to a staff
REM     account, not what the screen chooses to draw - a page
REM     that hides a number it was still sent is not a rule, it
REM     is a curtain.
REM
REM  5. AVERAGED PERCENTAGES. A month's margin is NOT the average
REM     of its daily margins. A day with 100 taka of sales at 80%
REM     and a day with 10,000 at 20% is a 20.6% month, not a 50%
REM     one. The test seeds exactly those two days and insists on
REM     the honest answer.
REM
REM  6. ZERO PRETENDING TO BE KNOWLEDGE. A month from before the
REM     shop recorded anything must say "not known", never "0".
REM     Zero would draw a valley on the chart that never happened.
REM
REM  7. THE FIRST-LOAD CRASH. Six callers ask for the settings row
REM     at the same instant; all six must get it and only one row
REM     may exist. This is the P2002 bug that took the dashboard
REM     down on 29 July.
REM
REM  SAFE TO RUN ON THE LIVE DATABASE:
REM    · the days it invents are in 2019, where the shop has
REM      nothing
REM    · it writes NO ledger entries - Intelligence has no path
REM      to the money at all
REM    · cleanup runs first AND last, so a crash halfway through
REM      cannot leave anything behind
REM ============================================================
cd /d D:\radian
set OUT=D:\radian\_intelligence_selftest.txt

echo.
echo Checking Docker...
docker version >nul 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Start Docker Desktop and run this again.
  pause && exit /b 1
)

echo Running the Intelligence self-test... this takes about a minute.
echo.

docker compose exec -T api npx ts-node -T --project tsconfig.json src/intelligence/intelligence.selftest.ts > "%OUT%" 2>&1
set RESULT=%errorlevel%

type "%OUT%"

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo  ALL CHECKS PASSED - nothing was left behind
  echo ============================================
) else (
  echo ============================================
  echo  SOMETHING DID NOT HOLD UP - see above
  echo  Full output: D:\radian\_intelligence_selftest.txt
  echo ============================================
)
echo.
pause
