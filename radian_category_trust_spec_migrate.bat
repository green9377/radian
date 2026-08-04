@echo off
REM ============================================================
REM  TRUST BADGES + WHAT'S INSIDE, WRITTEN ONCE ON THE CATEGORY
REM  DEC-PRD-023.  Owner's instruction, 2 Aug 2026:
REM
REM    "trust badges, whats inside, faq astache but agula admin
REM     panel ar koi theke astache?  ami to kothaw kori nai, just
REM     product upload a ache.  ami chai protita admin panel a
REM     jen create kore rakha jay ar akhane jen just se data ase.
REM     trust badge to ami kono icon kichui custom kore banate
REM     parchi na, tumi nijer moto kore diye diso."
REM
REM  WHAT WAS WRONG
REM    The badges and the "what's inside" rows on a product page
REM    came from templates TYPED INTO THE CODE by me - my icons,
REM    my words.  There was no screen anywhere to change them,
REM    and no way at all to use your own icon.
REM
REM  WHAT THIS ADDS
REM    CategoryTrustBadge   three promises, written once per
REM                         category - with your own icon image
REM                         if you want one
REM    CategorySpec         the "what's inside" rows, same idea
REM    ProductTrustBadge.iconUrl   so a product that overrides
REM                         the category can still use your image
REM
REM  THE RULE, same as bundles and "why buy from us":
REM    written on the category  -> every product in it shows them
REM    written on the product   -> that product only, and it
REM                                REPLACES the category's
REM
REM  NOTE: Storefront -> Trust is a DIFFERENT thing - that one is
REM  the homepage strip for the whole site.  This is the product
REM  page, per category.
REM
REM  ** NOTHING IS DELETED.  Two tables, one column. **
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
