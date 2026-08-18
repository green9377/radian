@echo off
REM ===================================================================
REM  RADIAN SHIP - one double-click: build check, commit, push.
REM
REM  Why this exists: Claude's sandbox can edit files but cannot delete
REM  or reach the internet, so git commit/push must run on this PC.
REM  Claude writes the commit message into _SHIP_MSG.txt; this script
REM  does the rest, so the owner never types git commands again.
REM
REM  Safe by design:
REM    - refuses to run if _SHIP_MSG.txt is missing (nothing staged blind)
REM    - runs BUILD_CHECK first; a red build never ships
REM    - commits with whatever identity git config already holds
REM      (never overridden - the Vercel BLOCKED trap, CLAUDE.md section 5)
REM    - deletes _SHIP_MSG.txt after a successful push, so the same
REM      message can never ship twice by accident
REM ===================================================================
cd /d "%~dp0"

if not exist _SHIP_MSG.txt (
  echo [X] _SHIP_MSG.txt not found - nothing is ready to ship.
  echo     Ask Claude to prepare a change first.
  pause
  exit /b 1
)

echo ============================================
echo  What is about to be committed:
echo ============================================
type _SHIP_MSG.txt
echo.
echo ============================================
git status --short
echo ============================================
echo.
choice /c YN /m "Ship this"
if errorlevel 2 (
  echo Cancelled - nothing committed.
  pause
  exit /b 0
)

call BUILD_CHECK.bat
if errorlevel 1 (
  echo [X] Build failed - NOT shipping.
  pause
  exit /b 1
)

git add -A
git commit -F _SHIP_MSG.txt
if errorlevel 1 (
  echo [X] Commit failed - see the message above.
  pause
  exit /b 1
)

git push origin main
if errorlevel 1 (
  echo [X] Push failed - check the internet connection and try again.
  pause
  exit /b 1
)

del _SHIP_MSG.txt
echo.
echo ============================================
echo  Shipped. Vercel/Render will deploy in 2-4
echo  minutes. Claude verifies the deployment.
echo ============================================
pause
