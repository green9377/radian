@echo off
REM ============================================================
REM  DELIVERY MODULE - step 4 (schema).   DEC-DLV-010
REM
REM  Answers the owner's three questions, 1 Aug 2026:
REM
REM  1. "type-e jokhon 2 hours lekhtasi, system kivabe time-ta
REM      calculate korbe?  nam change kore 3 hours korle?"
REM     -> It cannot, and it must not try.  Reading "2" out of
REM        the name would work by accident for "3 hours" and
REM        break in silence for "druto delivery".  The number
REM        gets its own box: promiseMinutes.
REM
REM  2. "schedule delivery add korar jayga nei, ar new type add
REM      korar o jayga nei"
REM     -> The dropdown had four fixed kinds written in the
REM        code, left over from the demo, and Schedule It was
REM        never one of them.  Now there are five SHAPES and any
REM        name you like.
REM
REM  3. "2 hours delivery dokan off/on porjonto kaj korbe, tar o
REM      akta sima thakbe - like 10 theke 9 ta porjonto"
REM     -> openFromMin / openToMin.  The shop being open and the
REM        delivery running are two different things: at 11 PM
REM        "within 2 hours" means 1 AM, which nobody can keep.
REM
REM  The clock starts at ORDER CONFIRM - your own earlier rule,
REM  and the same moment the capacity module already uses.
REM
REM  WHAT IT ADDS to DeliveryType
REM    timing          one of five shapes
REM    promiseMinutes  120 for two hours, 180 for three
REM    openFromMin
REM    openToMin       the delivery's own daily window
REM
REM  It fills in the four you already have by name, once.  The
REM  2-hour window is set to 10 AM - 9 PM from your example -
REM  change it on the screen if that is not right.
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
