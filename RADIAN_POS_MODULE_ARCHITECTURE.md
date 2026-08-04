# Radian — POS Module Architecture (locked 23 Jul 2026)

> Owner locked the design in the POS kickoff chat (23 Jul). Chat in Bangla;
> everything below in English per project convention. Companion docs:
> `RADIAN_SALES_REVIEW.md` (Order module state + known gaps D1–D14),
> `RADIAN_INVENTORY_MODULE_ARCHITECTURE.md` (INV-RULE-001, DEC-INV-015 stock-flip),
> `RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md` (latest doc mould),
> `RADIAN_PENDING.md` §A/§F (gaps POS must not repeat + cross-module follow-ups).
> Locked build order: Supplier → **POS** → Returns & Refunds.

---

## 1. Purpose

POS is the physical-store counter — the selling machine for walk-in / immediate
take-away customers (flower & gift shop, Bangladesh; heavy counter rush on
Valentine's / Mother's Day). Ecommerce has the Order module; POS is a **separate
module** with its own touch-first screens, cash drawer, shift lifecycle and
negotiable pricing — but its sales land in the **one unified sales ledger**
(the `Order` table), so revenue, customer LTV and stock stay single-sourced.

## 2. Module responsibilities

**POS owns / does:**
- The counter sell flow: item pick → cart → discount → payment → complete → receipt.
- Shift lifecycle + physical cash custody (opening float, cash movements, day-close count, over/short).
- Held / parked carts.
- POS discount policy (interim — see DEC-POS-006) and POS settings.
- Recording the sale as an `Order` with `channel = POS` and triggering immediate stock deduction.

**POS does NOT own / does NOT do:**
- The sale/order entity itself → owned by **Sales** (`Order`, `OrderLine`, `Payment`).
- Stock writes → only via **Inventory** (`InventoryService`, INV-RULE-001).
- Customer records → **Customer Management**.
- Item / Product / price / material → **Item** & **Product**.
- Returns & refunds after a completed sale → **Returns & Refunds** module (next; POS keeps a hook only).
- Ledger / reconciliation postings → **Finance** (receives completed events later, never direct writes).

## 3. Owned entities

| Entity | Notes |
|---|---|
| `PosShift` | one cashier session on a register: opening float, status (OPEN/CLOSED), openedBy/closedBy, open/close time, expected vs actual cash, overShortPaisa |
| `PosCashMovement` | cash in/out inside a shift: SALE_CASH, PAYOUT, DROP, ADJUSTMENT (feeds day-close expected cash) |
| `PosHeldCart` | a parked in-progress cart (line snapshot + customer/gift/discount intent); not an Order until completed |
| `PosRegister` | counter/till master (admin-configurable; supports multiple counters / future branches) |
| `PosDiscountRule` | category-level max discount % + `requiresApproval`, with optional per-product override (interim owner — see DEC-POS-006) |
| `PosSetting` | opening-float default, receipt header/footer, gift-receipt default, enabled payment methods, default credit limit, channel label |

**References (not owned):** `Order.channel`, `Order.branchId`, `OrderLine`, `Payment`
(Sales); `Customer` (Customer Mgmt); `Item` / `Product` (Item, Product);
`Branch` (Branch); `Category` (Classification); `InventoryService` (Inventory).
All nullable/additive FKs. One Data One Owner — owning modules keep their tables.

## 4. Decisions

### DEC-POS-001 — Unified sales ledger, POS owns only peripherals
POS sales write to the existing `Order` table with `channel = POS`; **no separate
POS sales table** (owner, 23 Jul: "একই খাতায়"). POS owns only shift, cash, held-cart,
register, discount-rule and settings tables — everything that is genuinely
counter-specific. Rejected: a parallel `PosSale` ledger (breaks unified-sales
core rule, splits LTV/stock/report into two sources).

### DEC-POS-002 — Channel value = `POS`
The `Order.channel` value for counter sales is the string `POS` (owner-approved
recommendation). Existing `CHANNEL_LABEL` fallback (REV-M6) already handles labels.

