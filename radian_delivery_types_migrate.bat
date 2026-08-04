@echo off
REM ============================================================
REM  DELIVERY MODULE - step 2a.   DEC-DLV-008 / DEC-DLV-009
REM
REM  Owner's two rulings, 1 Aug 2026:
REM    1. "ekhane beshi nirdishtotai jitbe"
REM       -> area price beats zone price.
REM    2. "delivery module-e ja edit ba change kora hoy, ta jeno
REM        auto pura system-e kaj kore - frontend, product upload
REM        page, ar jekhane eta dorkar sob jaygay."
REM       -> nobody keeps their own copy of a delivery name,
REM          charge or slot.  One source, everywhere.
REM
REM  WHAT THIS ADDS
REM    DeliveryType          the NAMES, once for the whole shop.
REM                          The product upload page will show
REM                          exactly this list and nothing else.
REM    DeliveryMethod.typeId which name a price belongs to
REM    ProductDeliveryType   which deliveries a product can take
REM
REM  WHY A NAMES TABLE
REM    Dhanmondi's "Same day" and Gulshan's "Same day" are two
REM    rows, because the charge differs.  If a product were tied
REM    to the TEXT, renaming "Same day" to "Same-day" one day
REM    would silently cut every product loose - no error, the
REM    customer simply stops seeing fast delivery.  Links are
REM    made on ids, never on words that can be rewritten.
REM
REM  IT FILLS ITSELF IN
REM    Names are read out of the prices you already have, and
REM    each product's three old tick-boxes are matched across
REM    once.  You do not retype anything.
REM
REM  ** NOTHING CHANGES ON SCREEN YET. **  The three old columns
REM  on Product are still there and still working.  They come out
REM  once the screens have moved over - keeping the same fact in
REM  two places is a debt, and it gets paid in step 3.
REM
REM  STILL TO COME
REM    step 2b  the Zones/types/slots screen saves for real
REM    step 3   product upload reads the names from this module
REM    step 4   checkout reads charge, slot and cut-off from here
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
