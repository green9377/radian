# PHASE 6 DIRECTION — Orders & Delivery (written 30 Aug 2026)

This file is written for the FIRST message of a new chat. It carries what the
next session must know so nobody rediscovers the project from zero.

Read in this order: `CLAUDE.md` (the standing brief) → **this file** →
`RADIAN_PENDING.md` (the live board) → `RADIAN_GLOBAL_RULES.md` (what is
shop-wide and must not be duplicated) → `RADIAN_DELIVERY_MODULE_ARCHITECTURE.md`
(this module's own design and DEC rules).

---

## 1. How we work (the owner's standing orders — unchanged)

1. **One page or feature at a time.** Nothing new starts until the owner has
   seen the last thing and said so.
2. **Never invent a business rule.** Ask. Guessing is the most expensive
   mistake on this project.
3. **Say when there is a better way** — with the reason. Agreement alone is
   not help.
4. **Verify before reporting.** The owner sees work ONCE, finished. Half-checked
   instructions have cost more time than anything else.
5. **English only in files** — code, strings, comments, commit messages, and
   these `.md` files. Bangla belongs in the chat. When touching a file that
   still carries old Bangla comments, translate them in the same edit.
6. **Design:** premium, emotional, clean, minimal, trustworthy. Whitespace,
   large photos, soft shadows, rounded corners, big bold CTAs. Brand purple /
   pink / lavender / white, rose-gold accent. No page prose — explanations
   behind the small ⓘ (`Info`). One `MoneyBlock`, one `QtyStepper`, house
   count-cards everywhere.
7. **The system is not a demo** (owner, 30 Aug). Real orders and real
   accounts live here; only the GATEWAY KEY is sandbox. Going live must only
   ever mean flipping that key.

## 2. Ship path (every single time)

```
code → tsc --noEmit (api + admin + web) → no-bangla selftest → commit → push main
     → VPS console: git pull + docker compose up -d --build
     → open the live link and LOOK
```

- web    https://development.radianbd.com
- admin  https://admin.development.radianbd.com
- api    https://api.development.radianbd.com
- media  https://media.development.radianbd.com

**Everything is on the Hostinger VPS and the VPS does NOT deploy itself.**
`git push` only reaches GitHub. See CLAUDE.md §2 for the console commands.
Vercel, Render and Neon are history — their addresses answer nothing, so do
not go looking there and conclude the system is broken.

- Commit author stays `green9377 <amiparboinshaallah@gmail.com>`. Never
  override with `-c user.email`.
- Guards before pushing: `node apps/api/scripts/no-bangla.selftest.mjs`;
  `apps/api/src/administration/registry.drift.mjs` after any sidebar change.
- The owner logs into the admin himself — never ask for credentials.

## 3. Not now: the real domain, and the old shop

Asked and answered on 30 Aug, so nobody spends a week on it by mistake.

`radianbd.com` today runs the owner's **existing, trading shop** — a different
system (getCommerce 3.0.0), with its own admin at `app-area.radianbd.com`, a
live cart, Google Tag Manager, and **395 URLs in Google's index** (201
`/product/<slug>`, 167 `/category/<slug>`, 9 blog posts). None of those URL
shapes exist on the new system, which serves flat `/[slug]`.

**The owner's ruling:** *"tmi ki akhonei real domain a add krbe? ata kintu
akhon dorkar nai"* · *"old system a apatot kichu dorkar nai, age amder system
development krte hbe. pore old system ar data kivabe amra akhane anbo ta dekha
jabe"* · *"live ar ktha vule jaw."*

So: **build the system first.** The old shop is left alone and keeps trading.
The cutover, the redirect map and any data migration are a later conversation,
not this phase. The numbers above are recorded here only so that whoever opens
that conversation starts with the size of it already measured.

## 4. What Phase 5 closed with (do not redo)

**Checkout & Payment, CLOSED 30 Aug.** The money circle and the fulfilment
circle both walked end to end on the VPS, and the walking is what found the
faults — no type-check or code reading would have.

