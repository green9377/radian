@echo off
REM ============================================================
REM  EVERY COLOUR POINTS AT ITS OWN STOCKROOM ITEM.  DEC-PRD-015
REM  Owner's decision, 2 Aug 2026:
REM
REM    "manual ta akhonkar motoi hok. ar inventory theke jodi ana
REM     lage tahole stock and lead time-e amra jevabe inventory
REM     theke product deke6i sevabe dakbe. oi option ta rakhbe."
REM
REM  WHY
REM    DEC-PRD-014 settled that when a product has colours, the
REM    colours hold the stock - not the product.  But until now
REM    that stock could only be TYPED IN by hand.  A shop that
REM    counts in Inventory would then have two numbers for one
REM    thing, and two numbers means one of them is wrong.
REM
REM    In the stockroom a red rose and a pink rose are different
REM    things on different shelves.  So each colour now points at
REM    its own Item - exactly like the product-level link on the
REM    "Stock & lead time" tab, one step further down.
REM
REM  WHAT IT ADDS
REM    ProductVariant.itemId   optional link to an Item
REM
REM  EMPTY IS NORMAL and it means something: this colour has no
REM  item of its own, so the product's own item is used.  No gap.
REM
REM  ** NOTHING IS DELETED.  One column, one key, one index. **
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
