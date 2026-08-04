@echo off
REM ============================================================
REM  WHAT DID THE APPS ACTUALLY SAY?
REM
REM  "Internal server error" in the admin and "Something went
REM  wrong" on the website are only the names the browser shows.
REM  The real message - which line, which table, which column -
REM  is in the container's own log, written WHEN THE REQUEST
REM  HAPPENS, not when it starts.
REM
REM  So: make the error happen first, THEN run this.
REM
REM  Writes two files:
REM    _api_error.txt  - the API   (admin saves, product data)
REM    _web_error.txt  - the site  (the shop's own pages)
REM
REM  Nothing is changed or restarted here. It only reads.
REM ============================================================
cd /d D:\radian

echo Collecting the last 250 lines from the API...
docker compose logs api --tail 250 --no-color > D:\radian\_api_error.txt 2>&1

echo Collecting the last 250 lines from the website...
docker compose logs web --tail 250 --no-color > D:\radian\_web_error.txt 2>&1

echo.
echo ============================================================
echo   Saved to  D:\radian\_api_error.txt
echo             D:\radian\_web_error.txt
echo ============================================================
echo.
pause
