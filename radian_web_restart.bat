@echo off
REM ============================================================
REM  Restart the web container.
REM
REM  Needed after a change to .env — Next.js reads environment
REM  variables once, when the process starts. Editing .env while
REM  it is running changes nothing, which looks exactly like the
REM  fix not working.
REM ============================================================
cd /d D:\radian

echo Restarting web with the new environment...
docker compose up -d --force-recreate web
if errorlevel 1 (
  echo FAILED - read the error above.
  pause && exit /b 1
)

echo Waiting for it to come up...
timeout /t 12 /nobreak >nul

echo.
echo Checking that the web container can now reach the API...
docker compose exec -T web sh -c "wget -q -O - http://api:4000/shop/categories | head -c 120"
echo.
echo.
echo If you saw category names above, it is fixed.
echo Now open:  http://localhost:3000/categories/flower
pause
