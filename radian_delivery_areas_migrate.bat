@echo off
REM ============================================================
REM  DELIVERY MODULE - step 1 of 4.   DEC-DLV-007
REM
REM  Owner's ruling, 1 Aug 2026:
REM    "delivery module-e protita jinisher jonno alada niyom
REM     ache, charge ache.  product upload page-e shudhu nam
REM     gula asbe, ar kaj korbe delivery module-er niyom
REM     onujayi."
REM
REM  WHAT THIS ADDS
REM    DeliveryArea            the zone / area tree
REM                            (Dhaka City > Dhanmondi, Gulshan...)
REM    DeliveryMethod.areaId   which area this price is for.
REM                            NULL = one price for the whole zone
REM    DeliverySlot.startMin
REM               .endMin      the slot's own window, in minutes
REM               .cutoffTime  the slot's own last-order time
REM
REM  ** NOTHING CHANGES ON SCREEN YET. **  Every new column is
REM  nullable and the new table starts with just the two zones
REM  (Dhaka City, Nationwide).  Existing rows behave exactly as
REM  they do today.  Run it and the shop carries on as normal.
REM
REM  WHY IT WAS NEEDED
REM    - the Zones/types/slots screen was demo data living in the
REM      browser.  Change a charge, refresh, and it was gone.
REM    - product upload's three chips were written in the code,
REM      with no link to the delivery module at all.
REM    - checkout's list, charges and time slots were written in
REM      the web app.  Admin said Same day 80 tk, checkout
REM      charged 60 tk.
REM
REM  STILL TO COME
REM    step 2  the Zones/types/slots screen saves for real
REM    step 3  product upload shows the names from this module
REM    step 4  checkout reads charge, slot and cut-off from here
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
