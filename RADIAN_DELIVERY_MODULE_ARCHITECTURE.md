# Radian — Delivery Management Module Architecture (locked 23 Jul 2026)

> Owner locked v1 scope in the delivery kickoff (23 Jul, four rulings below).
> Companion: `RADIAN_ADMIN_PROGRESS.md` §4 (two status tracks, DEC-MOD-003),
> `RADIAN_PENDING.md` §B (P1–P4), `RADIAN_OFFERS_MODULE_ARCHITECTURE.md` (doc mould).
> Build order continues: Pricing & Offers ✅ → **Delivery** → §G backlog.

---

## 1. Purpose

Delivery executes what Sales promised: who takes the parcel (own rider in Dhaka,
third-party courier nationwide), when (method × slot), and proves it happened
(photos). `Order.deliveryStatus` was ALWAYS Delivery-owned (DEC-SAL-003) — this
module finally gives that owner a home: masters, a fulfilment board, and an
assignment trail, without moving the money or the sales status.

## 2. Module responsibilities

**Owns / does:**
- `DeliveryMethod` + `DeliverySlot` masters — zone × method × fee × cut-off ×
  slot capacity, admin-configurable (P3: never hardcoded).
- `Rider` master (own delivery staff) and `CourierService` master (P2: replaces
  the hardcoded COURIERS array).
- `DeliveryAssignment` — who is carrying this order right now + full retry history.
- Driving `Order.deliveryStatus` transitions (via OrdersService — the rules for
  stock/COD/LTV stay in ONE place; Delivery never re-implements them).
- Proof photos (P4) — upload lands on the existing Delivery-owned OrderPhoto.

**Does NOT own / do:**
- Order/money/sales status → Sales. Cancel/refund → Sales/Returns.
- Stock — the DEC-MOD-003 deduction fires inside the order `prepare` transition;
  Delivery only triggers transitions, never writes stock (INV-RULE-001).
- Courier API integration (P1 Steadfast/Pathao/RedX) — later; consignment is
  typed manually today, the assignment stores it.
- Rider payroll/attendance → Employee/HR (not locked).

## 3. Owner rulings (kickoff 23 Jul)

| id | Ruling |
|---|---|
| **DEC-DLV-001** | **v1 = Core 4 + proof photo**: fulfilment board · Rider master · Courier master · Zone×Method×Slot master · real photo upload (data-URL interim, Item.imageUrl pattern). Tracking page, performance and analytics screens stay demo until a later pass. |
| **DEC-DLV-002** | **Method = FK + snapshot.** `Order.deliveryMethodId`/`deliverySlotId` FKs join the existing `methodLabel`/`slotLabel`/`deliveryPaisa` snapshots (old orders untouched, receipts frozen). New Order form (and later the storefront) reads the master. |
| **DEC-DLV-003** | **Assignment entity.** One ACTIVE `DeliveryAssignment` per order (service-enforced); RIDER or COURIER kind; a failed delivery retries as a NEW assignment — the old row is history. Board and per-rider counts read from here. |
| **DEC-DLV-004** | **Own Rider master now.** Employee module later ADOPTS it (Warehouse/DEC-INV-014 adopt pattern) — never a second rider table. |
| **DEC-DLV-005** | Sequential `DLV-` assignment numbers (D8 lesson, RTN- self-healing parser). |
| **DEC-DLV-006** | Status transitions go THROUGH OrdersService (out-for-delivery / delivered / fail). Delivery depends on Orders — one-way, no cycle; COD-collect + LTV mirror stay single-sourced. Courier assignment also stamps the legacy `Order.courierName/consignment/trackingUrl` fields so existing screens keep working. |
| **DEC-DLV-011** | **(5 Aug 2026) Cart-aware delivery menu — order never splits.** মালিক: *"prthome zone check kre dkhbe ki ki method ache and se method theke cart je product ache se product kon kon gula select ache just segulai dekhabe… multi product thake cart… win hobe se method je method win hole sobgula product delivery possible. order kon vag hobe na."* Menu = zone methods ∩ (types ticked on EVERY cart product). Baseline (tick-free, always offered): `PICK_DATE_SLOT` (Schedule It — matches the product form's "nothing picked → scheduled day only" promise) and `LEAD_DAYS` (courier — `Product.zone=NATIONWIDE` is itself the courier-safe declaration). Speed promises (2-Hour/Same Day/Midnight) never appear untick­ed. Enforced twice: `/shop/delivery-options?items=` (screen) AND checkout quote/place (server guard) — both read `common/delivery-rule.ts`. Companion admin fix (rev, owner's correction): zone is a TICK-LIST, not a toggle — *"inside dhaka ja thake thakbe. national ja thakar thakbe… kon product jodi 2 tai kaj kre tahole 2 tai select krbe."* Inside Dhaka is always ticked and locked (Bangladesh includes Dhaka — there is no "outside only" state); ticking Outside Dhaka = NATIONWIDE in the DB and opens the courier group under its own heading. Each ticked zone shows its own delivery group; unticking Outside drops only courier picks, Dhaka speeds survive. |