- **DEC-FIN-029** — the gateway fee is booked per payment from the gateway's
  own `store_amount`, never from a rate in code. Proven live: customer paid
  ৳5,039.28, SSLCommerz kept ৳125.98 (exactly 2.5%), ৳4,913.30 landed in the
  Gateway money account.
- **DEC-FIN-030** — Gateway settlement screen (Gateway → BRAC Bank), with an
  editable payout threshold and the expected rate as a watchdog.
- **DEC-FIN-031** — an online refund goes back manually OR down SSLCommerz,
  the shop choosing per case. **Walked live 30 Aug (RTN-000017):** the gateway
  accepted it (`refund_ref_id` 6a93c8d4e0768) and its own status query then
  said `processing`, which was written back over the acceptance `success`.
  *Sent* and *arrived* stayed two different things.
- **DEC-SAL-014** — a website order is paid in full or it is COD.
- **DEC-PRD-060** — prepaid-only notice on the product page.
- Admin **Online payments** view over `PaymentSession`; order edit money UI on
  `MoneyBlock`; checkout swept to house rules 16/17.

**Four faults found by walking, all fixed:** `PUBLIC_API_URL` pointing at a
host that did not exist (money taken, nothing recorded) · CORS turning a paid
order into a 500 · the success page showing a stranger's receipt · "COD due"
printed on orders that were never COD.

⚠️ **Test rows left from Phase 5:** the *Anniversary GIFT* product was given
`stockQty: 5` to unblock a return test, and **RAD-86328 now reads delivered ·
completed · refunded**. Offer OFR-000027 (10% Fresh flower) may still be
running from Phase 4 — pause it before comparing prices.

## 5. What ALREADY EXISTS in Orders & Delivery (read before touching)

**Far more is built than "let's test it" suggests. Code is truth.**

**Delivery API** (`apps/api/src/delivery/*`, ~1,900 lines) — riders, couriers,
areas, delivery types, methods and their slots, blackouts, settings, slot
templates; the **board** and **performance** analytics; per-parcel cash
`unsettled` / `settle`; and the assignment lifecycle: create, bulk create,
`out`, `delivered`, `fail`, `cancel`.

**Orders API** (`apps/api/src/orders/*`, ~2,300 lines) — list, timeline,
create, edit, the status ladder (`confirm` → `prepare` → `out-for-delivery` →
`delivered`, plus `fail` and `cancel`), payments, courier hand-off, photos,
cancel-rules, online payments.

**Admin screens** — 13 delivery pages (`board`, `tracking`, `proof`, `failed`,
`riders`, `couriers`, `zones`, `settle`, `settings`, `setup`, `analytics`,
`performance`) and 14 order pages (`list`, `[id]`, `[id]/edit`, `new`,
`action`, `scheduled`, `cancelled`, `returns`, `payments`, `online-payments`,
`recovery`, `channels`, `reports`).

**Rules already locked** — DEC-MOD-003 (stock leaves at *preparing*, not at
order time and not at delivery) · DEC-FIN-002/003 (revenue + COGS post at
*delivered*) · DEC-DLV-011 zone × cart sieve · DEC-DLV-012 the board is paged
and says what it is not showing · DEC-DLV-013 list view + bulk assign ·
DEC-DLV-014 couriers are added in Administration · DEC-DLV-015 `isActive` must
never be used to find a finished delivery · DEC-DLV-016/017 delivery cost is
written and COD is reconciled per parcel · DEC-DLV-018 masters made once,
Setup only connects · DEC-DLV-019 blackouts · DEC-INT-003 promised-by
resolution · REV-C5 delivering an unpaid online order is refused.

## 6. Phase 6 scope — what actually remains

Same pattern as Phases 3–5: **the owner walks the module hands-on**, and the
gaps below get closed. Every item here was verified in the code on 30 Aug, not
copied from an older document.

### ✅ Five faults the owner found by walking the shop — all closed 30 Aug

