@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  RADIAN CHECKUP — যন্ত্র নিজেই নিজের দোষ খুঁজে বের করে
REM
REM  মালিকের কথা (৯ আগস্ট ২০২৬): "avabe jodi protta jinis manullay amr
REM  check kre kre thik kra lage koto year lagbe ami jani na" — তাই এটা।
REM
REM  কী দেখে: প্রতিটা API দরজা খুলে দেখে (২১৭টা), আর খুঁজে বের করে —
REM    · CRASH        500 — কোথাও কেউ `!` মেরেছে
REM    · BROKEN IMAGE record বলছে ছবি আছে, ঠিকানা খোলে না
REM    · CSS LEAK     imageUrl-এর ঘরে "url(...) center/cover"
REM    · BANGLA       error message-এ বাংলা (কোডে/পর্দায় বাংলা নয়)
REM    · INVENTED     যে বানানো লেখা তুলে দেওয়া হয়েছে, ফিরে এসেছে কিনা
REM
REM  ✅ কেবল পড়ে — একটাও লেখে না। production-এও চালানো নিরাপদ।
REM     (RUN_TESTS.bat ঠিক উল্টো — সে test order বসায়।)
REM
REM  RADIAN_CHECKUP.bat            লোকাল (START_RADIAN আগে চালু থাকুক)
REM  RADIAN_CHECKUP.bat demo       ইন্টারনেটে বসানো demo
REM  RADIAN_CHECKUP.bat screens    লোকাল + admin-এর প্রতিটা পাতা খুলে দেখা
REM ═══════════════════════════════════════════════════════════════════
cd /d "%~dp0"

if /i "%1"=="demo" (
  set "API=https://radian-api-qnt6.onrender.com"
  set "ADMIN_URL=https://radian-admin.vercel.app"
  echo Checking the DEMO site. First call may take a minute - Render sleeps when idle.
  node apps\api\scripts\checkup.mjs
  goto done
)

if /i "%1"=="screens" (
  node apps\api\scripts\checkup.mjs --screens
  goto done
)

node apps\api\scripts\checkup.mjs

:done
echo.
pause
