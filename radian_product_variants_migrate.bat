@echo off
REM ============================================================
REM  ONE PRODUCT, MANY VARIANTS.   DEC-PRD-012
REM  Owner's decision, 1 Aug 2026:
REM
REM    "akta product jodi kono variant na thake tokhon sekhane
REM     ami kichui choose korbo na.  jokhon tar multi variant
REM     thakbe tokhon ta show korabo - ar ta akta product page-e
REM     hobe.  protitar alada image and stock thakbe."
REM
REM  WHY THIS CHANGES THE OLD DESIGN
REM    Before: each colour was its OWN product, tied together by
REM    a VariantGroup, and the swatches jumped between pages.
REM    Good reasons - own stock, own photos, own Google page.
REM
REM    But the screen to PUT a product into a group was never
REM    built.  The table was there, the API read it, the handle
REM    was missing.  So the swatches never appeared at all, and
REM    you caught exactly that: "we can only choose one, why?"
REM
REM    Now: one page, all the colours inside it.  You chose this
REM    knowing Google gets one page instead of three.
REM
REM  WHAT IT ADDS
REM    ProductVariant   one row per colour / flavour / weight on
REM                     a product, each with
REM                       imageUrl    its own photo
REM                       stockQty    its own stock
REM                       pricePaisa  optional - empty means the
REM                                   product's own price
REM
REM  WHY THE PRICE IS OPTIONAL - your words:
REM    "same product just color change hole dame same thakbe,
REM     abr kg change hole ba flavor change hole alada hobe."
REM    So colour lists leave it empty; weight lists fill it in.
REM
REM  IT FILLS ITSELF IN
REM    Any product that already had a colour picked becomes one
REM    variant row carrying that product's stock.  Nothing to
REM    re-enter, and a product with a single variant looks
REM    exactly as it does today.
REM
REM  ** NOTHING IS DELETED. **  The old columns stay until the
REM  new screen is running, then they come out in their own pass.
REM ============================================================
cd /d D:\radian
call D:\radian\radian_migrate_all.bat