He opened the site himself and reported four things in one message; a fifth
came out of checking them. Every one was real, none was in the module the
symptom pointed at, and every fix below was walked live before it was reported.

| # | what he saw | what it actually was |
|---|---|---|
| **B** · DEC-SAL-015 | a plain COD order was refused | `assertCodAllowed` refused COD on any `CRAFTED` line. Radian ASSEMBLES what it sells, so **22 of 24 live products are CRAFTED** — cash was closed on practically the whole shop while the cart badge went on promising it. The browser's own `paymentOptions()` never had that test, so the site OFFERED cash and the server then refused the order. Owner's rule, in his words: a gift is paid in full · a self order may be cash or online · a product marked "payment required" needs payment either way. The CRAFTED test is gone from all three places (create, the edit re-check, the admin's new-order form) and the regression suite, which had been asserting the opposite |
| **A** · DEC-SAL-016 | admin advances the order, the customer's steps never move | `buildOrder()` writes a snapshot to localStorage — `status: "placed"` — and every account page rendered THAT. The browser was remembering an order, not following one; `/track` was the only screen that ever called the server. `useLiveOrder` now corrects the snapshot over the same `orderNo + phone` route. Five new `Order` columns carry the real step times: `promisedBy`'s own comment already said on-time is `deliveredAt <= promisedBy` against a column that did not exist, and DEC-DLV-023 needs the same fact |
| **D** · DEC-PRD-061 | the customer's uploaded photo never reaches the order | the schema had already admitted it — *"only the middle was never built"*. "Tap to upload" wrote `file.name` into the cart; no file left the device, checkout had no field, `OrderLine` had no column. **And a product with "photo required" took orders anyway**, because `persoImageRequired` was read and never tested. Public upload route (10 MB, not the review route's 3 — the photo is printed on the goods), uploaded from the PDP so checkout carries only a URL, and that URL is trusted only if it is on this shop's own media host |
| **E** · DEC-PRD-014 | a variant order shows the main product | `variantId`/`variantLabel` have been on `OrderLine` since 3 August and the API returns them — the admin's own type never declared them, the adapter never mapped them, no screen drew them. Stock came off the pink shelf while the page never said pink |
| **C** | the cart shows the product's photo, not the variant's | **not a code fault.** Cart, checkout and the order snapshot all read `variant.imageUrl ?? product image`, and the API falls back to the master value's photo. Every combination on the test product has `imageUrl: null` — no photo has ever been set. Admin → the product → Variants, one photo per combination |

⚠️ Test rows left on the system: RAD-92283 · RAD-51013 · RAD-75470 (now *preparing*, stock −1),
all named "TEST · do not deliver", and assignment DLV-000001 on RAD-74146.

⚠️ **The hPanel "Web console" button moves.** Clicking fixed coordinates silently
misses it and looks exactly like a session limit — an hour went into that. Find
the button in the DOM and click it there.

### ✅ 6.1 — CLOSED 30 Aug 2026. One path to a carrier.

The owner's ruling: *"order screen a jen ak click a courier assign kra jay"* —
keep the one-click hand-off on the order screen, but it must not bypass
Delivery. So the button stayed and the route underneath it changed.

- `POST /orders/:id/courier`, `AssignCourierDto` and
  `OrdersService.assignCourier()` are **gone**. The only way to hand a parcel
  to a carrier is `POST /delivery/assignments`, which mirrors the legacy Order
  courier fields itself (DEC-DLV-006).
- The order screen's Carrier hand-off panel now creates a real
  `DeliveryAssignment`: a bold Own rider / Courier switch (rule 16), riders and
  couriers read from the masters (DEC-DLV-014) instead of the hardcoded
  `COURIERS` array, consignment id, tracking from the courier's own template,
  supersede on re-assign (DLV-R01). Loose prose moved behind the panel hint
  (rule 17).
- `DeliveryViews.tsx` deleted — an orphan no page imported, holding the last
  caller of the dead route and two `alert()` calls. The copy-data-entry button
  lost its two `alert()` calls as well.

