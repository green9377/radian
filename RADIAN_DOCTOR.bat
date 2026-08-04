@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  RADIAN DOCTOR — "সব ঠিক আছে কিনা" এক পর্দায়
REM
REM  কিছু ভাঙলে সবার আগে এটা চালাও। যা দেখে:
REM    Docker · container · API/admin/web উত্তর দিচ্ছে কিনা ·
REM    migration বাকি আছে কিনা · এই PC-র Prisma client তাজা কিনা ·
REM    শেষ build · .env দুটো আছে কিনা · git backup ও secret leak
REM
REM  ⚠️ Doctor কিছু ঠিক করে না — শুধু দেখায়। ইচ্ছাকৃত: ভাঙা অবস্থাটা
REM     দেখার আগেই বদলে গেলে কারণ খুঁজে পাওয়া যায় না।
REM ═══════════════════════════════════════════════════════════════════
cd /d "%~dp0"
node tools\doctor.mjs
echo.
pause
