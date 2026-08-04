@echo off
REM ============================================================
REM  COMBO PRICES.   DEC-PRD-016
REM  Owner's decision, 2 Aug 2026:
REM
REM    "main product + 1 product combo and combo discount price.
REM     main product + extra 2, 3, 4 product jodi combo hoy tahole
REM     setar price bosbe - kotgula product se select korse se
REM     hisabe discount price bosbe."
REM
REM  HOW IT WORKS
REM    The customer still ticks whatever they like.  If that set
REM    matches one you wrote EXACTLY, your combo price replaces
REM    the sum and the page says "you save X".  Anything you did
REM    not write keeps the old maths.
REM
REM  YOU ONLY WRITE THE ONES YOU WANT.  Five add-ons means 31
REM  combinations - nobody fills that in by hand, and a half
REM  filled list is worse than none.
REM
REM  ONE THING TO KNOW
REM    This stores a PRICE, not a discount - your own choice, made
REM    after seeing the trade-off.  A price can go stale when the
REM    main product's price changes.  So the admin always shows
REM    today's normal total beside your combo price, and the
REM    saving moves in front of you when anything shifts.
REM
REM  ** NOTHING IS DELETED.  Two new tables. **
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
