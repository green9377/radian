@echo off
REM ============================================================
REM  Vendor products + the number the website shows.
REM  Owner's rulings, 1 Aug 2026.
REM
REM  Adds to Product:
REM    supplierId    - THE VENDOR who makes this listing
REM    displayQty    - the number shown on the site, if not the
REM                    real one
REM    isHandmade    - counts against today's capacity
REM    stockDisplay  - stock / capacity / both
REM
REM  Additive only. Every product already in the database keeps
REM  behaving exactly as it does today.
REM
REM  This just calls the normal apply script - it applies every
REM  pending migration, refreshes the client, and waits for the
REM  API to be running the NEW code.
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