### DEC-POS-003 — Immediate stock deduction at sale completion
POS is walk-in / take-away: goods leave the counter now, so stock deducts the
moment the sale is **completed** (not deferred like DEC-MOD-003 online flow).
Deduction goes through `InventoryService.postMovements()` with `SALE` reason
(INV-RULE-001), branching on `assemblyMode` (INV-RULE-005: NONE/MAKE_TO_STOCK →
finished item; MAKE_TO_ORDER → components). **Depends on DEC-INV-015 staging /
PENDING F1** — POS is the first real stock-cutting sale path, so owner's Inventory
live-verify should be done before this flips to Inventory-only writer.

### DEC-POS-004 — Sequential receipt number `POS-NNNNNN`
POS receipt/invoice number is sequential via the shared counter pattern
(SUP-/SPY- style), fixing the Sales D8 random-number weakness for the POS path.

### DEC-POS-005 — `Order.branchId` lands now (additive)
Every POS sale records which branch/register fulfilled it. Adds nullable
`Order.branchId` FK (resolves Sales D2 for the POS path) + `PosRegister.branchId`.
Additive migration; online orders keep working with null until backfilled.

### DEC-POS-006 — Category-level discount, per-product override, over-limit approval
Discount rule is **not one global value** (owner: "depend on product" — flowers =
free negotiation, gift items = capped). Model: `PosDiscountRule` keyed by
`categoryId` (max % + `requiresApproval`), optional `productId` override. Within
limit → auto-allowed; over limit → **blocked until a manager PIN approval** is
recorded (approver + reason) via an inline popup on the sell screen (no separate
screen). **Interim ownership:** POS owns `PosDiscountRule` now; negotiation caps
are a Pricing concern and ownership should move to **Pricing & Offers** later
(cross-module §9). Cite this DEC when Pricing integrates.

### DEC-POS-007 — Customer optional; identified only for credit
Anonymous walk-in sale is allowed (`Order.customerId` null). If phone/name is
given it is matched against the Customer master (existing → link, new → create).
A **credit (baki) sale requires an identified customer**.

### DEC-POS-008 — Credit sale for known customers only; due at order level
Baki-te sale is allowed only for existing/known customers (owner). Due is tracked
on `Order.duePaisa` (Sales already models this). The **Due board** aggregates open
dues per customer; collecting due = a `Payment` against the customer's open
order(s), oldest-first. Optional per-customer credit limit (`PosSetting` default,
override per customer later). Mirror of Supplier due, opposite direction.

### DEC-POS-009 — Split payment via multiple Payment rows
One sale can take multiple `Payment` rows, each with a method
(`CASH` / `BKASH` / `NAGAD` / `CARD` — all default-enabled per locked_decisions).
Σ payment allocations ≤ order total; cash tendered above due = **change**
(not stored as overpay). Reuses the Sales payment mechanism (no new payment table).

### DEC-POS-010 — Cash custody & shift lifecycle owned by POS
Opening float + all cash movements + day-close count live in `PosShift` /
`PosCashMovement`. Day-close: `expectedCash = openingFloat + Σ cash sales −
Σ cash payouts`; cashier enters actual; `overShort` computed and **flagged, never
blocked**. POS owns physical cash + shift lifecycle; **Finance later consumes the
completed shift-close event** — POS never writes to ledger tables (locked
cash-custody rule). One OPEN shift per register at a time.

