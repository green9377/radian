@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  RADIAN — BUILD CHECK (এই কম্পিউটারে, Docker-এর ভেতরে নয়)
REM
REM  কেন আলাদা ফাইল:
REM    radian_fix_generate.bat প্রিজমা client বানায় কনটেইনারের ভেতরে
REM    (docker compose exec)। কনটেইনারের নিজের node_modules আছে, তাই
REM    Windows-এর D:\radian\apps\api\node_modules ওতে বদলায় না।
REM    কিন্তু npm run build আর VS Code দুটোই Windows-এরটাই পড়ে।
REM    ফলে schema বদলালে এখানে পুরনো type থেকে যায় আর build ফেল করে।
REM
REM    এই ফাইল সেটাই ঠিক করে — Windows-এর client নতুন করে বানায়,
REM    তারপর build চালায়, আর ফলটা পর্দায় দেখায় (লুকিয়ে রাখে না)।
REM
REM  ⚠️ echo-র লেখা সব ইংরেজিতে। cmd-র console বাংলা ফন্ট আঁকতে পারে না —
REM     বাংলা লিখলে পর্দায় "aªòaªç" জাতীয় আবর্জনা আসে। মন্তব্য বাংলায়
REM     থাকতে পারে (ওগুলো ছাপা হয় না), ছাপার লেখা নয়।
REM
REM  কখন চালাবেন: schema.prisma বদলালে, অথবা push/deploy করার আগে।
REM ═══════════════════════════════════════════════════════════════════
cd /d "%~dp0apps\api"

echo ==================================================
echo   [0/4] No Bengali in the product (owner's rule)...
echo ==================================================
call node scripts\no-bangla.selftest.mjs
if errorlevel 1 (
  echo.
  echo   *** BENGALI FOUND IN CODE - the owner's rule. Fix before pushing. ***
  echo.
  pause
  exit /b 1
)

REM  ⚠️ Before the build, on purpose. These are security rules, and a broken
REM     one leaves the build perfectly green - which is exactly why it has to
REM     be its own gate. S-01..S-05, the 31 Aug 2026 remediation.
echo ==================================================
echo   [1/4] Security rules (S-01..S-05, no database)...
echo ==================================================
call node scripts\security.selftest.mjs
if errorlevel 1 (
  echo.
  echo   *** A LOCKED SECURITY RULE IS BROKEN - see the list above. ***
  echo   *** Read RADIAN_SECURITY_AUDIT_VERDICT.md before changing it. ***
  echo.
  pause
  exit /b 1
)

echo ==================================================
echo   [2/4] Regenerating Prisma client (on THIS PC)...
echo ==================================================
call npx prisma generate
if errorlevel 1 (
  echo.
  echo   *** GENERATE FAILED - show the text above to Claude ***
  echo.
  pause
  exit /b 1
)

echo.
echo ==================================================
echo   [3/4] Building ^(1-2 minutes^)...
echo ==================================================
call npm run build
set "RC=%errorlevel%"

echo.
echo ==================================================
if "%RC%"=="0" (
  echo   CLEAN - no errors. Safe to push / deploy.
) else (
  echo   BUILD FAILED ^(rc=%RC%^) - show the errors above to Claude.
)
echo ==================================================
echo.
pause
