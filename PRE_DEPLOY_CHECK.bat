@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  RADIAN — PRE-DEPLOY CHECK
REM
REM  ডেটাবেজে যা ইন্টারনেটে যাওয়া উচিত নয় তা খুঁজে দেখায়:
REM  regression-test order, demo-* পণ্য, খারাপ category slug,
REM  ডুপ্লিকেট tag, ফাঁকা/draft policy page।
REM
REM  শুধু দেখাতে   :  PRE_DEPLOY_CHECK.bat
REM  ঠিক করতে      :  PRE_DEPLOY_CHECK.bat fix
REM
REM  ⚠️ "fix" কিছু হার্ড-ডিলিট করে না — শুধু deletedAt বসায়, ফেরত আনা যায়।
REM  ⚠️ API চালু থাকার দরকার নেই, কিন্তু DATABASE_URL লাগবে।
REM  ⚠️ পর্দার লেখা ইংরেজিতে — cmd বাংলা ফন্ট আঁকতে পারে না।
REM ═══════════════════════════════════════════════════════════════════
cd /d "%~dp0apps\api"
if /i "%1"=="fix" (
  node scripts\pre-deploy-check.mjs --fix
) else (
  node scripts\pre-deploy-check.mjs
)
echo.
pause
