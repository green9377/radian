# Radian — চলমান কাজের একমাত্র বোর্ড

> **এটাই একমাত্র জায়গা** যেখানে "কী হয়েছে, কী বাকি" থাকে (CLAUDE.md নিয়ম ১১)。
> প্রতিটা কাজ শুরু/শেষ হলে এই অংশ হালনাগাদ হবে। _Last updated: 21 Aug 2026._
> নিচের A–F অংশ = ২৩ জুলাইয়ের পুরনো backlog — আংশিক শেষ, ধরলে আগে যাচাই。

---

## 🧩 DEC-PRD-045 — Size × Colour on one product (owner, 23 Aug)

**তাঁর কথা:** *"amr akta product ache jekhane lage ache mediam ache abr small o
ache abr protta size ar ar color o ache"* — তিন size, প্রতিটায় তিন রং。 আর তিনি
নিশ্চিত করেছেন: **প্রতিটা জোড়ার নিজের দাম, নিজের stock, warehouse-এ নিজের item**。

**যে দেয়ালে আটকেছিল:** `ProductVariant` সারি ধরত একটাই মান, আর
`@@unique([productId, variantValueId])` মানে এক product-এ "Medium" একবারই — তাই
Medium×Red আর Medium×Pink কখনো একসাথে থাকতে পারত না。 এজন্যই পর্দায়
"Which list" এসে একটাই বাছতে বলত。

**যা হলো — সারি এখন "মান" নয়, "জোড়া":**

- নতুন table `ProductVariantValue` — এক সারিতে যত মান লাগে (Medium + Red)
- `comboKey` কলাম (সাজানো value-id, `|` দিয়ে জোড়া) আর
  `@@unique([productId, comboKey])`; পুরনো unique উঠে গেছে
- migration `20260823120000_variant_combinations` প্রতিটা পুরনো সারিকে
  **এক-মানের জোড়া** বানিয়ে দেয় — তাই এক-list-এর পুরনো product একটুও বদলায়নি
- server নিয়ম: এক জোড়ায় একই list দুবার নয় · সব সারি একই list-গুলো ব্যবহার করবে
  (নাহলে grid এবড়োখেবড়ো, কোনো জোড়ার দাম কোথাও থাকে না)
- `ProductVariantValue` **soft-delete skip তালিকায়** যোগ করা হয়েছে ওই দিনই —
  REV-RTN-4 ফাঁদ (deletedAt নেই এমন table filter করলে API boot-ই করে না)

**Admin — মালিকের বাছাই "C, but card gula jen dropdown hoy":**
Which lists (একাধিক চালু) → প্রতিটা list-এর মান বাছা → নিচে প্রতিটা জোড়া
**একটা করে বন্ধ কার্ড**: ছবি · নাম · দাম · কত আছে · ON/OFF。 খুললে ভেতরে ওই
জোড়ার নিজের দাম আর সংখ্যা; ছবি আর Inventory item নিজেদের tab-এ (৮ আগস্টের নিয়ম),
এক চাপে。 আগের সব tab-এর per-variant অংশ এখন `variantValueId` নয়, **`key`**
(comboKey) ধরে চলে。

**Storefront:** `PdpVariants` প্রতি list-এ **একটা করে সারি** আঁকে。 এক list-এর
product-এ ঠিক আগের মতোই একটাই সারি。 যে জোড়া বিক্রি হয় না বা ফুরিয়েছে সেটা
দ্বিতীয় সারিতে **নিজেই নিভে যায়** — গ্রাহক এমন জোড়া বাছতেই পারবে না。
দুই list থাকলে জোড়া না বাছা পর্যন্ত **Add to cart / Buy Now ঘুমিয়ে থাকে**
("Choose an option first") — কারণ ৯টা জোড়ার আলাদা দাম আর আলাদা item, জোড়া না
বললে order গুদাম থেকে তোলাই যায় না。

**অক্ষত:** cart · checkout · order · invoice · finance — সব আগে থেকেই "variant
ধরে" চলত, একটা লাইনও বদলায়নি。 receipt-এ নাম যাবে "Medium · Red"。

⚠️ **বাকি:** `RUN_TESTS.bat` এখনো চালানো হয়নি (sandbox-এ DB নেই) — মালিকের
মেশিনে চালাতে হবে。

---

## 🌐 Phase 4 OPEN — Product / Catalogue (22 Aug)

