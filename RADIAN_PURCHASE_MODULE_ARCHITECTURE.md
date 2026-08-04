# Radian — Purchase Module — Architecture Lock

_Locked with sobuj: 22 July 2026. Skills applied: radian-business-context · radian-development-context · architecture-review · module-design-template · business-rules-writing · decision-log-writing._

> Read this before touching Purchase, Item cost, or the future Inventory/Supplier modules.
> Companion docs: `RADIAN_ITEM_MODULE_ARCHITECTURE.md` · `RADIAN_ITEM_HANDOFF_DO_NOT_BREAK.md` ·
> `RADIAN_UOM_OWNERSHIP_RULING.md` · `RADIAN_ADMIN_PROGRESS.md` (§10, §12) · `RADIAN_PENDING.md`.

---

## 0. Sequencing decision (owner, 22 Jul)

The Inventory kickoff chat pivoted: **Purchase is built BEFORE Inventory** (owner's ruling,
matches §7b of the Item doc: `Item → Warehouse → Purchase → Inventory → Assembly`).
The hard boundary that makes this safe is DEC-PUR-002 below: Purchase never writes stock.

**Two Inventory answers were locked in the same session and must be carried into the
Inventory kickoff (do not re-ask):**

1. **Two warehouses from day 1** — shop + storeroom. Warehouse table with `warehouseId`
   mandatory on every stock row; transfer flow needed; UI hides the picker while only the
   seeded warehouses exist.
2. **Ledger + cached balance** — every stock in/out is a movement row (who/when/why/qty);
   a current balance per item×warehouse is maintained in the same transaction.

---

## 1. Overview — why Purchase exists

Radian buys flowers from the wholesale market (cash, same morning) and gifts/packaging from
suppliers (ordered by phone, delivered later, often partly on credit). Today that lives in
Biznify. This module replaces it, feeding: per-purchase dues, item average cost (which drives
every bouquet recipe's cost/margin via DEC-ITM-008), and — once Inventory exists — the
stock-in events.

### 1a. Competitor audit — Biznify Purchase module (owner's live data, 22 Jul 2026)

Reviewed with the owner's own login: Direct Bill, Requisition, Order, Receipt (GRN),
All Bills, Return.

**The decisive finding — the formal chain is dead weight.**
- Requisitions: **0 rows ever**. Purchase Orders: **0 rows ever**.
- Direct Bills: **331** — every single purchase in ~1.5 years went the one-step path.
- Bills: 334, all sourced from DP numbers; GRNs: 331, all auto-generated.
Exactly the Manufacturing-template story from the Item audit repeated: the heavy path was
built, never used. This is direct field evidence for DEC-PUR-001.

**What their Direct Bill does right (adopted):** one save auto-creates the whole chain
(DP + GRN + Bill); supplier receipt number field; receipt file upload; line = item/unit/qty/
price/discount; payment method + amount on the same screen, bill lands Paid / Partially
Paid / Unpaid by itself.

**Owner's real data:** total bought ৳2,934,726 · paid ৳2,743,461 · **due ৳191,265**;
partial payments are routine (e.g. ৳13,600 paid on a ৳34,800 bill). Suppliers are informal
names: "Kamal Mama", "Ajghor vai", "DCC", "Paper Tarek", "AB Flower", "Metal", "Arif",
"Badhon". VAT column is **৳0 on all 334 bills** (basis for DEC-PUR-007). Purchase returns
are real and large: 2 returns on 18 Feb 2026 (post-Valentine), ৳106,200 total.

---

## 2. Module Responsibilities

### Purchase OWNS
- `Purchase` — the purchase record (both quick market buys and advance-paid orders).
- `PurchaseLine` — what was bought.
- `PurchasePayment` — money paid against a purchase (advance or after).
- `PurchaseReturn` + `PurchaseReturnLine` — goods sent back to a supplier.
- `SupplierCredit` — credit created when a return exceeds the remaining due.

### Purchase does NOT own
| Thing | Owner |
|---|---|
| Supplier master (profile, phone, per-supplier ledger) | **Supplier module** (future; owner's ruling 22 Jul). Until then `supplierName` free text. |
| Stock quantity / movements / balances | **Inventory** (not built). Purchase NEVER writes stock — DEC-PUR-002. |
| Item master, cost field | **Item**. Purchase requests cost updates through Item's own service. |
| VAT / tax | **Tax Management** (later). No VAT fields now — DEC-PUR-007. |
| Real moving-average valuation | **Inventory** (later) — DEC-PUR-005 phase 2. |

---

## 3. Locked decisions

### DEC-PUR-001 — One purchase entity; status flow covers order → advance → receive; NO Requisition/Order UI
**Decision:** single `Purchase` entity with
`status = ORDERED | ADVANCE_PAID | RECEIVED | CANCELLED`.
Quick entry (the common case) creates a Purchase directly in `RECEIVED`. Paying an advance
before goods arrive creates it in `ADVANCE_PAID`. `ORDERED` exists in the enum but has **no
UI button** — no Requisition screen, no Order screen.
**Reason:** owner's own definition ("an order is not a purchase until advance is paid or
goods arrive") + field evidence (0 requisitions, 0 POs, 331 direct bills in 1.5 years of
Biznify). Unused screens clutter and confuse.
**Re-activation trigger (recorded so it is not re-litigated):** the first branch opening OR
a second person besides the owner starting to make buying decisions. At that point build
Requisition (+ approval, needs Roles & Permissions) on top; the enum value is already there;
zero data migration.
**Alternatives rejected:** separate QuickPurchase/PurchaseOrder entities (double reports,
double Inventory listeners, boundary cases stuck); building the full Biznify chain now
(proven unused).
**Impact:** Purchase, future Inventory, future Roles & Permissions.

### DEC-PUR-002 — Purchase never writes stock
**Decision:** receiving records quantities on the purchase (`receivedQtyMilli` per line) but
writes **no stock quantity anywhere**. The shop keeps operating `Product.stockQty` manually
(DEC-ITM-005 / DEC-MOD-003 untouched). When Inventory is built, it consumes receive events
(`PURCHASE` ledger reason) — from that point receive posts stock through Inventory's flow.
**Reason:** stock's only owner is Inventory (DEC-ITM-005). Purchase writing stock before
Inventory exists would create the second-owner mistake being fixed.
**Cost accepted by owner:** stock does not auto-increase on receive until Inventory ships.
**Impact:** Purchase, Inventory, Sales/Delivery (unchanged).

### DEC-PUR-003 — Supplier is NOT owned by Purchase
**Decision (owner, 22 Jul):** no Supplier table in this module. `Purchase.supplierName` is
free text (+ optional `supplierPhone`). When the Supplier module is built, `supplierId` FK
is added and names are matched/merged.
**Reason:** owner's ruling — Supplier is its own master-data module (same pattern as
Customer). Half-building it here would create a future second owner.
**Consequence (stated to owner):** dues are reliable **per purchase**; "total due to Kamal
Mama" is only indicative until the Supplier module exists (free-text spelling variants).
**Impact:** Purchase, future Supplier module, SupplierCredit.

