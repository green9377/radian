@echo off
REM ============================================================
REM  ONE BUNDLE, SEVERAL PRODUCTS, ONE DISCOUNT.   DEC-PRD-017
REM  Owner's decision, 2 Aug 2026:
REM
REM    "ami bundle a click kre others product select kre protita
REM     product a individually discount ditachi.  ata ami chai na.
REM     ami chai... main product ar sathe ar 1,2,3,4 jai hok je
REM     poriman product add kri, korar por niche akta discount
REM     ghor asbe.  dile total sob product miliye, main product
REM     soho, discount count hobe."
REM
REM  WHAT CHANGES
REM    Until now one bundle meant ONE product with its own
REM    discount.  Three things meant three rows, three separate
REM    discounts, and no way at all to say "all of it for this".
REM
REM    Now one bundle holds as many products as you like, with a
REM    single discount box underneath - and that discount counts
REM    the main product too.
REM
REM  IF A CUSTOMER TAKES TWO BUNDLES
REM    The main product is counted in the FIRST one only.  The
REM    others discount just their own products.  Otherwise the
REM    main product would be discounted twice and the total would
REM    fall on its own.
REM
REM  YOUR EXISTING BUNDLES ARE SAFE.  Each one becomes a bundle
REM  holding the single product it already had, so the site looks
REM  exactly as it does today.
REM
REM  ** NOTHING IS DELETED.  One new table, old rows copied in. **
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