### DEC-POS-011 — Held / parked carts touch nothing until completed
`PosHeldCart` stores an in-progress cart so the cashier can serve another
customer and resume later. No `Order`, no stock, no money until the sale is
completed. Rush-time (Valentine/Mother's Day) requirement.

### DEC-POS-012 — Receipt with gift price-hide variant
Printable receipt template (Sales D6 for the POS path). Gift order → one-click
price-hidden receipt variant; normal sale shows prices. Reprint from Sales history.

### DEC-POS-013 — Barcode reserved, not built
No barcode scanning this cycle (owner: "future barcode লাগবে, আপাতত না"). Keep a
nullable item barcode field reserved so a scanner can be added later without a
model change.

### DEC-POS-014 — Server-side reports only
All POS report/analytics numbers come from server-side aggregate endpoints, never
browser-summed (Sales D1 lesson — POS must not repeat it).

### DEC-POS-015 — Bill adjustment (owner, review 23 Jul)
The cashier can post a manual ± amount on the bill (round-off, extra ribbon/charge,
small correction) with a required note when non-zero. Stored on the order as an
`adjustmentPaisa` (signed) + `adjustmentNote`; audited. Distinct from discount
(discount is % against list; adjustment is a flat ± with a reason).

### DEC-POS-016 — VAT / Tax line (owner, review 23 Jul)
POS can apply a VAT/Tax rate sourced from the **Tax Management** module (Master
Data, locked) — not a hardcoded number. Base = subtotal − discount ± adjustment;
`vatPaisa = round(base × rate)`; total = base + vat. Rate is selectable per sale
with an admin-set default (0 / 5 / 7.5 / 15% demo set). Resolves Sales D13 for the
POS path. Tax master owns the rates; POS only references + snapshots them.

### DEC-POS-017 — Full vs Partial payment (owner, review 23 Jul)
Explicit payment mode. **Full** blocks completion until the whole total is taken
(no silent due). **Partial** takes an advance now and leaves the rest as due —
allowed only for an identified customer (ties to DEC-POS-008 credit rule). Makes
partial payment a deliberate choice instead of an inferred side-effect.

## 5. Business rules

| Rule | Statement | Source |
|---|---|---|
| POS-R01 | Every POS sale is an `Order` with `channel = POS`; no separate sales ledger | DEC-POS-001 |
| POS-R02 | Stock writes only via `InventoryService.postMovements()` (`SALE`), at sale completion, branched on assemblyMode | DEC-POS-003, INV-RULE-001/005 |
| POS-R03 | Receipt no is sequential `POS-NNNNNN` via shared counter | DEC-POS-004 |
| POS-R04 | Money = paisa Int, quantity = milli Int, no floats | core |
| POS-R05 | Soft-delete only; every write → AuditLog + ActivityEvent | core_principles |
| POS-R06 | Discount within category/product limit auto-allowed; over-limit blocked until a manager approval (approver + reason) is recorded | DEC-POS-006 |
| POS-R07 | Credit sale requires an identified customer; anonymous sale must be fully paid (no due) | DEC-POS-007/008 |
| POS-R08 | Σ payment allocations ≤ order total; cash excess = change; no negative payment | DEC-POS-009 |
| POS-R09 | A shift must be OPEN to sell; sale + cash tie to that shift; one OPEN shift per register | DEC-POS-010 |
| POS-R10 | Day-close: expected = float + cash sales − cash payouts; actual entered; over/short flagged, never blocked | DEC-POS-010 |
| POS-R11 | Held cart touches no stock and no money until completed | DEC-POS-011 |
| POS-R12 | Gift order → price-hidden receipt variant | DEC-POS-012 |
| POS-R13 | Permissions admin-configurable (Roles & Permissions) — no hardcoded role-action maps; interim gate = manager PIN | locked_decisions, D10 |
| POS-R14 | Report/analytics numbers server-side only | DEC-POS-014 |
| POS-R15 | Every POS order carries a `branchId` | DEC-POS-005 |
| POS-R16 | Adjustment is a signed amount with a required note when non-zero; audited | DEC-POS-015 |
| POS-R17 | VAT rate comes from Tax Management (referenced + snapshotted), never hardcoded; base = subtotal − discount ± adjustment | DEC-POS-016 |
| POS-R18 | Full mode blocks completion with any due; Partial mode requires an identified customer | DEC-POS-017 |

## 6. Workflows

**Sell (happy path):** open shift (if none) → New sale → add items (touch grid /
search, qty adjust) → apply discount (inline PIN approval if over limit) → mark
gift? → attach customer (optional; required if credit) → take payment(s), split
allowed → **Complete** → immediate stock deduction (InventoryService) → print
receipt (price-hidden if gift). End state: `Order` completed/paid, or completed
with due (credit).

**Hold / resume:** at any pre-complete point → Hold (saves `PosHeldCart`) → serve
next customer → Resume from held list → continue to Complete.

**Credit sale + due collection:** credit sale completes with `duePaisa > 0` on the
order; later, Due board → pick customer → collect → `Payment` applied oldest-first.

**Day open / day close:** open shift with opening float → sell all day → Day-close:
system shows expected cash, cashier counts + enters actual → over/short recorded
& flagged → shift CLOSED (event available for Finance later).

**Void:** pre-payment cart can be voided (no Order). After completion, corrections
are a **Return** (Returns & Refunds module) — POS only exposes the hook.

## 7. Screens (`apps/admin`)

- `/pos` — **Overview**: today's KPI snapshot (sales, transactions, cash in drawer,
  outstanding due), payment mix, recent sales, quick actions. Server-side figures.
