@echo off
REM ============================================================
REM  Radian — one double-click. Fixes the API and writes a log
REM  file that Claude can read directly (D:\radian\_api_log.txt),
REM  so nobody has to copy anything out of a terminal.
REM ============================================================
cd /d D:\radian

echo Working... this takes about a minute. Do not close this window.
echo.

echo [1/5] starting postgres + api
docker compose up -d postgres api

echo [2/5] applying any pending migration
docker compose run --rm api npx prisma migrate deploy

echo [3/5] regenerating the prisma client
docker compose exec -T api npx prisma generate

echo [4/5] restarting the api
docker compose restart api

echo [5/5] waiting 25s for it to compile, then saving the log
timeout /t 25 /nobreak >nul

REM --- everything Claude needs, in one file ---
(
  echo ===== DOCKER PS =====
  docker compose ps
  echo.
  echo ===== API LOG (last 120 lines^) =====
  docker compose logs --tail 120 api
  echo.
  echo ===== ENDPOINT CHECK =====
  curl -s -o nul -w "GET /items            -> %%{http_code}\n" http://localhost:4000/items
  curl -s -o nul -w "GET /item-categories  -> %%{http_code}\n" http://localhost:4000/item-categories
  curl -s -o nul -w "GET /item-attributes  -> %%{http_code}\n" http://localhost:4000/item-attributes
  curl -s -o nul -w "GET /units            -> %%{http_code}\n" http://localhost:4000/units
) > "D:\radian\_api_log.txt" 2>&1

echo.
echo ============================================================
echo  DONE.  A file called  _api_log.txt  was written in D:\radian
echo  Just tell Claude "done" - it will read the file itself.
echo ============================================================
echo.
type "D:\radian\_api_log.txt" | findstr /C:"-> "
echo.
pause
