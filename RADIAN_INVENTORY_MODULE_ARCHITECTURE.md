# Radian — Inventory Module — Architecture Lock

_Locked with sobuj: 22 July 2026 (রাত). Skills applied: radian-business-context ·
radian-development-context · architecture-review · module-design-template ·
business-rules-writing · decision-log-writing._

> Read this before touching stock, Warehouse, `Product.stockQty`, or the DEC-MOD-003 deduction.
> Companion docs: `RADIAN_PURCHASE_MODULE_ARCHITECTURE.md` (DEC-PUR-001…009) ·
> `RADIAN_ITEM_MODULE_ARCHITECTURE.md` · `RADIAN_ITEM_HANDOFF_DO_NOT_BREAK.md` ·
> `RADIAN_UOM_OWNERSHIP_RULING.md` · `RADIAN_ADMIN_PROGRESS.md` (§10, §12) · `RADIAN_PENDING.md`.

---

## 1. Overview — why Inventory exists

Stock's ONLY owner is Inventory (DEC-ITM-005). Today stock lives in `Product.stockQty`,
manually maintained: crafted bouquets carry fictional stock, raw items (rose stems, ribbon)
have no stock anywhere, and damage has no money value. The owner's core requirement
(recorded in DEC-PUR-005): *"ফুল হয় বিক্রি নয় damage — কত টাকার মাল damage হলো সেই হিসাব লাগবেই।"*

This module delivers: an immutable movement ledger + cached balances per item×warehouse,
true moving-average (AVCO) valuation, wastage/gift money reporting, transfers between the
two day-1 warehouses, stocktake, and the careful repoint of the live sales deduction.

## 2. Module Responsibilities

### Inventory OWNS
- `InventoryStock` — cached balance per item × warehouse (updated in the same transaction as every movement).
- `InventoryMovement` — the ledger. Every in/out: who/when/why/qty/value. **Immutable.**
- `StockTransfer` (+lines) — storeroom → shop moves.
- `StockIssue` (+lines) — wastage & gift documents.
- `Stocktake` (+lines) — count sessions and their adjustments.
- `ItemExpiryLot` — expiry-date lots, only for `trackExpiry` items.
- `InventorySetting` — module settings (single row).

### Inventory does NOT own
| Thing | Owner |
|---|---|
| Warehouse master | **Warehouse module (Master Data)** — minimal table built here out of necessity; flagged §9 |
| Item master, cost field | **Item** — AVCO updates go through Item's endpoint (DEC-PUR-005) |
| Purchase record / receive qty | **Purchase** — Inventory only consumes receive events (DEC-PUR-002) |
| Order / delivery status | **Sales / Delivery** — Inventory listens to "preparing" (DEC-MOD-003) |
| Sales returns | **Returns & Refunds** (locked, not built) — `SALE_RETURN` reason reserved |
| Accounting valuation entries | **Finance** (later) — consumes completed events only |

## 3. Locked decisions

