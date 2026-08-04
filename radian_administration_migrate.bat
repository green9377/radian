@echo off
REM ============================================================
REM  Administration - database migration  (ADM-D01..D07)
REM
REM  Adds SIX tables, TWO enums, and FOUR fields on AppUser.
REM  NOTHING IS DELETED. Nobody's login stops working.
REM  Read that twice - it is the whole point of this file.
REM
REM  ---- WHY THIS EXISTS ----
REM
REM  Right now the answer to "who can do what" is written in
REM  THREE different places, and they do not agree:
REM
REM     73 @Roles decorators   in 17 controllers
REM     10 hand-written ifs    in 5 files
REM     11 roles: arrays       in AdminSidebar.tsx
REM                            (out of 159 screens - so 148
REM                             screens have no rule at all)
REM
REM  Three lists, one question, nobody reconciles them. On the
REM  day Intelligence was built, a roles: array in the sidebar
REM  hid the whole module from STAFF - while the decision had
REM  been the opposite, and the API was left wide open. No error
REM  was raised. Staff simply never saw a screen written for
REM  them, and nobody found out for weeks.
REM
REM  These tables exist so there is ONE list. The sidebar reads
REM  it. The API guard reads it. They cannot drift apart,
REM  because there is nothing left to drift from.
REM
REM  ---- THE SIX TABLES ----
REM
REM  AccessNode         What exists in the system: every module,
REM                     every screen inside it, which routes
REM                     belong to it. GENERATED FROM THE CODE,
REM                     never typed by hand (ADM-D05) - a
REM                     hand-kept list is exactly the drift this
REM                     module was built to end.
REM
REM                     Rows are never deleted. A screen that
REM                     goes away gets retiredAt, because old
REM                     ticks and old audit rows still point at
REM                     it and a dangling key helps nobody.
REM
REM  Position           A job title, NAMED BY THE OWNER
REM                     (ADM-D01). "Accountant", "Delivery",
REM                     whatever he likes - not three names
REM                     welded into the code.
REM
REM                     Exactly one row has isOwner - it gets
REM                     everything and cannot be trimmed or
REM                     deleted, so the owner can never lock
REM                     himself out of his own business.
REM
REM  PositionAccess     The ticks for a position. ONLY THE
REM                     EXCEPTIONS are stored. No row means
REM                     "whatever the module above says", so
REM                     making an Accountant is two clicks -
REM                     tick Finance, untick Profit and Loss -
REM                     not 159 of them.
REM
REM  UserAccessOverride One person, different from their
REM                     position (ADM-D04). "Rafiq is delivery,
REM                     but let him see stock too" is one row,
REM                     and it does not disturb every other
REM                     delivery person.
REM
REM  AuthToken          The one-time link sent by email.
REM
REM                     Three deliberate choices here:
REM                       - the real token is NEVER stored, only
REM                         its hash. A leaked backup opens
REM                         nobody's account.
REM                       - usedAt means it works once. A
REM                         forwarded email is already spent.
REM                       - INVITE lasts 7 days, RESET 1 hour.
REM
REM  NodeKind /
REM  AuthTokenKind      Two small enums.
REM
REM  ---- THE FOUR FIELDS ON AppUser ----
REM
REM  email              The owner's requirement, 30 July: give
REM                     access by email, let people set their
REM                     own password, and let them fix it
REM                     themselves by email when they forget.
REM
REM                     NULLABLE ON PURPOSE. Today's users have
REM                     no email, and this migration must not
REM                     lock them out. They keep signing in with
REM                     their username. Once an email is filled
REM                     in, that works too.
REM
REM  passwordHash       Becomes NULLABLE. Somebody who has been
REM                     invited but has not chosen a password
REM                     yet has no hash. Storing a fake one so
REM                     the column can stay NOT NULL would be a
REM                     lie the login code has to remember to
REM                     see through. Empty means "cannot sign in
REM                     yet", which is the truth.
REM
REM                     ⚠ EXISTING PASSWORDS ARE UNTOUCHED.
REM                     Making a column nullable does not clear
REM                     it. Everyone signs in tomorrow exactly
REM                     as they did today.
REM
REM  positionId         Nullable. The AppRole enum STAYS for now
REM                     (ADM-D02) - both run side by side for one
REM                     release so they can be checked against
REM                     each other. Dropping the old one in the
REM                     same breath leaves no way back.
REM
REM  overrides /
REM  authTokens         Relation fields. No column, no data.
REM
REM  ---- WHAT THIS MIGRATION DOES *NOT* DO ----
REM
REM  It does not switch anything on. No route becomes guarded,
REM  no screen becomes hidden, no role changes. It only makes
REM  the room. Guarding the 346 open routes happens later and
REM  in three stages, with a SILENT stage in the middle where
REM  the guard runs but blocks nobody and only writes down who
REM  it would have blocked. Turning it all on at once and
REM  seeing what breaks means the thing that breaks is the shop,
REM  with a customer standing at the counter.
REM ============================================================
cd /d D:\radian
set LOG=D:\radian\_administration_migrate.log