- `/pos/sell` — **Sell screen**: touch item grid (photo) + search, cart, cart-level
  discount (category-capped; inline manager-PIN popup for over-limit), gift toggle, customer
  attach, split payment, complete, print. Hold/Resume controls.
- `/pos/shift` — **Today / shift board**: today's sales, cash in drawer, who's
  selling; open-shift / current-shift status.
- `/pos/sales` — **Sales history**: search past POS sales, view, reprint receipt.
- `/pos/day-close` — **Day-close**: expected vs actual cash count, over/short.
- `/pos/due` — **Due board**: outstanding customer dues, collect payment.
- `/pos/settings` — opening-float default, discount rules per category (+ product
  override), receipt config, enabled payment methods, credit limit, register master.

## 8. API surface (`/pos`)

shifts (open · close · current) · sales (create · add/update line · hold · resume
· complete · void) · payments (record, split) · due (board · collect) ·
discount-rules CRUD · registers CRUD · settings · analytics (server-side
aggregates). Static routes above `:id` (Nest route-order trap). All writes through
the shared AuditService; all stock through `InventoryService`.

## 9. Module relationships & cross-module log

- **Sales:** POS writes `Order` (channel=POS) + `OrderLine` + `Payment`; reuses the
  order money/status engine (paid/due/completed, REV-* fixes already in place).
- **Inventory:** deduction via `InventoryService` only; **PENDING F1 / DEC-INV-015** —
  owner Inventory live-verify before the stock-flip stage. POS is the first real
  stock-cutting sale path (remind owner).
- **Customer:** optional attach; credit needs an identified customer.
- **Branch:** `Order.branchId` additive now (resolves Sales **D2** for POS).
- **Item/Product:** price + material owner is Product; POS stores frozen snapshot
  on the line (same as online). `OrderLine.unitId` (**F4**) applies to POS lines too.
- **Pricing & Offers:** `PosDiscountRule` ownership moves here later (DEC-POS-006).
- **Finance:** consumes completed shift-close + payment events later — never direct writes.
- **Returns & Refunds:** post-sale corrections live there (**D3**); POS keeps a hook (**F5**).
- **Roles & Permissions:** void/approve/refund gates become admin-configurable (**D10**);
  interim = manager PIN.

## 10. Reports & Analytics

**Reports (server-side):** daily sales (by channel/branch/cashier), shift report,
payment-method breakdown, discount-given report, outstanding customer due, top
items sold, cash over/short log.
**Analytics:** peak selling hours, counter AOV, cash-variance trend, cashier
throughput (sales/hour), gift vs normal ratio.

## 11. Settings (admin-configurable)

Opening-float default · discount rules per category (+ product override, approval
threshold) · receipt header/footer + gift-receipt default · enabled payment
methods · default customer credit limit · register/counter master · channel label.

## 12a. Open gaps (architecture-review, 23 Jul) — before/at API build