## 4. Entities

- **DeliveryMethod** — label ("2-Hour Express"), zone (DHAKA/BANGLADESH), kind
  (RIDER/COURIER), feePaisa, cutoff ("20:00"), etaLabel, active, sort. Seeded from
  the storefront's current static config.
- **DeliverySlot** — method-owned: label ("10:00–13:00"), capacityPerDay (null =
  unlimited; capacity WARNS, never blocks — DEC-INV-011 spirit), active, sort.
- **Rider** — name, phone, vehicle, photo, active.
- **CourierService** — name, trackingUrlTemplate (`{cn}` placeholder), phone, active.
  Seeded: Steadfast · Pathao · RedX (the old hardcoded three).
- **DeliveryAssignment** — assignmentNo, orderId, kind, riderId/courierId,
  consignmentNo, trackingUrl, status (ASSIGNED→OUT→DELIVERED / FAILED / CANCELLED),
  timestamps, failReason, isActive.

## 5. Business rules (DLV-R*)

| id | Rule |
|---|---|
| DLV-R01 | One active assignment per order; assigning again auto-cancels the previous active one (audited). |
| DLV-R02 | RIDER assignment needs riderId; COURIER needs courierId (consignment optional at assign, required before OUT for couriers — warn only). |
| DLV-R03 | Assignment `out` / `delivered` / `fail` call the OrdersService transitions; whatever those enforce (payment-before-close, COD collect, LTV) applies unchanged. |
| DLV-R04 | Fail keeps the assignment FAILED with a reason; retry = new assignment on the same order (order goes preparing→out again per REV-M1). |
| DLV-R05 | Slot capacity: count that day's orders on the slot; at/over capacity = WARN in the form, never block (owner may overbook a rush day). |
| DLV-R06 | Method delete/deactivate never touches existing orders (snapshot rule DEC-DLV-002). |
| DLV-R07 | COUNTER (POS) orders never appear on the board. |
| DLV-R08 | Photo upload = existing `POST /orders/:id/photos` (OrderPhoto, Delivery-owned per DEC-SAL-007); data-URL downscaled client-side; Cloudinary later swaps storage, not the model. |

## 6. API (static above `:id`)

`/delivery/board` (orders by deliveryStatus + active assignment) ·
`/delivery/config` (methods+slots by zone — order form / storefront read) ·
`/delivery/methods` CRUD + `/delivery/methods/:id/slots` ·
`/delivery/riders` CRUD (+ per-rider today counts) ·
`/delivery/couriers` CRUD ·
`/delivery/assignments` POST · `/delivery/assignments/:id/(out|delivered|fail|cancel)` ·
`/delivery/orders/:orderId/assignments` (history)।

## 7. Admin (v1 live; others stay demo)

`/delivery` = fulfilment board (pipeline columns, assign rider/courier inline,
photo count, retry) · `/delivery/riders` · `/delivery/couriers` ·
`/delivery/zones` = method & slot master editor · `/delivery/proof` = photo
upload/gallery per order। Demo-fallback + orange badge everywhere (project rule)।
New Order form: methods from `/delivery/config` (static fallback kept).

## 8. Non-goals v1 (trigger named)

Courier APIs (P1 — gateway keys) · multi-shipment (D12) · rider app/GPS tracking
(later product) · performance/analytics screens (data first) · delivery-fee
auto-calc by weight (needs Item.weightGram coverage) · Employee adoption
(Employee module) · capacity hard-block (owner said warn)।

## 9. Files

Schema: Delivery block in `schema.prisma`। API: `apps/api/src/delivery/*`।
Admin: `DeliveryLive.tsx` + route swaps। Migration: `radian_delivery_migrate.bat`।

---

## 10. 12 August 2026 — scale, honesty, and one place for couriers

Four decisions, all from one review session with the owner.

### DEC-DLV-012 — the board is paged, and says how much it is not showing

`board()` fetched `take: 300` and nothing on the screen mentioned it. At the
owner's own target (84 branches, 64 districts) parcel 301 onwards was fetched by
nobody and displayed nowhere. The reply is now `{ rows, total, page, limit,
counts }` and every view prints the total.

`counts` is deliberately computed over the **whole** queue, never the filtered
page — otherwise typing a name in the search box would make 412 waiting parcels
read as 3.

**Order: `promisedBy` ascending, nulls last.** Not order number, not placedAt.
For a two-hour-delivery shop "which one first" is the only question the screen
exists to answer. Orders taken before `promisedBy` existed sort last: an unknown
deadline must never push a real one down the page.

### DEC-DLV-013 — a list view beside the board, and bulk assign

Cards in four columns answer *what is going on*. They cannot answer *get these
forty out*. The list is one row per parcel, late ones red at the top, with a
tick box; `POST /delivery/assignments/bulk` sends the selection to one carrier.

Three constraints, each learned the hard way rather than guessed:

- **Not a transaction.** One cancelled order among forty must not discard the
  other thirty-nine. Each parcel is assigned separately and failures come back
  named, so the screen can say *which* three did not go and why. All-or-nothing
  would make the busiest hour the hour nothing can be assigned.
- **No consignment number on the bulk dialog.** One number pasted across forty
  parcels is forty wrong tracking links sent to forty customers.
- **No tick box on parcels already out for delivery.** Re-routing one that has
  left the shop needs someone to say what happened to it; a bulk action is the
  wrong place for that conversation.

### DEC-DLV-014 — couriers are added in Administration, not Delivery

The owner: a courier screen in Delivery *and* keys in Administration "is
confusing and flow break kore". He was right — the old section header had to
explain that names lived on one screen and keys on another, which is a sentence
no screen should need.

Administration → Courier & delivery is now the courier list itself: one card per
courier holding name, phone, tracking link, on/off and that courier's API keys.
**Add courier** is new; until now the three names were written in code and a
fourth could not be added from the panel at all.

He first asked for the opposite — show only couriers that have an API
integrated. That would have shut the shop down: most couriers in Bangladesh have
no API, and with empty key boxes the assign dropdown would have been empty.
**Existing in the list is what makes a courier usable; keys only decide whether
the consignment number is typed by hand.**

Ownership did **not** move. `CourierService` is still Delivery's table — every
parcel ever sent points at it — and the board still assigns through
`/delivery/couriers`. Only the screen moved, so there is no migration and no
risk to delivery history. `/delivery/couriers` redirects.

### DEC-DLV-015 — `isActive` must never be used to find a finished delivery

`isActive` means "the assignment this order is riding on right now". Delivery
clears it the moment a parcel lands or fails, because a terminal assignment is
not current. Two places paired it with a terminal status:

- `delivery-analytics.service.ts` — `status: DELIVERED AND isActive: true`, a
  pair that can never both be true. `/delivery/performance` therefore returned
  zeros from the day it was written, which is why the screen still carried the
  invented "94% on-time" from `deliveryDemo.ts`.
- `finance-drift.service.ts` — the same mistake in `carrierCash`. The one drift
  check whose whole job is catching COD that never came back was structurally
  unable to fire.

Both now filter on `deletedAt: null` only. `inFlight` keeps `isActive`, because
that genuinely is a question about right now.

### DEC-DLV-016 / 017 — delivery cost is written, COD is reconciled per parcel

**Built 12 Aug 2026.** `costPaisa` had been in the schema for weeks, read by the
analytics and by `finance.onDeliveryCost()`, and written by nothing at all.
5200 Delivery Cost was always empty and delivery margin always read as the whole
charge. `onDeliveryCost` existed and was never called; the settle screen calls it.

`Delivery -> Settle a carrier` (`/delivery/settle`). **One list, not two:** a
parcel is on it when nobody has said what the delivery cost, *or* when it was
COD and the cash has not come back. Prepaid parcels are on it too — nothing to
reconcile, but the rider was still paid, and a COD-only list would lose the cost
of most of the shop's deliveries. Owner's decisions: one list, and the cost box
is **never pre-filled** — delivery is not a fixed price, and a suggested number
is one nobody checks.

`costRecordedAt` is new because `costPaisa` defaults to 0, so a delivery that
genuinely cost nothing and one nobody has priced looked identical.

`CarrierRemittanceLine` records which parcels a settlement covered. A lump sum
can say the month is 1,850 short; only a line can say RAD-24088 was delivered
nineteen days ago and its cash never came back.

**⚠️ The charge is expensed exactly once.** What is typed as Cost goes onto the
parcel, and the parcel posts `Dr 5200 / Cr 2300 Accrued`. The remittance then
clears the accrual — `Dr 2300`, **not** `Dr 5200` — so the fee is not counted
twice. `remitWithLines()` is a separate method from `remit()` for that one
reason and must not be merged into it behind a flag: the difference is an
accounting fact about whether an expense has already been posted, not a
preference, and getting it wrong is silent.

Short payments are recorded, never rejected. Handing over less than was due is
worth chasing, not an input error.

**Not yet verified end to end.** The demo database has no delivered assignment
to settle, so the screen, its dropdowns and the empty state are confirmed live
but the cost -> 5200 -> accrual -> remittance chain has not been exercised
against real data. Needs one delivered parcel to prove.

### Still open (business rules, not built — owner must decide)

- **Changing carrier mid-flight.** There is no Sales transition out of
  `out_for_delivery` back to `preparing`. Today the path is Fail → Re-assign,
  which is coherent but counts against the failure rate. Whether a direct
  carrier swap should exist, and what it does to that rate, is the owner's call.
- **A second courier-assign path still exists.** `POST /orders/:id/courier`
  writes courier fields straight onto the Order without creating a
  `DeliveryAssignment`, and the button is live in `OrderEditor`. Orders assigned
  that way never reach the board, the analytics or Finance. Should be removed in
  favour of `/delivery/assignments`.
