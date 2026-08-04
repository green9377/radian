@echo off
REM ============================================================
REM  THREE THINGS THAT WERE NOT REALLY THERE.  2 Aug 2026
REM  DEC-PRD-025 / 026 / 027
REM
REM  1. SALES SIGNAL
REM     "amra akhane prothome akta fake sale account bosabo like
REM      50, 100, 1000... tarpor real sell hole se songkhar sathe
REM      add hobe.  like amder stock ar moto, ata tumi vule geso.
REM      ar amder akhane just last month ache - today sell, week
REM      sell, month and all time."
REM
REM     The counter did go up on every delivered order.  What it
REM     never did was SHOW.  The "N orders this month" line on the
REM     page is a different sum - real orders only, and silent
REM     below ten.  Your number went nowhere.
REM
REM     Now: your number + real sales, over whichever window you
REM     pick - today, this week, this month, or all time.
REM
REM  2. PERSONALISATION (name on the cake, photo on the mug)
REM     "kothaw image upload ar kothaw text lekhar jayga dite hoy -
REM      setar configure korar jayga pelam na."
REM     There was none.  Worse: the storefront had `perso: null`
REM     written into it, so the box never appeared on ANY product.
REM     Cart and orders already carried the text and the picture.
REM
REM  3. "WANT THIS CUSTOMISED?" - the green WhatsApp box
REM     It showed on EVERY product, the words came from a template
REM     I wrote, and the number was 8801000000000 - which I made
REM     up.  Now it is per product, and the number comes from
REM     Company settings.
REM
REM  ** NOTHING IS DELETED.  One enum, some columns. **
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