### DEC-PUR-004 — Payments are child rows; advance = payment before RECEIVED
**Decision:** `PurchasePayment(purchaseId, amountPaisa, method, paidAt, note)`; a purchase
can hold many payments. `paidPaisa`/`duePaisa` are derived; list shows Paid / Partially
Paid / Unpaid. Payments while status is `ADVANCE_PAID` are advances.
Methods: `CASH | BKASH | NAGAD | BANK | CARD | OTHER` (enum now; becomes a Finance-owned
master when Finance locks — flagged to architecture project).
**Reason:** partial payment is the owner's daily reality (Biznify data). One amount field
cannot express advance + receive-day + later installments.
**Impact:** Purchase, future Finance (consumes completed events only).

### DEC-PUR-005 — Costing method = AVCO (weighted average); auto-updates Item cost, two phases
**Decision (owner, 22 Jul — resolves architecture critical gap #4):** Radian values goods at
**weighted average cost**, not FIFO.
- **Phase 1 (now, no Inventory):** purchase-weighted average = Σ(line value) ÷ Σ(qty) across
  received purchases of that item. On every receive, the item's average is recomputed and
  written to `Item.standardCostPaisa` **through Item's own endpoint**, which triggers the
  existing DEC-ITM-008 recipe-cost recompute (bouquet margins self-update).
- **Phase 2 (Inventory):** formula upgrades to true moving average weighted by on-hand stock
  (needs the ledger). Screens unchanged.
**Owner's reasoning:** flowers either sell or get damaged; damage must be valued
("কত টাকার মাল damage হলো"), which requires an honest per-stem cost. His example:
(500+1500+2500)÷300 roses = ৳15/stem.
**Guardrails:** if the new average deviates strongly from the previous one (fat-finger
protection, e.g. 180 instead of 18), Save asks for ⚠ confirmation; every cost change is
audited with the source purchase id.
**Alternatives rejected:** manual-only cost with "last price" hint (owner wants it automatic);
last-purchase-price auto-set (daily market swings would whipsaw every recipe's margin).
**Impact:** Purchase, Item (DEC-ITM-008 chain), future Inventory/Finance valuation.

### DEC-PUR-006 — Returns: partial allowed; settlement is credit-based, never cash
**Decision (owner, 22 Jul):** `PurchaseReturn` references a received Purchase; line qty may
be partial (`returnQty ≤ receivedQty`). Settlement order: (1) reduce that purchase's
remaining due; (2) any excess becomes a `SupplierCredit` row (keyed by supplierName until
DEC-PUR-003's FK exists) to be adjusted against a future purchase. No cash-refund path.
**Reason:** owner: "টাকা ফেরে না — বাকির খাতা থেকে কাটা যায় বা পরের কেনায় adjust হয়".
Field evidence: ৳106,200 returned post-Valentine 2026.
**Impact:** Purchase, future Supplier module (credit ledger), future Inventory (return-out
movement).

### DEC-PUR-006b — Adjustment field (Biznify audit addendum, 22 Jul evening)
**Decision:** `Purchase.adjustmentPaisa Int` — a signed rounding/bargain adjustment:
`grand = subtotal − discount + adjustment`.
**Reason:** the owner's real bills land on round figures constantly (39,920 → 39,900 =
−20; 34,790 → 34,800 = +10). A discount-only model cannot express the upward case.
**Also adopted from the Biznify form in the same review:** receipt photo upload on the
entry form (schema already had `attachmentUrl`), and the owner's rule that every item
picker shows the item's photo/tile exactly as saved in the Item module (DEC-ITM-012).
**Deliberately still absent:** per-line discount (his 334 bills: ৳3,757 total — noise),
VAT (DEC-PUR-007), Serial/Batch (Inventory's batch/expiry, later), Price List (selling
concern — Pricing & Offers).

### DEC-PUR-007 — No VAT/tax fields
**Decision:** no VAT columns on Purchase/PurchaseLine.
**Reason:** owner's own 334 bills show VAT = 0 on every one; Tax Management is a later
module (D13). Adding dead fields invites wrong entry.
**Reversibility:** additive migration later.
**Impact:** Purchase, future Tax Management.

### DEC-PUR-008 — Sequential purchase numbers
**Decision:** `PUR-000001` style, DB counter, gapless-enough for audit.
**Reason:** Sales' random `RAD-xxxxx` is a recorded weakness (D8). Not repeating it.
**Impact:** Purchase.

### DEC-PUR-009 — Line discipline
**Decision:** every line: `itemId` FK (never SKU text — DEC-ITM-021), item must be
`isPurchasable` (DEC-ITM-013), `unitId` + **`factorSnapshot`** (the unit's resolved
`rootFactor` copied at entry time), `qtyMilli` Int, `unitPricePaisa` Int. No floats.
**Reason:** if a unit's `baseQty` is edited later, historical purchases must not silently
re-interpret how much was bought (same discipline flagged for OrderLine in
`RADIAN_UOM_OWNERSHIP_RULING.md` §5.3).
**Impact:** Purchase, Unit, future Inventory.

---

## 4. Sub-modules (sidebar: Purchases)

**Build now**

| Sub-module | Route | What it is for |
|---|---|---|
| Overview | `/purchases` | decision-first landing: due total, this month's buying, items whose avg cost jumped, advance-paid waiting for goods |
| All purchases | `/purchases/list` | the table — supplier/status/date filter, Paid/Partial/Unpaid badges, totals cards (bought · paid · due) |
| New purchase | `/purchases/new` | ONE screen, Biznify-Direct-Bill style: supplier name, date, supplier receipt no, receipt photo, lines (item picker → unit auto → qty → price), payment method + amount. Save → RECEIVED. "Advance mode" toggle → saves as ADVANCE_PAID |
| Purchase detail | `/purchases/[id]` | receive (partial ok), add payment, start return, attachment, timeline |
| Returns | `/purchases/returns` | return list + create (pick received purchase → pick lines → partial qty → settlement preview: due-cut vs credit) |
| Reports | `/purchases/reports` | monthly buy totals, due board (per purchase, per supplier-name indicative), item average-price history |

**Build later, with their triggers**

| Sub-module | Trigger |
|---|---|
| Requisition + Order | first branch OR second buying decision-maker (DEC-PUR-001) |
| Supplier link everywhere | Supplier module built (DEC-PUR-003) |
| Trash (restore soft-deleted) | solve once for all master data (same gap as Item/Brand/Unit) |

---

## 5. Schema draft (Prisma, apps/api)

```prisma
enum PurchaseStatus { ORDERED ADVANCE_PAID RECEIVED CANCELLED }  // DEC-PUR-001
enum PayMethod      { CASH BKASH NAGAD BANK CARD OTHER }          // DEC-PUR-004

model Purchase {
  id             String         @id @default(cuid())
  purchaseNo     String         @unique            // PUR-000001 (DEC-PUR-008)
  status         PurchaseStatus @default(RECEIVED)
  supplierName   String                             // free text (DEC-PUR-003)
  supplierPhone  String?
  purchaseDate   DateTime
  receivedAt     DateTime?
  supplierReceiptNo String?
  attachmentUrl  String?                            // receipt photo (data URL interim)
  notes          String?
  subTotalPaisa  Int            @default(0)
  discountPaisa  Int            @default(0)
  adjustmentPaisa Int           @default(0) // signed round-figure fix (DEC-PUR-006b)
  grandTotalPaisa Int           @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  lines    PurchaseLine[]
  payments PurchasePayment[]
  returns  PurchaseReturn[]
  @@index([status])
  @@index([supplierName])
  @@index([purchaseDate])
}

model PurchaseLine {
  id              String   @id @default(cuid())
  purchaseId      String
  purchase        Purchase @relation(fields: [purchaseId], references: [id])
  itemId          String                            // FK, isPurchasable only (DEC-PUR-009)
  item            Item     @relation(fields: [itemId], references: [id])
  unitId          String
  unit            Unit     @relation(fields: [unitId], references: [id])
  factorSnapshot  Int      @default(1)              // rootFactor at entry (DEC-PUR-009)
  qtyMilli        Int
  receivedQtyMilli Int     @default(0)              // partial receive
  unitPricePaisa  Int
  lineTotalPaisa  Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  returnLines PurchaseReturnLine[]
  @@index([purchaseId])
  @@index([itemId])
}

model PurchasePayment {
  id         String    @id @default(cuid())
  purchaseId String
  purchase   Purchase  @relation(fields: [purchaseId], references: [id])
  amountPaisa Int
  method     PayMethod
  paidAt     DateTime  @default(now())
  note       String?
  createdAt DateTime @default(now())
  deletedAt DateTime?
  @@index([purchaseId])
}

model PurchaseReturn {
  id         String   @id @default(cuid())
  returnNo   String   @unique                       // PRT-000001
  purchaseId String
  purchase   Purchase @relation(fields: [purchaseId], references: [id])
  returnDate DateTime @default(now())
  reason     String?
  totalPaisa Int      @default(0)
  dueCutPaisa Int     @default(0)                   // settled against this purchase's due
  creditPaisa Int     @default(0)                   // excess → SupplierCredit (DEC-PUR-006)
  createdAt DateTime @default(now())
  deletedAt DateTime?
  lines PurchaseReturnLine[]
  @@index([purchaseId])
}

model PurchaseReturnLine {
  id             String         @id @default(cuid())
  returnId       String
  return         PurchaseReturn @relation(fields: [returnId], references: [id])
  purchaseLineId String
  purchaseLine   PurchaseLine   @relation(fields: [purchaseLineId], references: [id])
  qtyMilli       Int                                 // ≤ receivedQtyMilli (partial ok)
  valuePaisa     Int
  createdAt DateTime @default(now())
  deletedAt DateTime?
  @@index([returnId])
}

model SupplierCredit {
  id           String   @id @default(cuid())
  supplierName String                                // FK later (DEC-PUR-003)
  amountPaisa  Int                                   // positive = we hold credit
  sourceReturnId String?
  appliedPurchaseId String?                          // set when consumed
  note         String?
  createdAt DateTime @default(now())
  deletedAt DateTime?
  @@index([supplierName])
}
```

**Numeric conventions:** money = paisa Int · quantity = qtyMilli Int · no floats — as everywhere.

---

## 6. Business rules (service layer, cite DEC- in code)

| # | Rule | Cite |
|---|---|---|
| PUR-R01 | Purchase writes no stock quantity anywhere. Receive records `receivedQtyMilli` only. | DEC-PUR-002 |
| PUR-R02 | Line item must exist, be non-deleted, and `isPurchasable`. Always `itemId` FK, never SKU text. | DEC-PUR-009, DEC-ITM-013/021 |
| PUR-R03 | `factorSnapshot` copied from Unit resolver at line create; never re-read afterwards. | DEC-PUR-009 |
| PUR-R04 | Σpayments ≤ grandTotal. Payment on ORDERED/ADVANCE_PAID marks status ADVANCE_PAID. | DEC-PUR-004 |
| PUR-R05 | Receive allowed on ORDERED/ADVANCE_PAID/RECEIVED(partial); sets receivedQty per line; full receive → status RECEIVED + receivedAt. | DEC-PUR-001 |
| PUR-R06 | CANCELLED only from ORDERED/ADVANCE_PAID with zero receipts; advance already paid must be resolved (credit or payout note) first. RECEIVED is never deleted/cancelled — corrections go through Return. | DEC-PUR-006 |
| PUR-R07 | On receive, recompute item purchase-weighted average and update `Item.standardCostPaisa` via Item's endpoint; deviation beyond threshold requires ⚠ confirm; audit with purchase id. | DEC-PUR-005 |
| PUR-R08 | Return qty per line ≤ received qty − already returned. Settlement: due first, excess → SupplierCredit. No cash refund path. | DEC-PUR-006 |
| PUR-R09 | Sequential numbering via DB counter (`PUR-`, `PRT-`). | DEC-PUR-008 |
| PUR-R10 | Soft-delete only; every create/update/receive/payment/return writes AuditLog + ActivityEvent via shared AuditService. | core_principles |

---

## 7. Build steps (each reviewed live on localhost:3001 before the next)

> **STATUS (22 Jul 2026, end of day): ALL steps below are BUILT** — schema, API,
> Overview, list (+supplier filter), New purchase (full-screen photo item-picker,
> ± adjustment dropdown, receipt upload), detail (receive/pay/return/timeline),
> Returns, Reports (monthly bars, supplier due board, item price history).
> Audit pass done same day; 4 fixes applied (groupBy soft-delete leak, nextNo
> same-ms collision, cost-jump guard unit/AUTO comparison, AVCO skips AUTO items).
> Money maths verified by simulation against the owner's real figures.
> Pending on the owner's machine: run `radian_purchase_migrate.bat` once.

| # | Step | Deliverable |
|---|---|---|
| 1 | Prisma models above | migration `purchase_module` (Docker two-step; ONE session holds schema.prisma — see RADIAN_ITEM_HANDOFF_DO_NOT_BREAK.md) |
| 2 | `/purchases` API | CRUD · quick-create (RECEIVED) · advance-create · receive · payments · returns+settlement · avg-cost hook → Item endpoint · reports |
| 3 | Purchases list + Overview | cards (bought/paid/due), filters, badges, demo-data fallback |
| 4 | New purchase screen | one-screen entry, item picker (photo+SKU), unit auto-fill, payment section, advance toggle |
| 5 | Purchase detail | receive, payments, timeline, attachment |
| 6 | Returns | create + settlement preview + list |
| 7 | Reports | monthly totals, due board, item avg-price history |

**Not in this module:** stock writing · warehouse field (arrives with Inventory) · supplier
master · VAT · requisition/order UI · POS/e-commerce anything.

---

## 8. Open items carried forward

- **Warehouse destination on receive** — add `warehouseId` to receive when Inventory ships (2-warehouse ruling above).
- **True moving AVCO** — Inventory phase (DEC-PUR-005 phase 2).
- **Supplier merge** — when Supplier module lands: match free-text names, attach FK, consolidate SupplierCredit.
- **PayMethod → Finance-owned master** — when Finance locks.
- **DEC-PUR-001…009 registration** in the architecture project's master Decision Log (provisional until then, same as DEC-ITM/PRD/CUS/SAL ids).

## 9. ⚠️ Flags to the architecture project (mandatory sync rule)

1. **Build order changed:** Purchase now precedes Inventory (owner, 22 Jul). `build_sequence.md` and any doc saying "Inventory then Purchase" should be updated.
2. **Costing method locked = AVCO** (critical gap #4 resolved) — needs a master Decision Log entry.
3. **PayMethod enum** will migrate to a Finance-owned master — noted so Finance's design accounts for it.