**DEC-WEB-010 — Flat URLs, the FlowerAura pattern (owner's choice, 22 Aug).**
A category lives at the ROOT (`/fresh-flower`, sub at `/fresh-flower/roses`),
a product under `/p/<slug>`. Shipped and walked live the same day:

- routes moved: `app/categories/[slug]` → `app/[slug]`, `app/products/[slug]`
  → `app/p/[slug]`; every internal link, the sitemap and the admin's
  storefront links follow
- **301s for every old shape** in `next.config.ts`: this site's own
  `/categories/*` and `/products/*`, AND the old shop's `/category/*` and
  `/product/*` (radianbd.com) — so on domain-move day nothing 404s.
  ⚠️ That mapping only holds if imported products KEEP their radianbd slug.
- reserved-slug guard in the categories API: a slug that names a fixed page
  (cart, faq, journal, p, …) is refused with a plain message
- trap fixed on the way: `buildSubCategoryConfigs` parsed hrefs expecting
  `["categories", parent, sub]` — the prefix removal would have silently
  produced ZERO sub-configs
- verified live: `/categories/fresh-flower` → `/fresh-flower` (renders),
  `/category/fresh-flower` → same, `/products/x` → `/p/x`

Also live: the category icon (Card art → Icon) finally renders — beside each
name in the storefront's category nav. It never rendered anywhere before.

Phase 4 testing runs with the owner step by step; the demo catalogue was found
EMPTY (Phase 0 wipe cleaned Category/Product; Items survived) — the owner is
rebuilding it by hand as the tests walk: categories → product → publish →
price → stock → variants → tags → collections → add-ons → offers → perso → SEO.

---

## 🎟 Offers made real (22 Aug)

The owner asked whether free-delivery rules exist. They do — and the engine is
better than the screens were.

**What the engine already does** (verified live: two offers created, submitted
and approved through the API, then removed):

- free delivery **on chosen products** · **above a spend** · **on a first
  order** — the product/category gate runs BEFORE the free-delivery branch, so
  a product offer only fires when that product is in the cart
- % or flat money off · max-discount cap · coupon codes · category · **payment
  method** · per-customer and total limits · start/end dates
- the cart's own **"spend ৳X more"** bar, and an **approval gate** when a
  discount would sell below cost

**What was wrong, and is fixed:**

| | |
|---|---|
| ⚠️ **Overview invented a leaderboard** whenever the real one came back empty — a shop with no offers was shown somebody else's successful campaigns. On a page the owner opens. | gone; zero is shown as zero |
| Coupons filled its table with invented codes when the API was unreachable | says it cannot reach the API instead |
| **Performance** (`/perf/[id]`) was entirely mock — invented redeemers, revenue, ROI | rebuilt on `/offers/:id` + `/redemptions` + `/timeline` + `/analytics` |
| **Templates** offered BOGO, tiered, free-gift and bundle — **shapes the engine cannot pay**, so pressing one would have promised what checkout could never honour | eight presets, all from the six real shapes; pressing one CREATES a real draft and opens it |
| Five mock screens (`OffersOverview`, `OffersView`, `OffersCoupons`, `OffersApprovals`, `OffersSettings`) + `_data/offers.ts` | deleted — they were orphans, wired to no route |

⚠️ **My own error, recorded so it is not repeated:** I first told the owner
"7 of 8 offer pages are mock". That was counted by COMPONENT, not by ROUTE —
six pages were already live. Count what the router reaches, not what exists in
the folder.

**Still open (owner's call):** zone-specific free delivery (Dhaka vs courier),
free delivery on one delivery TYPE only, repeating windows (every Friday), and
offer profitability over time.

---

## 🔍 Master audit — Occasions & Tags · Brands · Variants (22 Aug)

The owner asked for the four master screens to be read for logical and
systemic faults, not just looked at. Four found:

| # | Finding | State |
|---|---|---|
| 1 | **Brand reaches the storefront NOWHERE** — no `/brands/[slug]` page, no brand filter, not on the PDP, no "Shop by Brand" rail. Yet the admin offered "View on site" (404), a Featured switch feeding a strip that was never built, and a full SEO block writing Google text for a page nobody can open | **Parked** on the owner's call — *"brand ar apatot amra kaj krbo na, amder frontend a dekhabo na."* All three removed from the screen; the COLUMNS keep their values for the day brand pages ship |
| 2 | **Category slug was globally unique** — "Roses" could exist once in the whole shop, so Fresh Flowers → Roses and Artificial Flowers → Roses was impossible, forcing invented names | **Fixed — DEC-PRD-043** |
| 3 | Deleting a variant list asked NOTHING — one click took a colour list and every option in it | **Fixed** |
| 4 | An EMPTY category still appeared in the shop menu, so a shopper pressing it landed on a page with no products | **Fixed** — it returns by itself when the first product goes live |

Checked and found CORRECT (not faults): featuring a tag/category on the
homepage belongs to Storefront → Homepage, not the tag master; custom tag
groups do filter properly through `?tag=`; the storefront hides inactive tags,
groups and categories everywhere it reads them.

### DEC-PRD-043 — a category slug is unique inside its parent

Flat URLs made the old rule pointless: a sub already lives at
`/parent/sub`, so two subs under different parents can share a name.

⚠️ **TWO indexes, not one.** `@@unique([parentId, slug])` does not constrain
top-level rows, because Postgres counts every NULL as distinct — two roots
called "roses" would slip through and fight over `radianbd.com/roses`. The
migration adds a PARTIAL unique index on `slug WHERE "parentId" IS NULL`,
which Prisma cannot express in `schema.prisma`. If Category is ever rebuilt,
that index must be carried over by hand.

Everything that resolved a category by slug alone now pins `parentId: null`
for the root lookup — otherwise `/roses` could answer with a sub-category that
already has its own address.

**Verified live:** "rose" created under teddy while "rose" already sits under
Fresh flower (201), and a second "rose" inside Fresh flower still refused
("rose" already exists inside this category).

---

## 🧾 Phase 3 part B — Purchase (21 Aug)

Walked the whole circle on demo myself before handing it over: PUR-000006
(buy → received → part paid → paid), PUR-000007 (advance → cost-jump refusal →
confirm → received → PRT-000001 return), PUR-000008 (advance → 4 of 10 taken in).

Verified live, nothing to fix:

- create → receive → stock lands in Main Storeroom with the right unit cost
- item cost follows the moving average: 5.15 → 5.63 (20 @ ৳8) → 6.60 (5 @ ৳30)
- cost-jump guard refuses a price 3× off and offers one confirm (PUR-R07)
- payments: part payment, then the rest; "Add payment" disappears when nothing is owed
- supplier return: stock out, ৳60 cut from the due first (PUR-R08)
- supplier ledger and the purchase board agree on the due to the last taka

Shipped in the same pass:

| | |
|---|---|
| **DEC-PUR-013** | **Only part of it arrived** — receive line by line; the API always allowed it, the screen did not. A part receipt refused on price comes back as the same part receipt, not as "everything" |
| **DEC-SUP-011** | the supplier's **What we buy** tab, read off the purchase history: item, how many bills, how much bought, last price, average price. It used to say "Items (0)" while seven bills sat in his ledger |
| polish | money reads in ৳ everywhere (timeline said "60 tk"), the rail label fits ("Still owed"), and a returned line prints "− ৳60 returned" so total − paid ≠ due stops looking like broken arithmetic |

Owner's ruling, 21 Aug: a replacement is like-for-like (no price difference),
and a part delivery is taken in line by line.

Left for part C (Inventory): stock board, warehouses, transfers, DEC-INV-017
warehouse rules, DEC-INV-018 sell-from-where.

---

## ✅ PHASE 3 CLOSED — 22 Aug 2026

Final sweep before hand-over, all green:

- guards: no-bangla · split-stores · discount-window · registry drift (6/6) ·
  `tsc --noEmit` on api and admin
- every Phase-3 API door answered 200 through the live session (29 endpoints:
  items, purchases, suppliers, inventory, reports, payment methods, POS, returns)
- migrations on the demo database: all applied, none pending
- the stocktake circle walked end to end for the first time: count sheet →
  draft STK-000001 (1 differ, −৳20) → **Apply** → `ADJUSTMENT −1 rose — Green`
  in the ledger with the note "Stocktake STK-000001"

Gaps found in this sweep and fixed the same hour:

- the stocktake sheet listed the WHOLE catalogue instead of that store's shelf
  → now the shelf, plus "Found something else" for anything the ledger did not
  expect
- Opening stock opened an empty picker when a store had nothing left to open
  → now says why, with the Adjust link
- the last Bangla comments in `inventory.service.ts` / `.controller.ts` are
  English (house rule 9)

**Next:** Phase 4 — Product / Catalogue. Direction file:
`RADIAN_PHASE4_DIRECTION.md`.

---

## 📦 Phase 3 part C — Inventory (21 Aug night, shipped + self-tested)

The owner's four points, all live:

1. **Stock board = photo tiles** (rows one press away) — the same card language
   as the till's picker: image, IN STOCK big, per-store chips, LOW/NEGATIVE
   borders, Adjust in the footer.
2. **Opening / Transfer / Wastage pick items in the shared `ItemPicker`** — the
   bare-name dropdown is gone; a chosen line shows its photo and stays.
   Self-tested live: OPENING +4 (rose — Green), TRF-000002 (−5/+5 Main→Shop),
   WST-000001 (−2, Rotten) — all three verified in the movements table.
3. Stocktake explained to the owner (draft count → review differences → Apply
   posts adjustments). Screen unchanged this round.
4. **Settings fills the width** — three warehouse decisions side by side
   (sales / purchases / assembly picks, DEC-ASM-003 now visible), the two
   switches under, and a "Your stores" strip. **Warehouses moved to Setup**
   (shop-wide fact, CLAUDE.md §15); registry regenerated, 6/6 green.

Still open in part C: wastage/gift reasons are hardcoded (DEC-GBL-004 reason
master), movements/reports pages untouched this round.

---

## 🧾 Bill pages + paisa (owner, 21 Aug evening — all shipped)

- **Paisa can be typed** — every payment amount box is now `TakaInput`
  (MoneyBlock): buffered text, two decimal places, "19.8" survives the redraw.
  One component, so POS, purchases, due board and dialogs all got it at once.
- **One bill face** — `BillUI.tsx` holds the purple `MoneyRail` (payable big,
  arithmetic under, PAID/DUE tiles), `PaymentsCard` (purple header, coloured
  method chips) and `BillTimeline` (icon beads on a thread). The purchase bill
  and the counter bill both read from it, so they cannot drift apart.
- Payment methods page restyled twice on feedback and settled: light tinted
  headers per method colour, packed two columns, dialog editor with Save,
  Bangladesh bank list + full bank fields, and delete for an untouched account.

---

## ↩ Returns — what the owner found on 21 Aug (all shipped)

| What was wrong | What it is now |
|---|---|
| No return could be created at all — "same returnNo already exists" | A deleted return still owns its number; the counter now reads the raw table and steps over a taken number (`withNextReturnNo`). POS bill numbers had the same trap. |
| A completed return never put the goods back | Restock speaks Item as well as Product, and lands in the store the goods left (DEC-INV-018) |
| A replacement gave goods away and took nothing off the shelf | **DEC-RTN-017** — the return screen asks what goes out (same goods by default, or pick another item from the counter list); completing posts the goods out as a SALE movement and the bill shows "Given instead" |
| Store credit never asked how much | **DEC-RTN-018** — the amount is asked, default = value of the goods. Above what was collected is OWNER/MANAGER only; cash refunds stay capped (DEC-RTN-008) |
| A part-compensation payout offered the whole line value | The dialog pays the agreed amount |
| Store credit / replacement asked "which way does the money go back" | That question only appears for a refund; the button says what will happen |
| Explanations all over the screen | Every choice carries a small "i" that opens its own line, in its own slot |

Replacement price difference: **not charged** — a replacement is a like-for-like swap (owner, 21 Aug).

---

## 💳 One money screen, everywhere (owner, 21 Aug) — rule in CLAUDE.md §14

`apps/admin/app/_components/MoneyBlock.tsx` — grand total loudest, four small
doors under it (Discount taka/% · named Charge · ± Adjustment · VAT), then
Payment (as many methods as wanted, its own scroll, amounts balance themselves),
and the button never leaves the screen.

**POS Sell — done, owner-approved (21 Aug).**

Screens that still carry their own money UI (found by reading the code, 21 Aug):

| Screen | What it does today | What it must become |
|---|---|---|
| ~~POS -> Due board (`PosViews.tsx`)~~ | ~~"Collect" takes the WHOLE due as cash~~ | **DONE 21 Aug** — a proper collect dialog in the house style: how much, which methods, oldest bill first, "Still owed after this" in amber. The board's invented demo rows went with it |
| ~~Purchase bill (`PurchaseDetailView.tsx`)~~ | ~~its own little "Add payment" form~~ | **DONE 21 Aug** — `PayDialog`: many methods, part payments, PUR-R04 upheld |
| ~~Purchase new (`PurchaseNewView.tsx`)~~ | ~~its own discount / VAT / adjustment fields~~ | **DONE 21 Aug** — MoneyBlock `tone="light"`, three doors (a purchase bill has no VAT field yet), split payments posted after create |
| ~~Returns / refund (`ReturnViews.tsx`)~~ | ~~one free-text reference box~~ | **DONE 21 Aug** — `RefundDialog`: what goes back, which way, a reference; the payout stays capped at what was collected (DEC-RTN-008) |
| New order (website) | reads its total from the offers engine + delivery fee | **nothing to do** — there is no manual discount on a website order; the block would be a lie |
| Order edit | per-LINE discounts + named charges, with a real API behind them | a cosmetic pass one day; the logic is right and differs from a counter bill |
| Finance -> Money in / out | moves between money ACCOUNTS (drawer, bKash, bank) | **nothing to do** — accounts are the right model there, not payment methods |
| Delivery -> settle COD | a batch table: many parcels, each with cash received + cost | **nothing to do** — one balance per dialog would make it worse |
| ~~POS Settings -> Payment methods~~ | ~~four names HARDCODED, always "On"~~ | **DONE 21 Aug** — DEC-POS-021 `PosSetting.enabledMethods`; switch one off and it leaves the till. Saving POS settings had been broken since the actor stamp landed (ActorInterceptor writes `actorName` into every body and the service passed the body straight to Prisma) — fixed by naming the fields |

---

## 📌 Phase 3 — where it stands (21 Aug)

**Closed and owner-approved:** every Items screen · item type master ·
sub-category · variant family as its own page · per-variant photos · category /
brand / supplier / unit / colour / size all creatable inside the item form ·
cost = purchase average (DEC-ITM-023) · sell = cost + markup · "See cost prices"
permission (DEC-ADM-012) · "We sell it" and "Sell online" as two real switches
(DEC-ITM-024) · everything in the item list is for selling (DEC-ITM-025) · a
service is always saleable (ITM-R13) · **the counter sells Items, not Products
(DEC-POS-018)** · haggling, price floor, nothing sold off an empty shelf ·
the money block.

**Deliberately left open, each in its own phase:**
- putting a returned counter item back on the shelf -> Returns phase
- the shop's own AC / lights belong in an asset book, not in Items -> Finance
- a screen to set the POS discount cap -> POS phase
- moving the six screens above onto MoneyBlock -> each in its own phase

---

## 🧪 MODULE-BY-MODULE TESTING — the campaign board (19 Aug 2026)

Owner tests hands-on, one phase at a time; Claude does ALL the work and
ships to demo; nothing outside the current phase's pages gets touched
unless the owner says so.

| Phase | Scope | State |
|---|---|---|
| 0 | Baseline sweep + demo DB cleaned to config-only | done (18 Aug) |
| 1 | Administration — access templates, invites, guard, bell, all pages | **CLOSED 19 Aug** |
| 2 | Masters — units, categories, colours/sizes, variants, supplier types, channels, delivery masters+setup | **CLOSED 19 Aug** |
| 3 | Items → Purchase → Inventory | **CLOSED 22 Aug** — all three parts shipped and self-tested live; hand-over in `RADIAN_PHASE4_DIRECTION.md` |
| 4–10 | Product/catalogue → Checkout/Payment → Orders/Delivery → Returns → POS → Finance → Growth | pending |

Phase 2 closed with (all owner-tested and revised, live on demo):
- every master rebuilt clean: no page prose, no field hints, inline dialog
  errors with live duplicate checks, darker text tokens (second pass)
- every sample-data pour deleted: "Add the usual X" buttons, the variants
  fake catalogue, the HR practice-staff bar, the Upgrades offline fallback
- DEC-SUP-010 dual-role suppliers (one row, both workspaces) + migration
- channel master finally feeds the New-order form; storefront books under
  `website`
- DEC-DLV-018 delivery: masters made once (methods / slot templates /
  zones), Setup only connects (price + per-zone slot capacity), TimeSelect
  dropdowns everywhere, circle verified live on /shop/delivery-options
- leftovers parked in the direction file §4 (hr/demo endpoints, product
  demo fallbacks, banner-to-bell moves — each in its own phase)

Phase 1 closed with, all verified live on demo and owner-tested:
- template workshop (Access) + People & accounts with exactly two doors;
  invites REQUIRE a template; one-time links point at the real panel
- guard ENFORCING (stage 3); the rajib hole closed at both layers; 25
  unjudged API prefixes aliased, and the drift check now scans every .ts
  file (52 prefixes, 0 uncovered)
- THE LIFT: a module on Auto opens when a screen inside it is allowed;
  AccessGate: a pasted URL meets a closed-door card, not a page of 403s
- ONE notification bell (OWNER) carries every state notice; pages carry
  none (backup, guard refusals, invites, licence, papers, payment
  sandbox/off, undecided screens)
- redesigned in the house style: Overview, Access, People, Activity &
  sessions (merged, history as modal), Company (destination tags),
  All settings (coloured map), Backup

Deferred on purpose (do in their own phase, or when the owner asks):
- ADM-D10 second half: auto-deactivate access when employment ends
- state banners on Finance/Marketing/HR pages move to the bell in their
  own phases (each needs its bell watch wired and checked)
- test leftovers in demo DB: accounts Test Manager / Test Staff / aa,
  templates "ass" / "gdfgdf" — owner may delete via the UI anytime
- PIN test rides Phase 9 (Finance) — the lock is Administration's, the
  buttons that demand it are Finance's

## 🧾 DEC-ITM-022 + DEC-POS-018 — POS sells Items; a Product is the website only (owner, 20 Aug 2026)

Owner's ruling: *"duniar joto sell ache sob POS-e asbe; online on/off ar sathe
somporko hobe just product page."*

| | |
|---|---|
| **We sell it** (`Item.isSaleable`) | sellable at the counter — services included (wrapping, decoration): never bought, only sold |
| **Product** | the website shelf and nothing else. No product = not online, but still on the till |
| **POS catalogue** | Items only, never Products — one thing cannot appear twice, and stock leaves by one path |
| **Counter price** | `Item.sellingPricePaisa` (DEC-ITM-022, built today). The website price stays the Product's own field and may differ |

Done today (Items phase): schema + migration `20260820060000_item_selling_price`,
API create/update, the editor's "Counter price" field (red under the floor), and
the duplicate switch removed from the "Sell online" tab.

SHIPPED 20 Aug (all six, live on demo):

1. ✅ `OrderLine.productId` nullable + `OrderLine.itemId`, with a CHECK that exactly
   one is set. `SalesReturnLine` follows the same shape.
2. ✅ `GET /pos/catalogue` — items only; the POS screen reads it
3. ✅ `createSale` takes `itemId` lines, prices them the way the item screen does
   (DEC-ITM-023), refuses an unpriced item and anything under the item's floor
4. ✅ Stock leaves through Inventory by item (MAKE_TO_ORDER still eats its recipe;
   a service posts nothing and says so)
5. ✅ `PosDiscountRule` gained `itemId` / `itemCategoryId`; product rules still apply
   to legacy product lines
6. ✅ Old POS sales keep their `productId` — history untouched

Still open, on purpose:
- restocking a RETURNED counter item — Inventory's `postSaleReturn` still speaks
  Product, so item lines are left out of the automatic restock (Returns phase)
- the POS screen's discount cap is still the old hardcoded category map on the
  client; the server cap is the real one (POS phase)
- DEC-ITM-024 `isOnline`: the switch and the product-picker gate are live; nothing
  yet un-links a product when the switch goes off (it refuses on the next save)

---

## 🧾 20 Aug — Items, POS and the cost permission (all live on demo)

Decisions locked and built today, on top of DEC-ITM-022 / DEC-POS-018 above:

| | |
|---|---|
| **DEC-ITM-023** | The counter price FOLLOWS the cost: sell = purchase average + profit%. The percent is the shop default (Items → Pricing, 20%), an item may carry its own, and an item may fix an exact price which ignores both. Cost is read-only once the item has been bought — purchases own the average. |
| **DEC-ITM-024** | "Sell online" is its own switch (`Item.isOnline`), separate from "We sell it". Off = never on the product page; the counter is untouched. The product editor's item pickers and `validateRefs` both enforce it. |
| **DEC-ITM-025** | Everything in the item list is for selling, so a new item starts saleable whatever its type. Things that are NOT for sale (the shop's own AC, its lights) are assets — a different book, not built yet. |
| **ITM-R13** | A SERVICE is always saleable and never purchasable. A forgotten tick used to hide a whole service from the till. |
| **DEC-ADM-012** | "See cost prices" is a permission on the access template, not a screen. Enforced server-side by `common/strip-cost.ts`: cost, computed/effective cost, stock value, floor, margin rule, markup and suggested price all leave the response. OWNER always sees cost. |
| **POS-R14** | The counter cannot sell what is not on the shelf — tile disabled at zero, qty capped, server refuses. Services are never counted, so never blocked. |
| **POS-R15** | The line price is the cashier's to change (haggling). The item's floor is the only wall, on the screen and on the server. |

Screens built or rebuilt: Items → Pricing · Items → Item types · the variant
FAMILY editor at `/items/family/[key]` (full page, same shape as New item group)
· POS catalogue in tiles or rows · cost switch on Administration → Access.

Still open, on purpose:
- restocking a RETURNED counter item (Inventory's `postSaleReturn` still speaks
  Product) — Returns phase
- POS discount cap: the server's is real; the screen no longer guesses one
- an ASSET book for the shop's own things (AC, lights) — not started

## 🔤 প্রকল্প থেকে বাংলা সরানো (চলমান, ১৭ আগস্ট শুরু)

**মালিকের নির্দেশ:** প্রকল্পের কোথাও বাংলা থাকবে না — **মন্তব্যেও নয়**,
ডকুমেন্টেও নয়。 আর ভবিষ্যতে যেন কেউ নতুন করে না লেখে。

### ✅ যেটা শেষ — এবং এটাই আসল রক্ষাকবচ

`no-bangla.selftest.mjs`-এ **রেশন কাটা (ratchet)** বসানো হয়েছে。 আজকের গণনা
`no-bangla.baseline.json`-এ হিমায়িত; কোনো ফাইলে বাংলা **বাড়লেই build ফেল**。
দু'দিকেই পরীক্ষা করা — বাংলা যোগ করলে exit 1, সরালে exit 0。
**তাই নতুন বাংলা আর কখনো ঢুকতে পারবে না, পুরনোটা যত ধীরেই সরুক।**

### 📊 কত বাকি — আন্দাজ নয়, সংখ্যা

```
node apps/api/scripts/no-bangla.selftest.mjs        ← কত বাকি বলে দেয়
node apps/api/scripts/no-bangla.selftest.mjs --update-baseline   ← অনুবাদের পরে
```

| | শুরুতে | এখন |
|---|---|---|
| মোট | ১২,৭৬৭ লাইন / ৩১৮ ফাইল | **১২,৫০১** |
| `schema.prisma` | ৭৩৩ | **৪৫০** |

ভাগ: **~৮,০৬০ লাইন `RADIAN_*.md` ডকুমেন্টে** (build ছোঁয় না) ·
**~৪,৭০০ কোডের মন্তব্যে**。

### 🔒 প্রতিটা commit-এ যে যাচাইটা চালাতে হবে

```
node apps/api/scripts/comments-only.mjs <file>      ← এক বা একাধিক ফাইল
node apps/api/scripts/comments-only.mjs --staged    ← যা staged আছে সব
```

মন্তব্য বাদ দিলে ফাইলটা HEAD-এর মতোই আছে কিনা দেখে。 **SAFE** = শুধু লেখা
বদলেছে。 **CODE** = মন্তব্যের বাইরে কিছু বদলেছে, আর কোন লাইনটা সেটাও বলে দেয়
— তখন **commit করা যাবে না**。

> ⚠️ **`;` নয়, `&&` দিয়ে জুড়তে হবে** — ১৭ আগস্ট এক লাইনের পুরনো যাচাইয়ে
> `;` ছিল, তাই DIFF দেখানোর পরেও commit চলে গিয়েছিল。 (ওই commit পরে
> যাচাই করা হয়েছে — কোড বদলায়নি, সতর্কতাটাই ভুল ছিল: পুরনো যাচাই
> `/* */` block ফেলত না。)

```
node apps/api/scripts/comments-only.mjs --staged && git commit ...
```

### 🚨 নতুন কথোপকথন — এই অংশটুকু পড়লেই যথেষ্ট

মালিক বলবেন **"বাংলা সরানোর কাজ চালাও"**। তখন যা করতে হবে:

**ধাপ ১ — কত বাকি দেখে নাও (কখনো আন্দাজ কোরো না):**
```
node apps/api/scripts/no-bangla.selftest.mjs
node -e "const b=require('./apps/api/scripts/no-bangla.baseline.json');const e=Object.entries(b).filter(x=>!x[0].endsWith('.md')).sort((a,c)=>c[1]-a[1]);console.log(e.slice(0,8))"
```
দ্বিতীয় কমান্ডটা **সবচেয়ে বেশি বাংলা আছে এমন কোড ফাইল** দেখায় — ওটাই ধরতে হবে।

**ধাপ ২ — অনুবাদ করো।** ফাইলের বাংলা লাইনগুলো `grep -nP` দিয়ে বের করে,
আশপাশ পড়ে, তারপর Edit দিয়ে ইংরেজি বসাও।

**ধাপ ৩ — প্রতিবার commit-এর আগে (`&&` দিয়ে, `;` দিয়ে নয়):**
```
node apps/api/scripts/comments-only.mjs <file> && \
node apps/api/scripts/no-bangla.selftest.mjs --update-baseline && \
git add -A && git commit -q -m "..." && git push -q origin main
```

### ⛔ চারটে ভুল যেগুলো করা যাবে না

1. **যন্ত্রে/দ্রুত অনুবাদ নয়।** প্রতিটা মন্তব্য পড়ে, **কেন** লেখা হয়েছিল
   বুঝে, তারপর ইংরেজিতে লিখতে হবে。 এই মন্তব্যগুলোই প্রকল্পের স্মৃতি —
   "টরন্টো থেকে দেখলে cut-off ৯ ঘণ্টা দূরে দেখাত", "টেবিল ছিল, admin ছিল,
   পর্দা ছিল না"。 বাক্য অনুবাদ করলে কারণটা হারায়, আর তখন মন্তব্য রাখারই
   মানে থাকে না。
2. **মন্তব্যের বাইরে একটা অক্ষরও নয়।** `comments-only.mjs` **CODE** বললে
   commit করা যাবে না — কোন লাইনটা বদলেছে সেটা ও নিজেই বলে দেয়。
3. **তিনটে ফাইলে বাংলা থাকবেই** — scanner-এর ALLOW তালিকায় কারণসহ:
   `inbox/ai-agent.ts` (গ্রাহক বাংলায় লিখলে AI বাংলায় উত্তর দেয়) ·
   `FinanceMushak.tsx` (NBR মূসক ৬.৩ — আইনে বাংলা বাধ্যতামূলক) ·
   `ZonesAvailability.tsx` (বাংলা zone-নাম চেনার regex)。 এগুলো মন্তব্য নয়,
   **চালু জিনিস** — সরালে ফিচার ভাঙে, একটায় আইন ভাঙে。
4. **commit-এ `-c user.email=...` দিয়ে override নয়।** repo-র নিজের পরিচয়
   (`green9377`) ব্যবহার করতে হবে, নইলে **Vercel চুপচাপ deployment
   BLOCKED করে দেয়** (§৫-এর ফাঁদ তালিকা দেখো)。

### ✅ যা ইতিমধ্যে শেষ

`apps/api/prisma/schema.prisma` (৭৩৩ → ০) ·
`apps/web/app/_components/Pdp/PdpView.tsx` (২০৯ → ০) ·
`apps/api/src/shop/product-detail.ts` (১৯৪ → ৫৬, চলছে)

### ▶️ পরের বার এখান থেকে শুরু

ক্রম **ঝুঁকি অনুযায়ী** — আগে কোড, পরে ডকুমেন্ট:

1. `apps/api/prisma/schema.prisma` — **৪৫০ বাকি** (চলছে)
2. `apps/web/app/_components/Pdp/PdpView.tsx` (২০৯) · `apps/api/src/shop/product-detail.ts` (২০১)
3. `apps/admin/app/_data/api.ts` (১১৩) · `apps/api/src/shop/checkout.ts` (৯৫) · `products.service.ts` (৯৪)
4. বাকি কোড ফাইল
5. সবার শেষে `RADIAN_*.md` + `CLAUDE.md`

**তিনটে ফাইলে বাংলা থাকবেই** — ওগুলো মন্তব্য নয়, চালু জিনিস, scanner-এর
ALLOW তালিকায় কারণসহ: chat-AI-এর বাংলা উত্তর · NBR মূসক ৬.৩ form (আইন) ·
বাংলা zone-নাম চেনার regex。

---

## 🧭 Admin panel নতুন করে সাজানো (১৭ আগস্ট) — DEC-NAV-001, DEC-RTN-016

**অবস্থা: কোড লেখা ও যন্ত্রে যাচাই শেষ। commit করা হয়নি — মালিকের চোখে দেখা বাকি।**

### কী বদলাল

আগে ভাগ হতো **তথ্যের ধরন** দিয়ে (Master Data · Commerce · Operations · System)।
ওভাবে Products আর Staff পাশাপাশি বসে, Orders আর Purchases পাশাপাশি বসে — যে
জোড়াগুলো নিয়ে দোকান চালানোর সময় কেউ কখনো একসাথে ভাবে না。

এখন ভাগ হয় **কোনটা কিসের সাথে সম্পর্কিত** (মালিকের কথায়: order = website,
POS = shop, delivery setup = configuration, assembly/inventory = internal):

| Section | কী আছে |
|---|---|
| **Website** | Storefront · Products · Catalog · Orders · Returns (online) · Inbox |
| **Shop** | POS · Returns (counter) |
| **Internal** | Delivery (কাজ) · Inventory · Assembly · Items · Purchases · Returns & Refunds (পুরোটা) · Finance · Intelligence |
| **Marketing** | Marketing & Growth |
| **People** | Customers · Staff · Suppliers |
| **Configuration** | Delivery setup · Returns settings · Administration · My password & PIN |

### তিনটে নিয়ম যা এই সাজটা ধরে রাখে

1. **module দু-জায়গায় থাকতে পারে, তার ডেটা পারে না।** Returns তিন জায়গায় দেখায়,
   কিন্তু টেবিল একটাই, যোগফল একটাই。 দ্বিতীয় সারি একটা **ছাঁকা দরজা**
   (`?channel=`), কপি নয়。
2. **রোজকার পর্দা আর setup পর্দা আলাদা থাকতে পারে।** Delivery-র উদাহরণ: board
   দিনে ২০ বার, Methods & slots বছরে দুবার — তাই board গেল Internal-এ, setup
   গেল Configuration-এ。 module একটাই, দরজা দুটো。
3. **রিপোর্ট থাকবে যেখানে তার সিদ্ধান্ত থাকে।** Delivery-র "Cost & performance"
   Intelligence-এ যায়নি — ওটা পড়ে আপনি Methods & slots-এ গিয়ে zone বদলাবেন。
   Intelligence-এ যায় শুধু সেই প্রশ্ন যার উত্তর এক module-এ নেই。

> ⚠️ **একটাও `href` বদলায়নি।** Access-এর টিক href থেকে তৈরি হয় (ADM-RULE-001),
> তাই পুরনো প্রতিটা টিক আর প্রতিটা bookmark অক্ষত。 group বদলানো বিনামূল্যে,
> href বদলানো নয়。

### DEC-RTN-016 — এক বই, তিন দরজা

`GET /returns?channel=online|counter` — `SalesReturn`-এ নতুন কলাম **নেই**;
order-এর `fulfillmentType` (DELIVERY = online, COUNTER = POS, DEC-POS-001)
দেখে ছাঁকা হয়。 অচেনা মান দিলে পুরো বই ফেরত আসে — কেউ চায়নি এমন ছাঁকনি যেন
চুপচাপ সারি লুকিয়ে না ফেলে。 ছাঁকা দরজায় KPI strip **পুরো বইয়েরই** থাকে
(লেখা "All returns (30d)"), আর উপরে "See every return, both doors together"
লিংক。

### 🔧 যা ঠিক করতে হলো (এই কাজ ধরতে গিয়ে বেরিয়েছে — আগে থেকেই ভাঙা ছিল)

| জিনিস | আগে যা ছিল |
|---|---|
| **`registry.gen.mjs` — নতুন ফাইল** | `registry.def.ts`-এর মাথায় লেখা ছিল "নতুন পর্দা যোগ করলে এই ফাইল আবার তৈরি করতে হবে", আর `registry.drift.mjs` মিল না থাকলে চেঁচাত — **কিন্তু তৈরি করার যন্ত্রটাই কখনো commit হয়নি**。 ফলে নির্দেশ মানার উপায় ছিল না, আর registry-তে **১৩টা পর্দা অনুপস্থিত** ছিল (গোটা Storefront, Inbox, Daily capacity, Settle a carrier, Recover lost orders)。 অচেনা key ⇒ "সবাই দেখতে পাবে" — অর্থাৎ ওগুলো কারও জন্যই বন্ধ করা যেত না。 |
| **`/messaging` guard-এর বাইরে** | AccessGuard প্রথম path-segment দিয়ে node খোঁজে; `messaging` node-ও ছিল না, alias-ও না — তাই **প্রতিটা request বিনা বিচারে পাশ**。 এটাই সেই একটা prefix যেখানে ভুল হাত পড়লে **আসল টাকায় আসল message** চলে যায়। এখন alias → `marketing.messaging`。 |
| **`/shop` অবিচারিত** | পুরোটা `@Public()` (গ্রাহকের browser) — এখন NEVER তালিকায়, কারণসহ。 |
| **query-string মানেই নতুন key ছিল** | `marketing.seo?tab=pages` আলাদা key হয়ে যেত — অর্থাৎ SEO module বন্ধ করলেও তার tab-গুলো খোলা থাকত。 এখন `?`-এর পরেরটা ফেলে দেওয়া হয়: এক পর্দা = এক key。 |

### যন্ত্রে যাচাই (সবগুলো নিজে চালানো)

```
registry drift check .............. 6 passed, 0 failed   ← আগে ছিল 2 passed, 4 failed
no-bangla selftest ................ PASS (769 files)
tsc --noEmit apps/admin ........... clean
tsc --noEmit apps/api ............. clean
href তুলনা (HEAD ↔ এখন) .......... একটাও হারায়নি (162 → 164, নতুন দুটো দরজা)
```

### 🚨 নতুন ফাঁদ — ভুল author-এ commit করলে Vercel **চুপচাপ** আটকায়

প্রথম দুটো push (`c46896c`, `c7013e0`) GitHub-এ পৌঁছেছিল, কিন্তু demo-তে
কিচ্ছু বদলায়নি。 **কোনো build লাল হয়নি** — deployment-এর অবস্থা ছিল
`BLOCKED`, যা dashboard না খুললে দেখাই যায় না。 সাইট আগের build পরিবেশন
করতে থাকে, তাই মনে হয় "কিছুই তো হয়নি"。

**কারণ:** ওই দুটো commit-এর author ছিল `sobuj <sobujgazi77@gmail.com>` →
GitHub account `radian-business`, যে Vercel team-এ নেই。 Vercel অচেনা
author-এর deployment **বানায় না**。 এর আগের প্রতিটা commit ছিল
`green9377 <amiparboinshaallah@gmail.com>` — তাই এই সমস্যা কখনো হয়নি。

**নিয়ম:** commit-এ `git config`-এর পরিচয়ই ব্যবহার হবে。 `-c user.email=...`
দিয়ে override **করা যাবে না**。 এবং push-এর পরে deployment-এর state
`READY` কিনা দেখে তবেই "দেখুন" বলা হবে — `BLOCKED` আর `ERROR` দুটোই নীরব。

**এখন থেকে Vercel + Render MCP যুক্ত** (মালিক, ১৭ আগস্ট) — build সবুজ না লাল,
error কী, redeploy — সব সরাসরি দেখা ও করা যায়。 আর আন্দাজ করতে হবে না。

**যা এখনো বাকি:** মালিকের চোখে দেখা。 তারপর `BUILD_CHECK.bat` → commit → demo。

---

## 🔵 পরের কথোপকথন এখান থেকে শুরু (হস্তান্তর, ১২ আগস্ট শেষ)

**অবস্থা:** সব কাজ commit + push করা, demo-তে deploy করা, কিছুই আধা-শেষ পড়ে নেই。
শেষ commit `090730f`。 কোনো uncommitted বদল নেই。

### ১. মালিকের হাত ছাড়া এগোয় না (একটাই)

**Meta Business-এ `review_request` template approve করানো** —
{{1}} গ্রাহকের নাম · {{2}} পণ্যের নাম · URL button-এ `/review/{{1}}` (token)。
approve হলেই বলবেন — demo-র test নম্বরে পুরো চাকা একবার ঘুরিয়ে দেখাব:
order delivered → ২৪ ঘণ্টা → WhatsApp → link → form → PENDING+Verified review。
_template না থাকলে message `FAILED` হয়ে জমে — order কখনো আটকায় না。_

### ২. পরের session-এ যা করার কথা (মালিকের ভাষায় "onk test baki")

এগুলোর কোনোটাই শুরু হয়নি — যেটা আগে চান, সেটাই ধরব:

| # | কাজ | কেন |
|---|---|---|
| ১ | **Storefront ৬ পাতা লাইভে হাতে চালানো** | নকশা নতুন; আমি DOM-এ যাচাই করেছি, মালিকের চোখে পুরো পথ চালানো বাকি |
| ২ | **Pages: Terms + Refund publish** | ৮টাই এখনো draft; bKash/SSLCommerz merchant approval এই দুটো LIVE চায় |
| ৩ | **Footer → Social profiles** | একটাও ঠিকানা বসানো নেই (`socials: []`), তাই দোকানে social icon-ই নেই |
| ৪ | **Delivery module** — DEC-DLV-016/017 লেখা হয়েছে, **অপ্রমাণিত** | নিচের delivery অংশ দেখুন |
| ৫ | **Journal-এর ফাঁকা "New article" draft** | সংঘর্ষের সময়ের অবশিষ্ট — Edit করে লিখুন, নয়তো Remove |

### ৩. এই session-এ যা শেষ হয়েছে (প্রমাণসহ, নিচে বিস্তারিত)

- **Review v3** — composer · reply · verified · featured-৪ · `/review/[token]` (নিচে ⭐ অংশ)
- **Storefront ৬ পাতা এক ছাঁচে** — Homepage · Category pages · Reviews · Journal ·
  Pages & FAQs · Footer & menus。 বাঁয়ে রঙিন rail (CustomerEditor-এর ভাষা),
  ডানে এক section。 rail এখন সত্যিই আটকে থাকে (ModuleCard-এর `overflow-hidden`
  sticky মেরে ফেলছিল — সরানো হয়েছে)。
- **তিনটে লুকানো রোগ সারানো:** (ক) dialog overlay-তে drag করলে লেখা হারাত →
  এখন শুধু ×/Cancel-এ বন্ধ; (খ) "নতুন কিছু" বোতাম চাপলেই DB-তে খালি সারি
  ঢুকত (Journal-এ slug সংঘর্ষ, Pages-এ "Untitled page") → এখন Save-এ তৈরি;
  (গ) footer-এ অসম্পূর্ণ link/badge দোকানে ফাঁকা `<a>` হয়ে উঠত → server
  ছেঁকে দেয়。

### ৪. মনে রাখার মতো ফাঁদ (এই session-এ ধরা)

- **`overflow-hidden` sticky-র ঘাতক** — parent-এ থাকলে ভেতরের কোনো
  `position:sticky` কাজ করে না, কোনো error ছাড়াই。
- **Vercel-এর queue** — এক push-এর build মাঝে মাঝে পৌঁছায় না; খালি commit
  দিয়ে আবার trigger করতে হয়েছে。 deploy-এর পরে **সবসময় লাইভে যাচাই**。
- **truncate + flex = উপচে পড়া** — grid column-এ button-এ `min-w-0` না দিলে
  লম্বা লেখা কলামের বাইরে ঠেলে দেয়।

## ⭐ Review v3 — বানানো ও লাইভে যাচাই শেষ (১২ আগস্ট, DEC-WEB-007/008/009)

সবই deployed demo-তে হাতে চালিয়ে দেখা:

| জিনিস | অবস্থা |
|---|---|
| **Add-review dialog** — customer বই থেকে বাছাই (ছবি সহ), whole-shop/product | ✅ লাইভ — imran hasan দিয়ে পুরো flow চালানো |
| **Verified** server-এর সিদ্ধান্ত — delivered order না থাকলে badge নেই | ✅ imran-এর delivered order নেই → badge আসেনি (নিয়মই কাজ করছে) |
| **Shop reply** (DEC-WEB-007) — review-র নিচে দোকানের উত্তর | ✅ PDP-তে "REPLY FROM RADIAN" box লাইভ |
| **Featured shelf ৪টা** — পঞ্চমটা দিলে "কে নামবে" dialog | ✅ dialog লাইভে খুলে দেখা, Never mind-এ কিছু বদলায় না |
| **দুটো আলাদা rating card** — নিজের দোকান আর Google, কখনো মেশে না | ✅ `/reviews`-এ R-card + G-card পাশাপাশি |
| **Star + product filter** admin-এ | ✅ |
| **`/review/[token]`** — WhatsApp link-এর pre-filled form, single-use | ✅ ভুল token → "This link is not valid"; আসল token পরের delivered order-এ তৈরি হবে |
| **Delivered + 24h → invite + queue** — বাকি সব OrderMessage-এর পথেই | ✅ code-এ; sweeper-ই পাঠাবে |

**একটাই বাকি ধাপ (মালিকের হাত লাগবে):** Meta Business-এ `review_request`
template বানানো — {{1}} নাম, {{2}} পণ্য, URL button `/review/{{1}}`।
template approve হলে demo-র test নম্বরে পুরো চাকাটা একবার ঘুরিয়ে দেখব
(order delivered → 24h → WhatsApp → link → form → PENDING+Verified review)。
template না থাকা পর্যন্ত message রূপে `FAILED` জমা হবে — order আটকায় না。

**পরিষ্কারও করা হলো:** পুরনো inline-add এক ক্লিকে খালি review বানিয়ে ফেলত —
এমন ৫টা খালি (আর আমার ১টা test) review site থেকে নামানো হয়েছে (unpublish,
মোছা হয়নি — Reviews তালিকায় আছে, চাইলে Remove চাপবেন)। নতুন dialog-এ
লেখা না দিলে Add বোতামই জ্বলে না — এই ভুল আর হবে না।

## নীতি (মালিকের নির্দেশ, ৭ আগস্ট)

**Demo-তে সব থাকবে — সব।** প্রতিটা জিনিস demo-তে sandbox/test মোডে সম্পূর্ণ
পরীক্ষা হবে; real-এ যাওয়া মানে শুধু key/switch বদলানো。 ঝুঁকি সরাসরি real-এ নয়。

## ✅ সদ্য শেষ (৯ আগস্ট রাত) — "purchase করলাম, stock ঢুকল না"

| কাজ | প্রমাণ (deployed demo-তে যাচাই করা) |
|---|---|
| **DEC-INV-016 — গুদাম না থাকলে প্রথম receive নিজেই বানাবে** | PUR-000001 Received+Paid হয়েছিল কিন্তু timeline বলছিল *"No active warehouse — run the inventory seed"*। এটা error-এর ছদ্মবেশে developer-এর নির্দেশ। এখন `ensureWarehouseId()`: সক্রিয় গুদাম → নয়তো soft-deleted `SHOP` জাগাবে (code unique, খালি create করলে সংঘর্ষ) → নয়তো `Main store` বানাবে। **যাচাই:** live-এ এখন একটাই গুদাম, `SHOP / Main store / active` |
| **DEC-PUR-010 — fail-soft মানে অদৃশ্য নয়** | receive hook ইচ্ছাকৃত fail-soft (stock-এর ভুলে committed receipt উল্টে যাবে না), কিন্তু গোটা ঘটনা ছিল শুধু timeline-এর এক লাইনে। এখন — detail-এ প্রতি read-এ per-item ফাঁক, list-এ `stock not posted` ব্যাজ (একটা groupBy, N+1 নয়), আর `POST /purchases/:id/repost-stock` **যা বাকি শুধু তাই** বসায় |
| **PUR-000001 মেরামত** | re-post → `stockGap: null` · InventoryStock: **Paper 20, Sunflower Artificial 50** · দ্বিতীয়বার চাপলে `400 — Stock for this purchase is already posted` (দ্বিগুণ হওয়া অসম্ভব) · list-এর ব্যাজ মিলিয়ে গেছে |

> **কেন নিজে থেকে আবার চেষ্টা করে না:** ভুল auto re-post আসল মাল দ্বিগুণ দেখাবে।
> তাই সিস্টেম ফাঁকটা **দেখায়**, সারায় মালিকের এক চাপে।

### 🏬 DEC-INV-017 — গুদাম এখন আপনি নিজে বানাবেন (১০ আগস্ট)

**Inventory → Warehouses** — নতুন পাতা। বানানো, নাম বদলানো, বন্ধ, আবার খোলা, মুছে ফেলা।

আগের অবস্থা: গুদাম বানানোর কোনো পথই ছিল না — seed চলেনি, API কেবল পড়ত,
পর্দা ছিল না। *"gudam setup kri nai"* — করার উপায়ই ছিল না。

| নিয়ম | কী হয় |
|---|---|
| মাল আছে এমন গুদাম বন্ধ | **আটকাবে**, নাম ধরে বলবে কোন মাল কতটা, Transfer করতে বলবে |
| শেষ খোলা গুদাম বন্ধ | আটকাবে — মাল রাখার জায়গা অন্তত একটা থাকতেই হবে |
| Settings যেটাকে দেখাচ্ছে | আটকাবে, এবং **কোন setting** সেটা বলে দেবে |
| ইতিহাস আছে এমন গুদাম মুছে ফেলা | আটকাবে — বন্ধ করুন, পুরনো হিসাব পড়া যাবে |
| Short code | একবারই বসে, বদলায় না — stock-এর সারি ওটাকে ধরে আছে |

**সাথে ঠিক হলো:** Stock board দুটো কলাম hardcode করে রেখেছিল, আর গুদাম না
থাকলেও "STOREROOM" নাম বানিয়ে ০ বসাত。 এখন কলাম আসে আসল তালিকা থেকে。

**demo-তে এখন:** SHOP `Main store` (বিক্রি এখান থেকে) · STORE `Storeroom`
(ক্রয় এখানে ঢোকে)। প্রতিটা নিয়ম লাইভ ভেঙে দেখা হয়েছে — সবগুলোই ধরেছে。

### ✍️ Content ও Review — মালিকের মানচিত্র (১০ আগস্ট, DEC-WEB-005)

**সবকিছু Storefront module-এর ভেতরে:**

| কী | কোথায় (admin) | দোকানে কোথায় ওঠে |
|---|---|---|
| Article/blog লেখা | **Storefront → Journal** | homepage "Latest Articles" (৩টা নতুন) + `/journal` |
| Privacy/Terms/Refund/যেকোনো পাতা | **Storefront → Pages** | `/privacy-policy` ইত্যাদি — publish + "show in footer" টিক |
| Footer-এর লিংক-দল | **Storefront → Footer** | দোকানের নিচের অংশ |
| Review moderation + নিজের review | **Storefront → Reviews** | নিচে দেখুন |

- Homepage-এ "Latest Articles" **তখনই ওঠে যখন অন্তত একটা লেখা published** —
  খালি অবস্থায় লুকানো থাকে, admin পাতাই সেটা বলে দেয়。
- **ধরা পড়া ফাঁদ (সারানো):** slug-এর ঘর মুছে save করলে খালি slug জমা হতো,
  publish করলে homepage-এর card যেত `/journal/`-এ — অস্তিত্বহীন পাতায়。 এখন
  খালি slug title থেকে নিজে তৈরি হয়; title-ও না থাকলে publish আটকায়。

**Review-র পুরো চাকা (লাইভে প্রমাণিত, এক চক্করে):**
গ্রাহক লিখল (PENDING, পর্দায় নেই) → Storefront → Reviews-এ "Waiting for you"
গোনা → **Publish it** → `/reviews` পাতায় + সেই product-এর নিজের পাতায়。

- **নতুন `/reviews` পাতা** — সব published review একসাথে, উপরে Google card,
  নিচে লেখার form (FlowerAura-ধাঁচ)。
- **Product পাতায় এখন সেই product-এর নিজের review** — গড়, star histogram,
  লেখাগুলো, verified badge, আর ওই product-এ আটকানো লেখার form。 `#reviews`
  লিংক এখন এখানেই নামে。
- Homepage-এর rail এখন কেবল দেখায় — লেখার বাক্সটা উঠে গিয়ে "See all reviews →"。
- Trust line-এর comma-ঘর: blur-এ লেখা tidy করা বন্ধ — টাইপ করা জিনিস আর
  কেউ কখনো ফিরে লেখে না ("google4.4" আর হবে না)。

### 🧾 DEC-INV-018 — যেখানে মাল আছে সেখান থেকেই বিক্রি (১০ আগস্ট)

প্রশ্ন ছিল: বিক্রি Storeroom থেকে কাটার কথা, কিন্তু মাল Main store-এ — আটকাবে?

**আগে:** দোকান মোট গুনত (৫০ দেখাত), কাটত এক গুদাম থেকে → সেটা −১, পাশের ৫০
অক্ষত。 বিক্রি হতো ঠিকই, কিন্তু খাতা মিথ্যা ঘাটতি দেখাত。

**এখন:** default গুদাম আগে → বাকিটা যে গুদামে বেশি আছে সেখান থেকে →
movement-এ `· from Storeroom` লেখা。 কোথাও না থাকলে ঘাটতি default-এ, লাল —
**বিক্রি কখনো আটকাবে না**。 Cancel করলে মাল যে গুদাম থেকে গিয়েছিল সেখানেই
ফিরবে (খাতা দেখে, অনুমান করে নয়)。

**পরীক্ষা:** হিসাবটুকু আলাদা pure function-এ — `RUN_TESTS.bat`-এর শুরুতেই
১৫টা case এক সেকেন্ডে চলে, ডেটাবেজ ছাড়াই。 সবগুলো পাশ。

**Settings পাতা নতুন করে:** দুটো আসল সিদ্ধান্ত পাশাপাশি বড় card-এ (৫৪২px করে,
আগে পুরোটা ৬৪০px-এর এক সরু কলামে), নিচে দুটো switch。 নতুন নিয়মটা পর্দাতেই
লেখা — *"Runs out here? The rest comes from Storeroom automatically"*。

### 🔍 `RADIAN_CHECKUP.bat` — bug খোঁজার কাজটা আর মালিকের নয়

মালিকের কথা: *"avabe jodi protta jinis manullay amr check kre kre thik kra
lage koto year lagbe ami jani na"*। এতদিন এই প্রকল্পে bug ধরার যন্ত্র ছিল
একটাই — মালিকের চোখ। এখন নয়।

| | |
|---|---|
| **চালানো** | `RADIAN_CHECKUP.bat` · `demo` · `screens` |
| **নিরাপত্তা** | কেবল GET — একটাও লেখে না, **production-এও নিরাপদ** (RUN_TESTS ঠিক উল্টো) |
| **তালিকা কোথা থেকে** | controller পড়ে — হাতে লেখা নয়, তাই নতুন endpoint যোগ হলে আপনাআপনি ঢোকে (আজ ২১৭টা) |
| **ধরে** | CRASH (5xx) · BROKEN IMAGE · CSS LEAK (`url(...) center/cover`) · error-এ বাংলা · ফিরে আসা বানানো লেখা · [`screens`] সাদা পর্দা ও console error |
| **exit code** | ভাঙা = 1, শুধু কুৎসিত = 0 |

**প্রথম রানের ফল (deployed demo, ৯ আগস্ট):** ১৬০/১৬০ endpoint 200,
১৯টা ছবিই খোলে, **একটাও দোষ নেই**। ছয়টা detector আলাদা করে প্রমাণ করা
হয়েছে — ইচ্ছা করে ছয় রকম দোষ ভরা একটা নকল API-র বিরুদ্ধে।

⚠️ **যা এখনো প্রমাণ হয়নি:** `screens` অংশটা。 playwright লাগে, আমার
sandbox-এ browser নামেনি。 প্রথমবার আপনার machine-এ চলবে:
`npm i -D playwright && npx playwright install chromium`, তারপর
`RADIAN_CHECKUP.bat screens`。

## ✅ সদ্য শেষ (৭ আগস্ট)

| কাজ | প্রমাণ |
|---|---|
| Messenger + Instagram DM দুই দিকে | Inbox-এ পরীক্ষিত, নাম-ছবি সহ |
| Duplicate thread / Guest নাম / ছবি inline | migration + কোড, UI-তে যাচাই |
| Privacy policy radianbd.com-এ | live |
| **Meta App Review জমা** | Status: **Review in progress** (৩ permission) |
| WhatsApp ৬ template approve | ⚠️ test WABA-তে — আসল নম্বরে আবার জমা (এক click) |
| SSLCommerz sandbox/live switch স্পষ্ট | SANDBOX \| LIVE দুই ঘর + LIVE-এ confirm |
| Integrations পাতার নতুন নকশা | সমান মাপের পরিষ্কার card, grid — মালিক অনুমোদিত |
| **Tracking: storefront এখন pixel চালায়** | আগে ID বসালেও কিছুই হতো না (কোনো read path ছিল না)। এখন GTM/GA4/Meta Pixel/Clarity/TikTok/Snap/Pinterest inject হয় + PageView·ViewContent·Search·AddToCart·InitiateCheckout·**Purchase** (আসল order নম্বর ও টাকায়, dedupe সহ)। Demo-তে test ID দিয়ে প্রমাণিত। আসল ID বসবে cutover-এ (আগে বসালে ভুয়া ডেটা জমবে) |

## ⏳ অপেক্ষা — অন্যের হাতে

| কী | কার হাতে | কতদিন |
|---|---|---|
| App Review-এর ফল | Meta | সাধারণত ≤২০ দিন; email `radianbd360@gmail.com` |

## 🔜 পরের কাজ (ক্রমে)

1. ~~SSLCommerz demo-তে SANDBOX-এ নামানো~~ ✅ করা হয়েছে (৭ আগস্ট রাতে,
   deployed admin-এ যাচাই সহ; আসল key মোছা হয়নি — শুধু মোড)
2. **Steadfast** — মালিক panel থেকে API Key + Secret Key বসাবে; আমি যাচাই করব
3. **Email sending** — ⏸ **cutover পর্যন্ত আটকে** (৭ আগস্ট রাত)। Brevo account
   খোলা, radianbd.com domain Brevo-তে যোগ করা, ৭টা DNS record তৈরি — কিন্তু
   DNS আছে পুরনো hosting-এর (ns1/ns2.hostget.xyz) হাতে, মালিকের সেখানে
   access নেই। **Cutover-দিনে:** registrar থেকে nameserver → Cloudflare (মালিকের
   নিজের, ফ্রি) → Brevo-র record বসানো → sender `order@radianbd.com` →
   API key card-এ → Send test। Provider সিদ্ধান্ত: **BREVO** (৩০০/দিন ফ্রি,
   transactional + marketing এক জায়গায়)
4. ~~SMS sending~~ ✅ **চালু ও পরীক্ষিত** (৭ আগস্ট রাত) — KhudeBarta, মালিকের
   ফোনে test SMS পৌঁছেছে
5. **WhatsApp আসল নম্বর (Coexistence)** — মোবাইল লাগবে (QR scan);
   তারপর template resubmit + advanced access-এর আলাদা submission

## 🗓️ Cutover-দিনের switch-তালিকা

- SSLCommerz → LIVE · WhatsApp আসল নম্বর · privacy-তে checkout clause
  (`RADIAN_PRIVACY_CLAUSES.md`) · Pixel/GA4/Ads ট্যাগ · `NEXT_PUBLIC_*` যাচাই + Redeploy
- **DNS → Cloudflare** (nameserver বদল registrar-এ, মালিকের access আছে) →
  নতুন site-এর record + **Brevo-র ৭টা record** → email চালু

## 🧹 Security (ছোট কিন্তু জরুরি)

- `recovery-codes.txt` repo থেকে সরানো (মালিক) · GitHub PAT rotate

---

# পুরনো backlog (২৩ জুলাই) — আংশিক শেষ

কীভাবে পড়বে: 🔴 = টাকা/ডেটা ভুল হতে পারে, আগে ধরো · 🟠 = গুরুত্বপূর্ণ ফাঁক ·
🟡 = উন্নতি · 🟢 = পরিচ্ছন্নতা।
বিস্তারিত কারণ + কোডের অবস্থান: `RADIAN_SALES_REVIEW.md` (Sales-এর জন্য),
`RADIAN_ADMIN_PROGRESS.md` (module status)।

---

## A. Sales / Orders — deferred (review §2 থেকে)

| id | সমস্যা | কী করতে হবে |
|---|---|---|
| **D1** 🔴 | **Report · Overview · Payments-এর অঙ্ক শুধু প্রথম ১০০ order থেকে** (`pageSize=100` এনে ব্রাউজারে যোগ করা হয়)। ১০০ ছাড়ালেই revenue · AOV · COD-due **নীরবে ভুল** দেখাবে — অথচ এই সংখ্যা দেখে সিদ্ধান্ত হবে | server-side `GET /orders/analytics?days=` (Product-এর `/products/analytics`-এর ধাঁচে); screen সেখান থেকে পড়বে |
| **D4** 🔴 | **Recovery-র আসল state নেই** — `awaiting_payment` · `payment_failed` · `abandoned` · `flagged_risk`। এখন screen শুধু proxy দেখায় (placed + unpaid)। net চলে গেলে/payment fail করলে **তথ্য হারায়** | storefront-এ **"Place order" চাপার মুহূর্তেই** order save (gateway-এ যাওয়ার আগে) → webhook status বদলাবে → timeout-এ abandoned |
| ~~**D3**~~ ✅ | ~~**Returns & Refunds নেই**~~ — **BUILT 23 Jul** (`RADIAN_RETURNS_MODULE_ARCHITECTURE.md`, DEC-RTN-005..015): staff-initiated, per-reason refund method, partial lines, restock via Inventory (SALE_RETURN), store credit, approval gate, refund ≤ collected। **migration + owner live-verify বাকি** (`radian_returns_migrate.bat`) | done (verify pending) |
| **D2** 🟠 | **Order-এ branch/warehouse নেই** — FBR মডেল ৮৪ branch ধরে, কোন branch পূরণ করছে বোঝা যায় না | `Order.branchId` FK + branch-ভিত্তিক report/stock (migration) |
| **D11** 🟠 | **add-on এখনো "charge", আসল line নয়** — দাম ঠিক যোগ হয়, কিন্তু কোন add-on কত বিক্রি হলো বিশ্লেষণ করা যায় না | `OrderLine.addOnId` optional FK (migration) + `productId` optional করা |
| **D12** 🟠 | **partial / split fulfilment নেই** — এক order-এ ফুল আজ, কেক কাল — এখন একটাই delivery | multi-shipment মডেল |
| **D5** 🟡 | **Settings screen নেই** — order-no format · auto-confirm rule · channel master CRUD · SLA/cut-off | Orders → Settings sub-page (locked: সব admin-configurable) |
| **D6** 🟡 | **invoice/receipt document নেই** — Print পুরো admin page ছাপে | print-only invoice template (gift হলে দাম লুকানোর option) |
| **D7** 🟡 | **notification automation নেই** — এখন শুধু manual WhatsApp/email link | Automation module: order event → template message |
| **D8** 🟡 | **order number random** (`RAD-xxxxx`), sequential নয় — invoice/audit-এর জন্য দুর্বল | DB sequence বা counter table |
| **D9** 🟡 | **timeline API newest-first**, UI গল্পের মতো উপর-নিচ দেখায়; `take` limit নেই | ascending sort + limit |
| **D10** 🟡 | **permission/role নেই** — যে কেউ confirm/cancel/refund পারে | Roles & Permissions module (locked: hardcode নয়, admin-configurable) |
| **D13** 🟡 | **VAT/NBR field নেই** | Tax module lock হলে |
| **D14** 🟢 | live screen এখনো `_data/orders.ts` **mock** থেকে type/meta নেয় | সব `_data/api.ts`-এ সরানো, mock ফাইল মুছে ফেলা |

---

## B. Courier / Delivery

| id | সমস্যা | কী করতে হবে |
|---|---|---|
| **P1** 🟡 | courier **manual** — consignment id হাতে লিখতে হয়, "Copy data entry" দিয়ে paste | Steadfast/Pathao/RedX API integration → এক ক্লিকে consignment তৈরি + auto tracking |
| ~~**P2**~~ ✅ | ~~courier list hardcoded~~ — **CourierService master BUILT 23 Jul** (progress §১৯), seed Steadfast·Pathao·RedX | done (verify pending) |
| ~~**P3**~~ ✅ | ~~method/zone/slot static~~ — **DeliveryMethod+Slot master BUILT 23 Jul** (§১৯); NewOrderForm live; storefront W1-এ | done (verify pending) |
| ~~**P4**~~ ✅ | ~~proof photo upload হয় না~~ — **/delivery/proof BUILT 23 Jul** (data-URL interim, DLV-R08); Cloudinary পরে storage বদলাবে | done (verify pending) |

---

## C. Storefront (`apps/web`)

| id | সমস্যা | কী করতে হবে |
|---|---|---|
| **W1** 🟠 | **web এখনো পুরনো mock-এ** (`_data/orders.ts`, `order.ts`, `auth.ts`) — admin/API নতুন model-এ, web মেলে না | web-কে `:4000` API-তে swap: order · customer (intl phone + recipient book) · checkout |
| **W2** 🟠 | checkout **payment success-এর পরে** order বানায় → D4-এর মূল কারণ | click-এই order তৈরি (D4-এর সাথে একসাথে) |
| **W3** 🟡 | storefront-এ coupon/offer এখনো static | Pricing & Offers API থেকে |

---

## D. Platform / tooling

| id | সমস্যা | কী করতে হবে |
|---|---|---|
| **T1** 🟡 | `package.json#prisma` **deprecated** — Prisma 7-এ কাজ করবে না (এখন শুধু warning) | `prisma.config.ts` বানানো |
| **T2** 🟡 | `.env` **দুই জায়গায়** — root + `apps/api/.env` (Prisma CLI-র জন্য বানানো) | ঠিক আছে, কিন্তু মনে রাখতে হবে: DB পাল্টালে **দুটোই** বদলাতে হবে |
| **T3** 🟠 | root-এ `.gitignore` **ছিল না** — এখন বানানো, কিন্তু **`.env` আগে থেকে git-এ committed থাকতে পারে** | `git rm --cached .env` করে history পরীক্ষা করা; secret ফাঁস হলে key rotate |
| **T4** 🟢 | `seed-orders.js` TS project-এ **JS** ফাইল | ঠিক আছে (ts-node ঝামেলা এড়াতে); চাইলে পরে TS |
| **T5** 🟡 | **কোনো test নেই** — business rule (refund cap · COD · stock) সব manual verify | orders.service-এর rule-গুলোর unit test |

---

## E. পরের module (এখনো শুরু হয়নি)

locked build order: Sales → **Pricing & Offers** → POS → Returns

- ~~**Pricing & Offers**~~ — **BUILT 23 Jul** (progress §১৮, DEC-OFR-001..009): Core-6 engine + quote API + Orders integration। migration bat + মালিক-যাচাই বাকি
- **POS** — দোকানে সরাসরি বিক্রি (আলাদা module, locked)। cash drawer + shift + negotiable price
- **Returns & Refunds** — D3
- **Inventory** — stock এখন Product-এ manual; আসল Inventory module পরে
- **Finance** — ledger; Sales/POS/Delivery-র completed event consume করবে। **NEXT (গোড়াপত্তন) — handoff ready: `RADIAN_FINANCE_KICKOFF.md`** (event-source map + লক-প্রশ্ন সহ; নতুন চ্যাটে হবে)

---

## যেভাবে ধরলে সবচেয়ে কম ব্যথা (সুপারিশ)

1. **D1** — report-এর সংখ্যা বিশ্বাসযোগ্য করা (এখন ভুল দেখাতে পারে)
2. **D4 + W2** একসাথে — checkout-এ click-এই order save (Recovery আসল হবে, তথ্য হারাবে না)
3. **W1** — storefront-কে API-তে আনা (এখন দুই দুনিয়া আলাদা)
4. **D3** — Returns module
5. **D2** — branch
6. তারপর বাকি 🟡/🟢 গুলো ঝাঁকে ঝাঁকে

---

## যা ইতিমধ্যে ঠিক করা হয়েছে (আবার করতে যেও না)

Sales-এর ৪টা critical + ৬টা major বাগ — ভুয়া refund · atomicity/double stock · COD ফাঁকি ·
টাকা বাকি রেখে completed · failed dead-end · negative stock · dead "What's inside" ·
blank channel · double payment। কোডে `REV-*` comment দিয়ে চিহ্নিত, বিস্তারিত
`RADIAN_SALES_REVIEW.md` §1-এ।

**বর্তমান অবস্থা:** API host typecheck **০ error**, admin Orders **০ error**।

---

## F. Cross-module follow-up — Purchase · Inventory · Assembly চক্র থেকে (23 Jul 2026)

_মালিকের নির্দেশ: module বানাতে গিয়ে অন্য module-এ যে বদল দরকার পড়েছে, সেগুলো এখন নয় —
**পরে একসাথে**। এই তালিকাই সেই খাতা। বিস্তারিত: প্রতিটা architecture doc-এর §8/§9।_

| id | কোথা থেকে | কী করতে হবে | কখন |
|---|---|---|---|
| **F1** 🔴 | Inventory DEC-INV-015 | **stage-3 flip**: deduction-এর একমাত্র লেখক Inventory হবে, `Product.stockQty` derived → পরে column drop। **যাচাই-শর্ত পূরণ 23 Jul** (Assembly full-cycle Claude-verified, progress §১৫) — flip এখন করা যায়; POS/Sales পাসে একসাথে | POS পাস |
| **F2** 🟠 | Assembly DEC-ASM-011 | composition এখন দুই ঘরে: `AssemblyTemplate` (produced goods) + `ItemComponent` (MAKE_TO_ORDER) — architecture project-এ এই বিভাজন master Decision Log-এ তুলতে হবে; MTS item-এর recipe-AUTO costing (DEC-ITM-008) এখন কার্যত অব্যবহৃত — রায় লাগবে | architecture sync |
| **F3** ✅ | Purchase DEC-PUR-003 | ~~Supplier module~~ — **হয়ে গেছে 23 Jul** (`RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md`, progress §১৬): FK + auto-link + link tool + credit ledger + apply flow | done |
| **F4** 🟠 | UOM ruling §5.3 | `OrderLine`-এ `unitId` + `factorSnapshot` (Purchase line-এর মতো) | Sales পরের পাস |
| **F5** ✅ | Returns (D3) | ~~`SALE_RETURN` reason reserved~~ — **consumed 23 Jul** by `InventoryService.postSaleReturn` (restock lines only, fail-soft) | done |
| **F6** 🟡 | Assembly deferred | dismantle/un-build · deadline+partial % · team master (Employee) · approval (Roles) · build-form wastage কলাম (stocktake-এ ভুলে-যাওয়া ধরা পড়লে) | নিজ নিজ trigger |
| **F7** 🟡 | Inventory §8 | per-branch AVCO + in-transit transfer (প্রথম branch) · low-stock WhatsApp (Automation D7) · Warehouse master-এর মালিকানা Warehouse module নেবে (টেবিল adopt, নতুন নয়) | branch/module trigger |
| **F8** 🟡 | Purchase §9 | `PayMethod` enum → Finance-owned master · Requisition/PO UI (প্রথম branch বা দ্বিতীয় ক্রেতা-সিদ্ধান্তগ্রহণকারী) | Finance/branch |
| **F9** 🟡 | সব module | DEC-ITM/PRD/CUS/SAL/PUR/INV/ASM provisional id গুলো architecture project-এর master Decision Log-এ registration | architecture sync |
| **F10** 🟢 | সব master data | soft-deleted restore (Trash) — Item/Brand/Unit/Template একসাথে এক প্যাটার্নে | এক পাসে |
| **F11** 🟠 | Supplier DEC-SUP-003/004 | **Fulfillment vendor order flow**: cake-জাতীয় item বিক্রিতে stock-skip নিয়ম (Sales/Inventory) · order এলে vendor-কে AUTO SMS/WhatsApp (Automation D7, gateway লাগবে; message-এ customer info কখনো নয় — SUP-R07) · order ↔ vendor sourcing link। Supplier master + `Item.supplierId` + manual send এখনই আছে | Sales flow পাস / Automation D7 |

---

## G. Deferred cross-module UPDATE গুলো (মালিকের নির্দেশ 23 Jul: Pricing & Offers + Delivery-র **পরে** একসাথে ধরা হবে)

_পরের module বানাতে গিয়ে আগের module-এ যে সিদ্ধান্ত নেওয়া হয়েছিল কিন্তু implement হয়নি — সেই খাতা।_

| id | কোথায় | কী করতে হবে |
|---|---|---|
| **G1** 🟠 | Product editor | **"এটা আমাদের নাকি supplier-এর" দেখানো** — Supplier module-এর পরের সিদ্ধান্ত। Item→`supplierId` (DEC-SUP-004) আছে; Product editor/list-এ vendor-sourced badge + supplier name দেখাতে হবে (Item link হয়ে) |
| **G2** 🟠 | Product editor | **SKU field UI-তে নেই** অথচ সিদ্ধান্ত আছে (DEC-ITM-021: `Product.sku` = ecommerce code, `Item.sku` = stockroom code)। Product form-এ SKU input + list-এ কলাম |
| **G3** 🟡 | Audit-এ ধরা (AUD-1 🔴) | Order edit-এ preparing-এর পরে line add করলে stock কাটে না, কিন্তু cancel-এ revert হয় → phantom stock। fix: add-এ deduct+mirror, না হলে addItems gate বন্ধ |
| **G4** 🟡 | Audit-এ ধরা (AUD-2) | POS sale online Orders list/KPI-তে মেশে — `GET /orders`-এ `fulfillmentType` filter + screen আলাদা |
| **G5** 🟡 | সব module | আরো যা যা মালিকের মনে পড়বে — এখানে যোগ হবে (এই তালিকা খোলা) |

---

**23 Jul নোট:** DB reset হয়েছে (drift; মালিক-অনুমোদিত) — A/D অংশের কিছু পুরনো ধরে-নেওয়া অচল হতে পারে।
API container: source baked + `nest start --watch` — **backend বদল = `docker compose up -d --build api`**।
নতুন কোডে খালি array-তে explicit type লিখো (`const rows: X[] = []`) — container TS নাহলে never[] ধরে।