**Walked live, not assumed.** RAD-74146 assigned to Steadfast from the order
screen produced `DLV-000001 · COURIER · ASSIGNED · PH6-TEST-001`, and the same
row carries `Order.courierName = Steadfast` — assignment and mirror both, which
is exactly what the old path never did. (The board does not show it because
RAD-74146 is still *placed*; the board is confirmed-orders-only, by design.)

⚠️ Test row left behind: DLV-000001 on RAD-74146 is that walk.

### ~~🔴 6.1 (original finding)~~ — Two different ways to assign a carrier, and one of them is invisible

`POST /orders/:id/courier` → `assignCourier()` writes `courierName`,
`courierConsignment`, `courierTrackingUrl`, `courierAssignedAt` **straight onto
the Order and creates no `DeliveryAssignment`.** The button is live in two
places: `OrderEditor.tsx:635` and `DeliveryViews.tsx:122`.

An order assigned that way **never reaches the delivery board, never counts in
delivery analytics or performance, never posts the delivery cost
(`Dr 5200 / Cr 2300`), and never enters per-parcel COD reconciliation.** The
method's own comment says *"Delivery executes the parcel"* — but nothing tells
Delivery.

This is a **house rule 4 violation** (One Data One Owner): two places write the
fact of who is carrying a parcel. Recommendation: `/delivery/assignments`
becomes the only path and `/orders/:id/courier` is removed. **Ask first** — it
is a live button the owner may be using.

### ✅ 6.2 — CLOSED 30 Aug 2026. REV-C4, the last open critical from 17 July.

`GET /orders/report` counts in Postgres — six grouped queries, no order rows
crossing the wire, the same answer at 40 orders as at 40,000. It takes
`from`/`to` for the day-by-day work that comes later; a blank or unparseable
date is ignored rather than refused, and whatever was applied comes back in
`range` so the screen can say what it counted.

