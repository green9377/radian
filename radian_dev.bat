@echo off
echo Starting Radian API (:4000) and Admin (:3001) in separate windows...
start "radian-api" cmd /k "cd /d D:\radian\apps\api && set DATABASE_URL=postgresql://radian_user:radian_pass@localhost:5433/radian_db && npm run start:dev"
start "radian-admin" cmd /k "cd /d D:\radian\apps\admin && npm run dev"
echo.
echo Open in browser:  http://localhost:3001/products
echo (API health: http://localhost:4000/ )
echo Keep both windows open. Close them to stop the servers.