### DEC-INV-001 — Ledger + cached balance (formalises the 22 Jul Purchase-chat ruling)
**Decision:** every stock change is one immutable `InventoryMovement` row (signed `qtyMilli`,
AVCO value at that moment, reason, reference, actor); `InventoryStock` balance is updated in
the **same transaction**. No stock number exists anywhere else.
**Reason:** balances-only lose history (Biznify's dead rows); ledger-only makes every read a scan.
**Impact:** all stock flows, Purchase, Sales/Delivery, future Finance.

### DEC-INV-002 — Day-1 reason set; GIFT is its own reason
**Decision:** `MovementReason = OPENING · PURCHASE · PURCHASE_RETURN · SALE · SALE_RETURN ·
TRANSFER · WASTAGE · ADJUSTMENT · GIFT`. All in the enum from day 1; every reason except
`SALE_RETURN` gets a day-1 flow. `SALE_RETURN` is enum-only until Returns & Refunds is built.
GIFT (free goods: marketing/সম্পর্ক/sample) is separate from ADJUSTMENT so the monthly
"কত টাকার মাল ফ্রি গেল" report exists (valued at AVCO).
**Alternative rejected:** GIFT inside ADJUSTMENT+note — loses the report.
**Impact:** Inventory, Returns & Refunds (consumes SALE_RETURN later).

### DEC-INV-003 — Sale warehouse is settings-driven
**Decision (owner):** `InventorySetting.defaultSaleWarehouseId` (seeded = দোকান) +
`allowPerOrderWarehouse` toggle. Deduction uses the order's warehouse if the toggle is on and
one was chosen; otherwise the default. Admin-configurable, never hardcoded.
**Reason:** owner explicitly wants this switchable from Settings; matches the locked
admin-configurable principle.
**Impact:** Inventory, Sales, Delivery, future Branch (D2 will supersede the default per-branch).

### DEC-INV-004 — Transfer is one-step
**Decision:** one entry (items + qty + from + to) posts OUT and IN in one transaction, joined
by `groupId`. No in-transit state.
**Reason:** both warehouses are in the same building; a send→receive handshake is pure friction.
**Future review:** re-add in-transit when a remote branch exists.
**Impact:** Inventory.

### DEC-INV-005 — Wastage & Gift: one screen, any time, AVCO-valued
**Decision (owner):** `StockIssue(kind = WASTAGE | GIFT)` with lines (item, qty, reason,
note). Entry any time, multiple items per document, money auto-computed at current AVCO.
No mandatory day-end routine.
**Reason:** flowers rot daily but a forced day-end step ("আজ কিছু নেই" clicking) breeds fake data.
**Impact:** Inventory, reports, future Finance.

### DEC-INV-006 — Opening stock = manual screen; NO Product.stockQty backfill
**Decision (owner):** an Opening Stock screen where stock is entered **item by item** (item +
warehouse + counted qty) posting `OPENING` movements. `Product.stockQty` is NOT backfilled —
the counted number is the truth.
**Reason (owner's call, amending the DEC-ITM-005 path step 2):** stockQty is stale/fictional
(MAKE_TO_ORDER rows meaningless, raw items absent). Counting once is honest; backfilling
garbage then adjusting is double work.
**Impact:** Inventory, Item, the DEC-ITM-005 migration path (step 2 replaced by this screen).

### DEC-INV-007 — Expiry lots only for items with a real expiry date
**Decision (owner):** flowers get NO batch/expiry — shelf life depends on weather/care and
cannot be fixed; rot is captured by WASTAGE. Items with a printed expiry date (chocolate etc.)
get `Item.trackExpiry = true`: purchase receive asks an expiry date → `ItemExpiryLot`;
deductions reduce lots earliest-expiry-first (FEFO, count only — money stays AVCO);
"expiring soon" appears on Overview/reports.
**Reason:** owner's words: *"flower খেত্রে বলা মুশকিল ৩ দিন থাকবে না ৭ দিন… যেসব product-এ
expire date লাগানো থাকে তাদের জন্য কাজ করবে।"*
**Alternatives rejected:** full batch tracking on everything (per-stem batches unusable in a
flower shop); nothing at all (expiry-dated food would silently expire on the shelf).
**Impact:** Inventory, Purchase (receive form gains an expiry field for these items only).

### DEC-INV-008 — Low stock surfaces on Overview + list badges; notifications later
**Decision:** `Item.reorderLevel` becomes live: Overview "needs attention" section + red/orange
badges on stock board and Items list. WhatsApp/email alerts arrive with the Automation module (D7).
**Impact:** Inventory, Item screen, future Automation.

### DEC-INV-009 — Stocktake = count session → one-click adjustments
**Decision:** a session per warehouse (full or partial item set): staff enter counted qty
beside the ledger qty; the screen shows the গরমিল in qty and taka (AVCO); **Apply** posts one
`ADJUSTMENT` movement per differing line, all linked to the session.
**Reason:** history matters — "কোনদিন কী গোনা হয়েছিল" survives; ad-hoc single adjustments stay
possible for one-off fixes.
**Impact:** Inventory.

### DEC-INV-010 — "Can build N" shows everywhere in admin
**Decision:** MAKE_TO_ORDER items never show a stock number; `itemStockLabel()` (DEC-ITM-005
addendum) returns **"can build N"** = `min(component stock ÷ recipe qty)` — on Items list,
Item detail, Inventory stock board, and order-taking availability checks. Storefront PDP waits
for the Ecommerce module.
**Impact:** Inventory, Item screens, Sales order form.

### DEC-INV-011 — Negative stock allowed, loudly flagged
**Decision (owner):** deductions NEVER block an order. Balance may go negative; negative rows
get a red badge and appear in Overview "needs attention"; the fix path is adjustment/stocktake.
`InventorySetting.negativeStockPolicy = ALLOW_WARN` now; a `BLOCK` value exists for the future.
**Reason:** entry lag is daily reality in a flower shop; blocking a live customer order over
bookkeeping is the wrong trade. Mirrors the DEC-ITM-005 warning: the live sales path must not break.
**Impact:** Inventory, Sales, Delivery.

### DEC-INV-012 — Ledger rows are immutable; corrections are reversals
**Decision:** `InventoryMovement` rows are never edited or deleted (no soft-delete either).
A mistake is corrected by a reversal movement referencing the original (`reversesId`).
Documents (transfer/issue/stocktake) cannot be deleted once posted — they get a "reversed" state.
**Reason:** an editable ledger is not a ledger; money reports become unauditable.
**Impact:** Inventory, future Finance.

### DEC-INV-013 — One AVCO per item (not per warehouse); true moving average
**Decision:** DEC-PUR-005 phase 2 activates: on every PURCHASE receive,
`newAvg = (onHandQty×avg + receivedQty×price) ÷ (onHandQty + receivedQty)` where onHand =
sum across warehouses. Result written to `Item.standardCostPaisa` **through Item's endpoint**
(existing guardrails + DEC-ITM-008 recipe recompute untouched). One item = one average.
**Reason:** same flowers, same shop, one market price; per-warehouse averages add complexity
with zero information. If onHand ≤ 0 (negative-stock edge), fall back to the received price.
**Future review:** per-branch cost when a real branch opens.
**Impact:** Inventory, Purchase, Item, future Finance.

### DEC-INV-014 — Warehouse table built here, minimally; ownership flagged
**Decision:** `Warehouse(name, code, address?, isActive)` seeded with **দোকান (SHOP)** and
**স্টোররুম (STORE)**. No branch fields, no manager, no zones. The Warehouse *module*
(Master Data) remains the rightful owner — flagged in §9.
**Impact:** Inventory, future Warehouse/Branch modules.

### DEC-INV-015 — DEC-MOD-003 repoint is staged behind a flag
**Decision:** the live deduction (`Product.stockQty −1` at Delivery "preparing") is repointed
to Inventory in stages: (1) parallel run — Inventory posts SALE movements while the old
deduction still runs, screens compare; (2) owner verifies real orders; (3) flag flips —
Inventory is the only writer, `Product.stockQty` becomes derived read-only; (4) column drop
in a later migration. Branching per DEC-ITM-004: `NONE`/`MAKE_TO_STOCK` deduct the finished
item; `MAKE_TO_ORDER` deducts components per recipe (`factorSnapshot` discipline).
**Reason:** this is the live sales path; ভাঙলে আসল order আটকায়। Small steps, verified live.
**Impact:** Inventory, Sales, Delivery, Product.

## 4. Business rules (service layer; cite in code)

| # | Rule | Cite |
|---|---|---|
| INV-RULE-001 | Every stock write goes through `InventoryService.postMovements()` — one transaction: ledger rows + balance upsert (+ expiry lots). No other code path may touch `InventoryStock`. | DEC-INV-001 |
| INV-RULE-002 | Movement rows are immutable — no update/delete endpoint exists. Corrections post reversals (`reversesId`). | DEC-INV-012 |
| INV-RULE-003 | Transfer posts OUT+IN atomically, same `groupId`; from ≠ to; qty > 0. | DEC-INV-004 |
| INV-RULE-004 | SALE deduction warehouse = order's warehouse if `allowPerOrderWarehouse` and set, else `defaultSaleWarehouseId`. | DEC-INV-003 |
| INV-RULE-005 | Deduction branches on `assemblyMode`: NONE/MAKE_TO_STOCK → finished item; MAKE_TO_ORDER → components (recipe qty × order qty, `factorSnapshot`). | DEC-ITM-004, DEC-INV-015 |
| INV-RULE-006 | Negative balances allowed (`ALLOW_WARN`): never block; flag red everywhere. Exception: a future `BLOCK` policy value. | DEC-INV-011 |
| INV-RULE-007 | WASTAGE/GIFT/ADJUSTMENT-out/SALE valued at current item AVCO; PURCHASE valued at actual price; AVCO recomputed ONLY on PURCHASE receive (through Item's endpoint, guardrails intact). | DEC-INV-013, DEC-PUR-005 |
| INV-RULE-008 | `trackExpiry` items: receive requires/asks expiry date → lot; deductions consume lots FEFO (count only). Non-tracked items never create lots. | DEC-INV-007 |
| INV-RULE-009 | Item must be non-deleted and `isStockTracked`; SERVICE items never move. Always `itemId` FK, never SKU text. | DEC-ITM-021 |
| INV-RULE-010 | Quantities = `qtyMilli` Int, money = paisa Int, no floats. Every post writes AuditLog + ActivityEvent (actor recorded — এখন সবাই সব পারবে; approval gates arrive with Roles & Permissions). | core_principles |
| INV-RULE-011 | Stocktake Apply posts one ADJUSTMENT per differing line, linked to the session; a session is immutable after Apply. | DEC-INV-009 |
| INV-RULE-012 | Opening entries only via the Opening screen (reason OPENING); re-opening an item×warehouse that already has movements is refused — use ADJUSTMENT instead. | DEC-INV-006 |

## 5. Schema (Prisma, apps/api)

```prisma
enum MovementReason { OPENING PURCHASE PURCHASE_RETURN SALE SALE_RETURN TRANSFER WASTAGE ADJUSTMENT GIFT } // DEC-INV-002
enum IssueKind      { WASTAGE GIFT }                    // DEC-INV-005
enum NegativeStockPolicy { ALLOW_WARN BLOCK }           // DEC-INV-011

model Warehouse {           // minimal — ownership flagged (DEC-INV-014)
  id String @id @default(cuid())
  code String @unique       // SHOP · STORE
  name String               // দোকান · স্টোররুম
  address String?
  isActive Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  stocks InventoryStock[]
  movements InventoryMovement[]
}

model InventoryStock {      // cached balance (DEC-INV-001)
  id String @id @default(cuid())
  itemId String
  item Item @relation(fields: [itemId], references: [id])
  warehouseId String
  warehouse Warehouse @relation(fields: [warehouseId], references: [id])
  qtyMilli Int @default(0)
  updatedAt DateTime @updatedAt
  @@unique([itemId, warehouseId])
  @@index([warehouseId])
}

model InventoryMovement {   // the ledger — IMMUTABLE (DEC-INV-012)
  id String @id @default(cuid())
  itemId String
  item Item @relation(fields: [itemId], references: [id])
  warehouseId String
  warehouse Warehouse @relation(fields: [warehouseId], references: [id])
  reason MovementReason
  qtyMilli Int              // signed: in +, out −
  unitCostPaisa Int @default(0)   // AVCO at post time (per stock unit)
  valuePaisa Int @default(0)      // qty × unitCost (signed)
  refType String?           // PURCHASE | ORDER | TRANSFER | ISSUE | STOCKTAKE | MOVEMENT(reversal)
  refId String?
  groupId String?           // joins transfer OUT+IN, stocktake batch
  reversesId String? @unique
  note String?
  actor String?
  createdAt DateTime @default(now())
  @@index([itemId, warehouseId])
  @@index([reason])
  @@index([createdAt])
  @@index([refType, refId])
}

model StockTransfer {
  id String @id @default(cuid())
  transferNo String @unique          // TRF-000001
  fromWarehouseId String
  toWarehouseId String
  note String?
  status String @default("POSTED")   // POSTED | REVERSED
  actor String?
  createdAt DateTime @default(now())
  deletedAt DateTime?
  lines StockTransferLine[]
}
model StockTransferLine {
  id String @id @default(cuid())
  transferId String
  transfer StockTransfer @relation(fields: [transferId], references: [id])
  itemId String
  item Item @relation(fields: [itemId], references: [id])
  qtyMilli Int
  @@index([transferId])
}

model StockIssue {                    // wastage & gift (DEC-INV-005)
  id String @id @default(cuid())
  issueNo String @unique              // WST-000001 / GFT-000001
  kind IssueKind
  warehouseId String
  reason String?                      // পচা / ভাঙা / marketing / সম্পর্ক …
  note String?
  totalValuePaisa Int @default(0)
  status String @default("POSTED")
  actor String?
  createdAt DateTime @default(now())
  deletedAt DateTime?
  lines StockIssueLine[]
}
model StockIssueLine {
  id String @id @default(cuid())
  issueId String
  issue StockIssue @relation(fields: [issueId], references: [id])
  itemId String
  item Item @relation(fields: [itemId], references: [id])
  qtyMilli Int
  unitCostPaisa Int @default(0)
  valuePaisa Int @default(0)
  @@index([issueId])
}

model Stocktake {                     // DEC-INV-009
  id String @id @default(cuid())
  stocktakeNo String @unique          // STK-000001
  warehouseId String
  note String?
  status String @default("DRAFT")     // DRAFT | APPLIED
  appliedAt DateTime?
  actor String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  lines StocktakeLine[]
}
model StocktakeLine {
  id String @id @default(cuid())
  stocktakeId String
  stocktake Stocktake @relation(fields: [stocktakeId], references: [id])
  itemId String
  item Item @relation(fields: [itemId], references: [id])
  ledgerQtyMilli Int                  // snapshot at count time
  countedQtyMilli Int
  diffValuePaisa Int @default(0)
  @@index([stocktakeId])
}

model ItemExpiryLot {                 // DEC-INV-007, trackExpiry items only
  id String @id @default(cuid())
  itemId String
  item Item @relation(fields: [itemId], references: [id])
  warehouseId String
  expiryDate DateTime
  qtyMilli Int @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([itemId, warehouseId])
  @@index([expiryDate])
}

model InventorySetting {              // single row (DEC-INV-003/011)
  id String @id @default("singleton")
  defaultSaleWarehouseId String?
  defaultReceiveWarehouseId String?
  allowPerOrderWarehouse Boolean @default(false)
  negativeStockPolicy NegativeStockPolicy @default(ALLOW_WARN)
  updatedAt DateTime @updatedAt
}

// Item gains: trackExpiry Boolean @default(false)  (DEC-INV-007)
// + back-relations: stocks, movements, transferLines, issueLines, stocktakeLines, expiryLots
```

## 6. Sub-modules (sidebar: Inventory)

| Sub-module | Route | What it is for |
|---|---|---|
| Overview | `/inventory` | needs attention first: negative balances · low stock · expiring soon · আজ/এ মাসের wastage টাকা |
| Stock board | `/inventory/stock` | item×warehouse grid — photo/SKU tile (DEC-ITM-012), MAKE_TO_ORDER rows show "can build N" |
| Movements | `/inventory/movements` | ledger browser — item / reason / warehouse / date filters |
| Opening stock | `/inventory/opening` | item-by-item counted entry (DEC-INV-006) |
| Transfer | `/inventory/transfer` | one-step storeroom→shop + history |
| Wastage & Gift | `/inventory/issue` | multi-item issue entry, live AVCO money preview + list |
| Stocktake | `/inventory/stocktake` | sessions: count → গরমিল (qty+টাকা) → Apply |
| Reports | `/inventory/reports` | wastage/gift money by day/month · stock valuation (qty×AVCO) · item movement history |
| Settings | `/inventory/settings` | §5 settings — admin-configurable |

UI conventions unchanged: item photo/SKU-tile everywhere, no native select/datalist,
demo-fallback + "Demo data" badge, রঙিন decision-first, code-first on localhost (§12).

## 7. Build steps (each reviewed live on localhost:3001 before the next)

> **STATUS (22 Jul 2026, late night): steps 1–6 ALL BUILT** — schema+seed+bat, ledger
> service (BLOCK policy enforced), all 9 screens (Overview · Stock board+Adjust ·
> Opening · Transfer · Wastage&Gift · Stocktake · Movements · Reports · Settings),
> Purchase receive/return hooks + TRUE moving AVCO (DEC-INV-013), DEC-MOD-003
> **stage-1 parallel mirror** (fail-soft, legacy write untouched), itemStockLabel live.
> Pending on the owner's machine: run `radian_inventory_migrate.bat` once.
> Pending after live verification: DEC-INV-015 stage 3 flip → Product.stockQty derived → drop.

| # | Step | Deliverable |
|---|---|---|
| 1 | Schema + seed | migration `inventory_module` (Docker two-step); seed দোকান+স্টোররুম + settings row — `radian_inventory_migrate.bat` |
| 2 | Ledger service + API | `postMovements` txn core · stock/movements queries · opening · transfer · issue · stocktake · reports · settings |
| 3 | Purchase hooks | receive → PURCHASE movements + true AVCO (DEC-INV-013); purchase return → PURCHASE_RETURN out |
| 4 | Screens | Overview + Stock board first, then the rest |
| 5 | ⚠️ DEC-MOD-003 repoint | staged per DEC-INV-015 (parallel run → verify → flip → later drop) |
| 6 | itemStockLabel() live | real numbers + "can build N" across admin |

**Not in this module:** sales-return flow (Returns module) · POS/ecommerce anything ·
accounting entries (Finance) · in-transit transfers · approval gates (Roles & Permissions) ·
courier/delivery logic.

## 8. Open items carried forward

- `SALE_RETURN` flow — Returns & Refunds module (enum + reason reserved).
- Per-branch AVCO + in-transit transfers — first real branch.
- **Branch-level settings matrix** (owner's question, 22 Jul night): today's single-row
  InventorySetting (one default sale/receive warehouse) is DELIBERATE — one shop, one
  storeroom. When multi-branch/multi-location arrives, the same row becomes per-branch
  (`BranchInventorySetting(branchId, defaultSaleWarehouseId, …)`), joined by Order.branchId
  (D2). Row-based Warehouse + item×warehouse stock mean NO schema rework — additive only.
  Trigger: the first real branch. Building the matrix now = unused complexity (the same
  trap as Biznify's 0-row Requisitions).
- Low-stock WhatsApp/email — Automation module (D7).
- `Product.stockQty` column drop — after DEC-INV-015 stage 4 verified.
- Purchase receive form: expiry-date field appears for `trackExpiry` items (step 3).
- DEC-INV-001…015 registration in the architecture project's master Decision Log (provisional ids, same as DEC-ITM/PUR).

## 9. ⚠️ Flags to the architecture project (mandatory sync rule)

1. **Warehouse ownership** — Warehouse master is a Master Data module; Inventory built a
   minimal table out of necessity (DEC-INV-014). When the Warehouse/Branch module is designed,
   it adopts this table — do not create a second one.
2. **DEC-ITM-005 migration path step 2 amended** — owner chose manual Opening screen over
   `Product.stockQty` backfill (DEC-INV-006).
3. **Costing** — DEC-PUR-005 phase 2 (true moving AVCO) activates here (DEC-INV-013); master
   Decision Log entry needed.
4. **negativeStockPolicy** — ALLOW_WARN locked as default (DEC-INV-011); if Finance later
   requires hard blocking, that is a policy change, not a bug.