Revenue stays delivered-only (DEC-FIN-002 posts revenue at *delivered* — any
other choice here disagrees with Finance's own books) and counter sales stay
out, like every other online Sales screen (AUD-2). The headline cards now say
how many orders are behind each number, so a reader can see what the average is
an average of.

**Checked against the database, not against the screen** (30 Aug, 65 orders):
`orders=65 · delivered=5 · revenue=2440056 · cancelled=29` in psql; the page
reads 65 · ৳24,400.56 · 5 delivered · 45% · AOV ৳4,880.11, and every split adds
back to 65 (46+19 zone, 57+8 payment, 60+5 self/gift).

### ~~🔴 6.2 (original finding)~~ — Orders → Reports does its arithmetic on the first 100 orders

`listOrders()` hardcodes `pageSize: "100"` (`_data/api.ts:1410`), and
`OrdersReports` (`OrderViews.tsx:535`) computes **revenue, AOV, cancel rate,
and the channel / zone / payment / gift splits from that array**. Past 100
orders every number on that screen is quietly wrong, and it will look perfectly
right here, because there are fewer than a hundred orders.

This is REV-C4 from the 17 July Sales review — the one critical it left open,
because it needs a real server-side aggregate endpoint. It is the same family
as the faults Phase 5 found: **the screen lying about a rule that is itself
correct.**

### ✅ 6.3 — CLOSED 31 Aug 2026. The rider cash chain, walked for the first time.

**And walking it is the only reason the fault was found.** The code read
correctly; it had simply never run.

`unsettled()` and `settle()` both asked `order.duePaisa` — and
`orders.delivered()` zeroes that the moment the parcel is handed over, because
taking the cash IS the delivery (REV-C5). So every COD parcel reached the settle
screen showing **prepaid**, `codHandedOver` could never become true,
`remitWithLines` was never reached (gross was always 0), and once its cost was
typed the parcel left the list anyway — **taking the rider's cash off the board
while it still sat in 1110**. Money the shop is owed, invisible, for ever.

Both now read the COD_COLLECTED payment written at delivery: the cash that
physically went into someone's hand. Refunds are deliberately not netted off — a
refund leaves the shop's own account and takes nothing out of the rider's pocket.

**The whole circle, on RAD-75470 (COD ৳2,670, rider Deshi, cost ৳150):**

| account | before | after delivery | after settle |
|---|---|---|---|
| 1110 Cash with Rider / Courier | 0 | **267000** | **0** |
| 2300 Accrued | 0 | 0 | **0** (raised at cost, cleared by the remittance) |
| 5200 Delivery Cost | 0 | 0 | **15000** — expensed once |
| 1000 Cash Drawer | 45649 | 45649 | **297649** (+252000 = gross − charge) |

`RMT-000001` created; the parcel left the unsettled list. The rule that matters
held: **the remittance debits 2300, never 5200** — the charge is expensed on the
parcel and the remittance only clears the accrual. Getting that wrong would have
doubled every delivery cost in the accounts, silently.

⚠️ Still not walked: a PREPAID parcel on the same list (test 20). The filter
keeps it by `costRecordedAt === null` and the code reads right, but reading is
what made this whole section look finished for a month.

### ~~🟠 6.3 (original finding)~~ — The rider cash chain has never been exercised

`cost → Dr 5200 / Cr 2300 accrued → remittance clears the accrual (Dr 2300,
not Dr 5200)`. The screen, its dropdowns and its empty state are confirmed
live, but there has never been a delivered assignment to settle, so the chain
itself is unproven. **One delivered parcel proves it** — exactly how the
gateway refund was proven in Phase 5.

⚠️ `remitWithLines()` must never be merged into `remit()` behind a flag. The
difference is an accounting fact about whether the expense is already posted,
and getting it wrong is silent.

### ✅ DEC-DLV-022 + 6.4 — CLOSED 31 Aug 2026. Why it failed, and a board that no longer freezes.

**The reason is picked, not typed.** One action for a failed delivery and a
reschedule (the owner, 30 Aug: the parcel did not arrive either way, and asking
a rider at the door to decide which is asking for a guess) — no automatic
follow-up, he ruled that out the same day.

No new table: `ReasonMaster` already exists, scoped by `purpose`, with
Inventory's WASTAGE and GIFT in it. Delivery takes `DELIVERY_FAIL` and serves
its own endpoints — the table is shared, the purpose is owned, and one module
never reads another's (house rule 4). Five reasons seeded in the owner's own
words, editable like any master.

`failReason` keeps its column and becomes the **label snapshot plus the note**,
so renaming a reason never rewrites what an old parcel said — the same
discipline as `variantLabel` on an order line. `failReasonId` is what the
reports will group by.

**And the board's `alert()`s are gone (6.4).** A browser alert blocks the
renderer: the screen freezes with no visible reason, and the symptom looks
nothing like the cause. That mismatch cost most of an afternoon on 29 Aug in
`OrderEditor`, and the same trap was still sitting on the board. The `prompt()`
that asked for the fail reason blocked everything and threw the answer away on
Escape. `confirm()` on **Remove rider** stays — it asks a question.

**Walked live 31 Aug:**
- Fail on RAD-76123 (no carrier) → the board **said so on the page** —
  *"RAD-76123 has no carrier yet — pick a rider or courier first"* — nothing
  froze
- Fail on RAD-52077 (rider Deshi, DLV-000006) → the box opened with all five
  reasons; picked *Address wrong or not found*, note *"gate locked, guard sent
  us away"*
- Stored: `failReasonId: rsn_dlv_bad_addr` · `failReason: "Address wrong or not
  found — gate locked, guard sent us away"` · order `failed` · board
  "Failed — retry 1"

⚠️ **53 `alert()` calls remain elsewhere in the admin** — `ProductViews` (7),
`OffersLive` (5), `ProductListView` (4), `OrderEditor` (4), `FinanceForms` (3)
and others. They ride their own phases; the pattern to copy is on this board.

### ~~🟠 6.4 (original finding)~~ — The freezing `alert()` is still on the delivery board

`DeliveryLive.tsx` carries **10** `alert()` / `prompt()` calls (line 369 is
`alert("assign a rider/courier first")`; line 370 is a `prompt()` for the
failure reason). This is the exact bug that cost most of an afternoon on
29 Aug: a browser `alert()` blocks the renderer, so a refused action looks like
a dead page rather than a rule doing its job. It was fixed in `OrderEditor`
and never swept.

**58 across the whole admin**, worst offenders `DeliveryLive.tsx` (10),
`ProductViews.tsx` (7), `OrderEditor.tsx` (6), `OffersLive.tsx` (5).
Phase 6 clears the Orders/Delivery ones; the rest ride their own phases.

⚠️ `confirm()` on **Cancel order** stays. That one asks a question, and
blocking is the point.

### ✅ 6.5 — mostly walked, 31 Aug 2026

| walked | result |
|---|---|
| **retry after a failure** (REV-M1) | RAD-52077 failed with Deshi → re-assigned to Rahman (DLV-000007) → out → delivered. `failed → out_for_delivery` holds |
| **bulk assign with a cancelled order mixed in** (DEC-DLV-013) | 3 assigned (DLV-000008/9/10), 1 refused by name — *"cannot assign a cancelled order"*. The other three were not thrown away, which is the whole reason bulk is not a transaction |
| **a prepaid parcel on the settle list** (test 20) | RAD-52077, paid online in full: on the list with `cod = 0`, settling created **no remittance**, 5200 took the cost, 2300 recorded what the shop now owes the rider, 1110 and the drawer untouched |
| **the settle screen, end to end** | RAD-86607 COD ৳1,365, cost ৳100 → *"1 parcel(s) settled — ৳ 1,265 banked, RMT-000002"* |

**The ledger after three settlements, every figure checked:**
`1110 = 0` (no rider is holding shop money) · `2300 = 12000` (only Rahman's
prepaid-parcel fee still owed) · `5200 = 37000` (15000 + 12000 + 10000) ·
`Cash Drawer 297649 → 424149` (+126500 = 1365 − 100).

⚠️ **The prepaid walk found one:** the reply carried `netPaisa: −12000` and the
screen printed *"−৳120 in"* — which reads as the rider owing the shop when the
truth is the reverse. `netPaisa` is null when no receipt was issued, and the
sentence now says what happened.

**Blackout, a full slot and the promise — walked 31 Aug, all three hold:**

| | |
|---|---|
| **a full slot** (owner's rule) | Morning capacity dropped to 1, one order taken, the second refused — *"That time slot just filled up — please pick the next available slot."* |
| **a blackout** (DEC-DLV-019) | one placed on 11 Sep → *"Delivery is paused on 2026-09-11 (Shop closed — walk test) — please pick another date."* |
| **the promise** (DEC-INT-003) | RAD-57835, slot *"Morning · 9:00 AM – 3:00 PM"* on 9 Sep → `promisedBy = 2026-09-09T09:00:00Z`. That is 3:00 PM in Dhaka: the **end** of the window, with the +6 offset applied. Taking the start would have reported most of a good day as late, and dropping the offset would have flattered every late delivery by six hours |

⚠️ **Both changes were put back**: Morning capacity to 10, the blackout
deleted, and both verified — a test that leaves a trap on the system is worse
than no test. Test rows left behind: RAD-57835 (9 Sep, Morning).

### ~~🟢 6.5 (original list)~~ — Walk the fulfilment circle properly, the parts Phase 5 did not

Phase 5 walked one happy order to `delivered`. Phase 6 walks the rest:
**assign a rider from the board · out · delivered · settle his cash** ·
**fail a delivery and retry it** (REV-M1: `failed → out_for_delivery`) ·
**a courier parcel with a consignment id** · **bulk assign** · **a blackout
date and a full slot** · **the 2-hour, same-day and midnight promises against
real slot cut-offs** (DEC-DLV-018, DEC-INT-003).

### 6.6 — Sweep, in the same edits

House rules 16/17 (bold clear buttons, no loose prose — explanations behind
the ⓘ), house count-cards on the Orders and Delivery master screens, and
**translate the Bangla comments in every file touched** (rule 9).

### ✅ DEC-DLV-021 — CLOSED 31 Aug 2026. A carrier can be swapped on the road.

Two things were in the way, and the second was another door nobody had told.

`SWAPPED` is now a status of its own. The superseded assignment used to be
written CANCELLED, which folds "this never left" together with "this left and
somebody else finished it" — so the shop could never see how often a parcel
changes hands mid-journey, the one number that says whether the fleet is
breaking down. The order timeline says it in words too.

And the swap dead-ended: `outForDelivery()` refused an order already out for
delivery, so Delivery would accept the new rider and then not let him leave.
The only way through was to fail the delivery first — the very thing the owner
said must not happen.

**Then the walk found the real one.** The order screen's *Out for delivery*
called `orders.out-for-delivery` directly: the ORDER moved and the ASSIGNMENT
did not. DLV-000002 sat at `ASSIGNED` while the order read *out for delivery* —
the board showed a parcel nobody had taken out, analytics never saw it leave,
and the swap was filed as CANCELLED because the assignment never said it was on
the road. Out and Mark delivered now go through `assignmentAction` whenever a
carrier is carrying the parcel, and the server asks the ORDER as well as the
assignment whether it was out.

**Walked live 31 Aug on RAD-75470:**
`DLV-000004 → SWAPPED` · `DLV-000005 ASSIGNED (Deshi)` · timeline reads
*"Carrier swapped on the road — now rider Deshi (DLV-000005), was DLV-000004"* ·
and the new carrier then left successfully (`OUT_FOR_DELIVERY`), which is the
dead end this fix removed. The "on its way" message is not re-sent on a swap.

⚠️ **A deploy that never ran looked exactly like a bug.** The first walk showed
CANCELLED and the code read correctly; the VPS was still on `b326f3c` because
the console command had gone to a window that was not listening. Check
`git log --oneline -1` on the VPS before concluding anything about behaviour.

## 7. The owner's answers — ANSWERED 30 Aug 2026

All four were put to the owner before a line was written (rule 2). These are
now the rules Phase 6 builds to.

1. **Changing carrier mid-flight — DEC-DLV-021.** A direct carrier swap will
   exist out of `out_for_delivery`, and **it does not count as a failure**. The
   owner's reasoning is the right one: a rider's bike breaking is not the
   rider's failure, and a failure rate that counts it stops meaning anything.
   *(not built yet — the next item in this phase)*
2. **The order-screen courier button stays, but goes through Delivery** —
   *"order screen a jen ak click a courier assign kra jay"*. **Done, §6.1.**
3. **Failed and reschedule stay ONE action, with the reason recorded** —
   DEC-DLV-022. The reason comes from a list rather than free text, so the
   reports can split it later. One button, because the parcel did not arrive
   either way. *(not built yet)*
4. **A missed promise is flagged AND collected into a follow-up list** —
   DEC-DLV-023. The system marks the order and gathers the misses; the call,
   the note or the compensation stays a person's decision. *(not built yet)*

## 8. Traps this module has already sprung

| trap | what happens |
|---|---|
| `alert()` in an action handler | the admin looks frozen; the rule was right all along (29 Aug, most of an afternoon) |
| a screen computing from a paged list | right under 100 rows, wrong past it, healthy-looking for ever here (§6.2) |
| `isActive` used to find a finished delivery | DEC-DLV-015 — it will not find it |
| a soft-deleted row keeps its number | number generators read the raw client and retry on P2002 |
| routes under a `:id` route | put static routes ABOVE `:id` or `/orders/cancel-rules` is read as an order id |

---

_Phase 5 closed 30 Aug 2026. Phase 6 opens on the owner's word._
