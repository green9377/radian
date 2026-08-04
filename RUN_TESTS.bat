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
if /i "%1"=="full" (
  node apps\api\scripts\regression-suite.js --full
) else (
  node apps\api\scripts\regression-suite.js
)
pause
