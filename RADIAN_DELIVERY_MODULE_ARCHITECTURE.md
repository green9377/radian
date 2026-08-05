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
| **DEC-DLV-011** | **(5 Aug 2026) Cart-aware delivery menu — order never splits.** মালিক: *"prthome zone check kre dkhbe ki ki method ache and se method theke cart je product ache se product kon kon gula select ache just segulai dekhabe… multi product thake cart… win hobe se method je method win hole sobgula product delivery possible. order kon vag hobe na."* Menu = zone methods ∩ (types ticked on EVERY cart product). Baseline (tick-free, always offered): `PICK_DATE_SLOT` (Schedule It — matches the product form's "nothing picked → scheduled day only" promise) and `LEAD_DAYS` (courier — `Product.zone=NATIONWIDE` is itself the courier-safe declaration). Speed promises (2-Hour/Same Day/Midnight) never appear untick­ed. Enforced twice: `/shop/delivery-options?items=` (screen) AND checkout quote/place (server guard) — both read `common/delivery-rule.ts`. Companion admin fix: a NATIONWIDE product's Delivery tab offers BOTH groups (Dhaka speeds + courier), since it sells in both zones; switching zone filters picks instead of wiping them. |

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
