@echo off
REM ============================================================
REM  Stock 0 = order dewa jabe na.  DEC-PDP-09
REM  Owner's ruling, 1 Aug 2026.
REM
REM  Adds to Product:
REM    soldOutMode   - STOCK_OUT (default) or PRE_ORDER,
REM                    chosen per product in Stock & lead time
REM    preorderDate  - "Expected back on", typed by the owner
REM
REM  ** THIS ONE CHANGES HOW THE SHOP BEHAVES. **  Every other
REM  migration so far was additive and invisible.  After this
REM  runs, any product sitting at 0 stock stops being buyable -
REM  the page says "Out of stock" and the order endpoint refuses
REM  it.  That is the point, but it is not silent, so check the
REM  Stock page afterwards for anything at 0 that should not be.
REM
REM  Not gated:  Tracked products (their real count lives in the
REM  Item module) and vendor products (we hold none of their
REM  stock, so our number says nothing about theirs).
REM
REM  This just calls the normal apply script - it applies every
REM  pending migration, refreshes the client, and waits for the
REM  API to be running the NEW code.
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
