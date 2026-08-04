@echo off
REM ============================================================
REM  Restart the Radian API.
REM
REM  `up -d` rather than `restart`, because it also picks up any
REM  change to docker-compose.yml (the start command, ports, env).
REM  `restart` would silently keep the old container settings.
REM  No image rebuild happens; the source is bind-mounted.
REM
REM  The API now compiles and runs as two separate jobs, so a
REM  TypeScript error prints in the log but no longer takes the
REM  site down. The first start after a restart is the slow one
REM  (a full compile, roughly a minute) - after that, saves are
REM  incremental and take seconds.
REM ============================================================
cd /d D:\radian

echo starting radian_api ...
docker compose up -d api
echo.
echo Compiling. This first pass takes about a minute.
echo Showing the log until it says the API is listening.
echo Ctrl+C is safe here - it stops the log, not the API.
echo.
docker compose logs -f --tail 40 api
