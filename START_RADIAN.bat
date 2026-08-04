@echo off
title Radian Launcher
REM ============================================================
REM  START RADIAN  -  one file, run it after every restart
REM
REM  Why this is needed at all: Docker Desktop does not start
REM  itself when Windows starts. The containers are set to come
REM  back on their own, but they can only do that once Docker's
REM  engine is running - and the engine takes half a minute to
REM  wake up. Open the panel before then and it says
REM  "The API is not answering", which is true but temporary.
REM
REM  This file starts Docker if it is asleep, WAITS until the API
REM  actually answers, then opens the panel. No guessing.
REM
REM  CHANGED 28 Jul: the API now runs INSIDE Docker, not on this
REM  computer. The old version started a second copy here and the
REM  two fought over port 4000.
REM ============================================================
cd /d D:\radian

echo ==================================================
echo    Radian - starting up
echo ==================================================
echo.

REM ---- 1. Docker engine ----------------------------------------
echo [1/4] Checking Docker...
docker version >nul 2>&1
if not errorlevel 1 goto docker_ready

echo       Docker is not awake. Starting Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo       Waiting for the engine ^(about a minute^)...
set /a TRIES=0
:wait_docker
timeout /t 5 /nobreak >nul
docker version >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a TRIES+=1
if %TRIES% GEQ 36 (
  echo.
  echo       Docker did not come up after 3 minutes.
  echo       Open Docker Desktop yourself, wait for "Engine running",
  echo       then run this file again.
  echo.
  pause
  exit /b 1
)
echo       still waking up... ^(%TRIES%^)
goto wait_docker

:docker_ready
echo       Docker is ready.
echo.

REM ---- 2. containers -------------------------------------------
echo [2/4] Starting the database and API...
docker compose up -d
echo.

REM ---- 3. wait for the API to actually answer -------------------
echo [3/4] Waiting for the API to answer on :4000...
echo       The containers are up, but the API compiles itself on a cold
echo       start and that takes 60 to 90 seconds. Counting to 40 here is
echo       normal and means it is working, not stuck.
echo.
set /a TRIES=0
:wait_api
curl -s -o nul http://localhost:4000 2>nul
if not errorlevel 1 goto api_ready
timeout /t 3 /nobreak >nul
set /a TRIES+=1
if %TRIES% GEQ 60 (
  echo.
  echo       The API still is not answering after 3 minutes. That is
  echo       longer than a slow start, so something has gone wrong.
  echo       Run  radian_api_logs.bat  and tell Claude - the log
  echo       will say what.
  echo.
  pause
  exit /b 1
)
echo       not yet... ^(%TRIES%^)
goto wait_api

:api_ready
echo       API is answering.
echo.

REM ---- 4. admin panel ------------------------------------------
echo [4/4] Starting the admin panel ^(:3001^) in its own window...
start "radian-admin" cmd /k "cd /d D:\radian\apps\admin && npm run dev"

echo       Giving the panel a few seconds to build...
timeout /t 12 /nobreak >nul
start "" http://localhost:3001

echo.
echo ==================================================
echo    Admin panel :  http://localhost:3001
echo    Storefront  :  http://localhost:3000
echo ==================================================
echo.
echo Keep the "radian-admin" window OPEN - closing it stops the
echo panel. This launcher window you can close.
echo.
echo TIP: to skip step 1 every day, open Docker Desktop, go to
echo      Settings, General, and tick "Start Docker Desktop when
echo      you sign in". Then the database and API come back by
echo      themselves and only the panel needs this file.
echo.
pause