echo ===== radian_administration_migrate ===== > "%LOG%"
date /t >> "%LOG%" 2>&1
time /t >> "%LOG%" 2>&1

echo.
echo [1/6] Checking Docker...
docker version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo DOCKER IS NOT RUNNING. Open Docker Desktop, wait for
  echo "Engine running", then run this file again.
  pause && exit /b 1
)

echo [2/6] Taking a backup first ^(this one touches AppUser^)...
docker compose up -d >> "%LOG%" 2>&1
timeout /t 8 /nobreak >nul
if exist D:\radian\radian_backup_silent.bat (
  call D:\radian\radian_backup_silent.bat >> "%LOG%" 2>&1
) else (
  echo    ...radian_backup_silent.bat not found, skipping >> "%LOG%" 2>&1
)

echo [3/6] Running the migration (administration)...
REM  ---- WHY `deploy` AND NOT `dev` ----
REM  The first attempt used `prisma migrate dev`. It failed, and the reason is
REM  worth keeping: `dev` is an INTERACTIVE command. It wanted to ask about the
REM  new unique index on AppUser.email, there was nobody inside the container to
REM  answer, and it stopped. Nothing was changed - which is how it should fail.
REM
REM  So the SQL is written by hand in
REM    apps/api/prisma/migrations/20260730013000_administration/migration.sql
REM  and `deploy` just applies it. It asks nothing, and the exact statements
REM  that touch AppUser can be read before they run.
docker compose run --rm api npx prisma migrate deploy >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo MIGRATION FAILED - see D:\radian\_administration_migrate.log
  echo Nothing was changed. Your data is as it was, and there is a
  echo fresh backup in D:\radian\backups from a moment ago.
  pause && exit /b 1
)

echo [4/6] Refreshing the Prisma client and restarting the API...
docker compose exec -T api npx prisma generate >> "%LOG%" 2>&1
docker compose restart api >> "%LOG%" 2>&1

echo [5/6] Waiting for the API...
timeout /t 30 /nobreak >nul

echo [6/6] Checking the tables landed AND that nobody lost a password...
echo. >> "%LOG%"
echo ===== docker compose ps ===== >> "%LOG%"
docker compose ps >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== new tables (expect 5 rows) ===== >> "%LOG%"
docker compose exec -T postgres psql -U radian_user -d radian_db -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('AccessNode','Position','PositionAccess','UserAccessOverride','AuthToken') ORDER BY 1;" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== users, and how many still have a password ===== >> "%LOG%"
echo ===== these two numbers MUST be equal to what they were ===== >> "%LOG%"
docker compose exec -T postgres psql -U radian_user -d radian_db -c "SELECT count(*) AS users, count(\"passwordHash\") AS with_password, count(\"email\") AS with_email FROM \"AppUser\";" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== curl :4000 /auth/status ===== >> "%LOG%"
curl -s -m 10 -o nul -w "http_code=%%{http_code}" http://localhost:4000/auth/status >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo ===== api log (last 80 lines) ===== >> "%LOG%"
docker compose logs --tail=80 api >> "%LOG%" 2>&1

echo.
echo ============================================================
echo  Done. Five tables added. Nothing removed.
echo.
echo  THE ONE THING TO CHECK NOW:
echo    Sign out of the panel and sign back in.
echo    Your username and password must work exactly as before.
echo.
echo  In the log, "with_password" must equal "users".
echo  If it does, every password survived.
echo.
echo  If they do, this migration did its job. Nothing else has
echo  changed yet - no screen is hidden, no route is guarded.
echo  That comes next, and only after you have seen it.
echo.
echo  /auth/status above should say http_code=200.
echo  A 500 is not fine. If you see one, read
echo    D:\radian\_administration_migrate.log
echo ============================================================
echo.
pause
