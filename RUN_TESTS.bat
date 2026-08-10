@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  RADIAN REGRESSION SUITE — "সব ঠিক আছে কি না" এক click-এ
REM
REM  আগে START_RADIAN.bat দিয়ে সব চালু থাকতে হবে।
REM  Admin email/password জিজ্ঞেস করবে — তোমার machine-এই থাকে।
REM
REM  গভীর পরীক্ষা (delivered→Finance পর্যন্ত):  RUN_TESTS.bat full
REM ═══════════════════════════════════════════════════════════════════
cd /d "%~dp0"

REM  আগে যেগুলোর ডেটাবেজ লাগে না — দু-সেকেন্ড。 এগুলো ভাঙা মানে দাম বা মজুদের
REM  নিয়মই ভাঙা, তখন test order বসিয়ে লাভ নেই。
node apps\api\scripts\split-stores.selftest.mjs
if errorlevel 1 goto :ruleBroken
node apps\api\scripts\discount-window.selftest.mjs
if errorlevel 1 goto :ruleBroken
goto :rulesOk

:ruleBroken
echo.
echo A locked rule is broken. Fix that before running the rest.
pause
exit /b 1

:rulesOk

if /i "%1"=="full" (
  node apps\api\scripts\regression-suite.js --full
) else (
  node apps\api\scripts\regression-suite.js
)
pause