| # | Sev | Gap | Plan |
|---|---|---|---|
| G1 | 🟠 | Register/counter selection not surfaced (shift is hardcoded to one cashier/register) | shift open form picks a `PosRegister` + cashier; multi-counter scalability |
| G2 | 🟡 | No cash payout/drop entry during a shift (day-close assumes payouts = 0) | `PosCashMovement` PAYOUT/DROP UI on the shift board |
| G3 | 🟡 | Branch not shown/selected on the sell screen (DEC-POS-005 planned) | wire `Order.branchId` from the open register's branch |
| G4 | 🟡 | Digital overpayment has no change path (only cash gives change) | UI now warns "reduce"; API caps non-cash ≤ due |
| G5 | 🟢 | Same-day counter return/exchange not hooked from the sell screen | belongs to Returns & Refunds (next module) — add a "Return" entry then |
| G6 | 🟢 | Settings screen is read-only (mock); discount-rule editor pending | build editors when POS API lands |

Fixed in the 23 Jul review pass: cart overflow (fixed-height scroll + pinned
footer), equal-height product tiles, held-cart now preserves discount/adjustment/
VAT/payment-mode, explicit "Clear sale" (void) action, colorful module-wide theme.

## 12. Non-goals this cycle

No Returns/refunds (D3) · no barcode hardware (DEC-POS-013) · no SMS/email receipt
automation (D7) · no loyalty/points · no Ecommerce · no Finance ledger posting
(events only, later) · no deep Pricing & Offers integration (interim discount rule
in POS) · no multi-currency.

---

**Status:** UI approved (dark POS-terminal). **Schema + backend API BUILT** (23 Jul),
pending owner migration + live-verify:
- Schema: POS tables + additive Order fields + enum values (see §12a / migration bat).
- API: `apps/api/src/pos/*` — shifts (open/current/close/cash), sales (Order
  channel=POS + InventoryService deduction), due board + collect, discount rules,
  registers, settings, held carts, today analytics. Registered in `app.module`.
- Run `radian_pos_migrate.bat` (migrate → `prisma generate` inside container →
  rebuild → host generate — §16 lesson).
- **MIGRATED + VERIFIED LIVE (23 Jul, Claude via computer-access):** migration
  `pos_module` applied, host tsc `Found 0 errors`, and the API answers:
  `GET /pos/settings`, `/pos/registers` (auto-seeds COUNTER-1), `/pos/analytics/today`
  all return JSON on :4000.
- **Review fix (23 Jul):** `settings()` first 500'd — the soft-delete extension
  injects `deletedAt: null` into every model's reads, but `PosSetting` (singleton,
  no `deletedAt`) has no such column. Fixed by adding `PosSetting` to
  `NO_SOFT_DELETE` (same treatment as `InventorySetting`). `radian_pos_fix.bat`
  added for the §16 regenerate-into-volume + restart step.
- Benign: a host-side `node dist/main` MODULE_NOT_FOUND line appears in the launcher
  window — the API actually runs in the Docker container (serves :4000 fine); the
  host run path is unused.
- **Admin swapped to API (23 Jul):** all 7 screens read `:4000/pos` (demo fallback
  if the API is down); Sell `Complete` → `POST /pos/sales`; Day-close `Close shift`
  → `POST /pos/shifts/:id/close`; Due `Collect` → `POST /pos/due/collect`; Sales
  `Reprint` → receipt modal. Admin typecheck 0 errors.
- **Live sale not yet demoed:** the DB is empty of master data after the reset
  (0 categories / items / products) — a real counter sale needs at least one
  published product (owner adds products, or runs a seed). The createSale path is
  verified to compile + mirror the proven orders flow; the blocker is data, not code.
- **Still genuinely deferred (owner / other modules / polish):** owner Inventory
  live-verify before the stock-flip (DEC-INV-015 / F1); register/counter picker UI
  and cash payout/drop entry (G1/G2); branch on sale (needs Branch module, G3);
  editable Settings + discount-rule editor (G6); held-cart DB persistence (currently
  local to the Sell page).
