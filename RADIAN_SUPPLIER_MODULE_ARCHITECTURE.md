# Radian — Supplier Module Architecture (locked 23 Jul 2026)

> Owner locked the design in the Supplier kickoff chat (23 Jul). Chat in Bangla;
> everything below in English per project convention. Companion docs:
> `RADIAN_PURCHASE_MODULE_ARCHITECTURE.md` (DEC-PUR-003/004/006),
> `RADIAN_PENDING.md` §F (F3 = this module, F11 added below).

---

## 1. Purpose

Master-data owner of every party Radian pays: wholesale flower/gift suppliers
AND fulfillment vendors (cake-type: no stock held, sourced per order).
One profile, one ledger, one due board. Fixes DEC-PUR-003's free-text gap.

## 2. Owned entities

| Entity | Notes |
|---|---|
| `Supplier` | profile + opening due + notify prefs |
| `SupplierType` | admin-configurable master (seed: Product Supplier, Fulfillment Vendor) |
| `SupplierPayment` (+ `SupplierPaymentAllocation`) | supplier-level payment, auto-split oldest-first |
| `SupplierAdjustment` | signed correction entries (opening-due fixes etc.) |
| `SupplierCredit` | adopted from Purchase (gains `supplierId` FK) |

References (not owned): `Purchase.supplierId`, `Item.supplierId` — nullable FKs,
additive migration. Owning modules keep their tables (One Data One Owner).

## 3. Decisions

### DEC-SUP-001 — One table + type master, not separate Supplier/Partner entities
Two real-world kinds (owner, 23 Jul): (1) product suppliers he buys from,
cash/credit; (2) fulfillment vendors whose products he sells without stocking
(cake — sourced per online order). Both need identical profile/ledger/due
mechanics, so ONE `Supplier` table + `SupplierType` admin master (not an enum).
Commission/consignment partners: out of scope, noted for Sales if ever needed.

### DEC-SUP-002 — Profile fields; only name + type required
name*, type*, nickname ("Kamal Mama", searchable), phone (duplicate-warn, never
block — one phone can serve two market stalls), contactPerson, market/area,
address, photo (data-URL interim), paymentTerms (free text, informational only —
owner: both per-order pay and monthly settle happen, vendor-wise), payoutInfo
(bKash/Nagad/bank for sending money), notes, status ACTIVE/INACTIVE
(hide, never delete — DEC-CUS-003 pattern). `SUP-000001` sequential no.

### DEC-SUP-003 — Vendor notification data hooks now, sending flow later
Owner's flow: vendor items listed on the website → order arrives → vendor gets
a message "your product X, qty Y, ready by TIME" — **never any customer data**
(SUP-R07). Fields now: `notifyPhone`, `notifyChannel` (SMS/WHATSAPP/OFF),
`notifyMode` (AUTO/MANUAL — all MANUAL until an SMS gateway exists),
`leadTimeHours` (drives ready-by time; later the website's "order X hours
ahead"). Manual send ships now (wa.me / sms: links from supplier page).
AUTO sending = Automation D7 + Sales trigger → PENDING F11.

### DEC-SUP-004 — `Item.supplierId` FK lands in THIS cycle (owner's ruling)
Additive nullable FK on Item + supplier QuickSelect in the Item form +
"Supplied by" on item views + supplier detail lists its items. Owner explicitly
ordered it now (needed to label vendor products on the website). The stock-skip
sell flow for fulfillment items stays OUT (kickoff ban on stock paths) → F11.

### DEC-SUP-005 — Opening due: optional, one figure, corrections via adjustment
`openingDuePaisa` (default 0) + `openingAsOf` + note — Inventory Opening-stock
pattern. Suppliers with zero due still show on the due board (owner, 23 Jul);
"With due only" is a filter. Once set, opening due is never edited in place —
corrections are signed `SupplierAdjustment` rows (audit stays clean).

### DEC-SUP-006 — Supplier-level payment, auto-allocated oldest-first, hand-adjustable
"Paid Kamal Mama 5000 today" is the unit of reality, not per-bill. `SupplierPayment`
→ allocation rows: opening due first, then linked purchases oldest-first; the
confirm screen shows the split and allows manual re-allocation before saving.
Each purchase allocation materialises a real `PurchasePayment` row (DEC-PUR-004
stays the per-bill truth; Σ allocations = payment amount). Excess beyond total
due → `SupplierCredit` (DEC-PUR-006: money never comes back as cash). Per-bill
payment from Purchase detail keeps working — two doors, one ledger.

### DEC-SUP-007 — SupplierCredit + Purchase gain `supplierId`; small link tool
Additive `supplierId` FKs. DB reset (23 Jul) means almost no legacy free-text
rows — the merge tool is just: Settings → "Unlinked purchase names" → pick
supplier → link (sets FK on matching Purchase + SupplierCredit rows). New
purchases pick the supplier from the master (QuickSelect + quick-create);
`supplierName` stays as a snapshot column.

### DEC-SUP-008 — Ledger = merged event stream; due formula
Supplier detail ledger merges: opening due · purchases (grand) · payments ·
returns (due-cut / credit) · adjustments — newest first, with a monthly summary
block. Due = openingRemaining + Σ linked-purchase dues + Σ adjustments.
Credit held is shown beside due, never silently netted; net position = due − credit.

### DEC-SUP-009 — Vendors get their own WORKSPACE, not their own table (owner, 23 Jul)
Owner: vendors have many layers — split them out. Ruling: the split is UI-level;
the data stays ONE `Supplier` table (DEC-SUP-001 holds — a second table would
duplicate the ledger/payment engine). Mechanism: `SupplierType.isFulfillment`
behaviour flag (label-vs-behaviour, same discipline as DEC-ITM-017; system rows'
behaviour locked, owner-created types pick it at creation). UI branches on it:
`/suppliers` = product-supplier book; `/suppliers/vendors` = vendor workspace
(card board: products count · lead time · notify status · due; vendor-door
editor with notify/lead-time first; detail shows a Products panel).
**(A) Vendor price = `Item.standardCostPaisa`** — deliberately NO separate
vendorPrice column: for a fulfillment item, what we pay the vendor IS the item's
cost; one figure, one owner, margin boards stay honest. The Products panel shows
vendor price · linked Product selling price · margin. Order history per vendor
(B) needs the Sales link → F11. Coverage/off-days (C) stay profile notes.

## 4. Business rules

| Rule | Statement | Source |
|---|---|---|
| SUP-R01 | Only name + type required; phone duplicate = warn, never block | DEC-SUP-002 |
| SUP-R02 | Soft-delete only; INACTIVE hides from pickers, history intact | core_principles |
| SUP-R03 | Every write → AuditLog + ActivityEvent via shared AuditService | core_principles |
| SUP-R04 | Opening due immutable once set; corrections via SupplierAdjustment | DEC-SUP-005 |
| SUP-R05 | Payment allocation: opening first, then oldest purchase; manual override allowed at confirm; Σ allocations ≤ amount; excess → SupplierCredit | DEC-SUP-006 |
| SUP-R06 | Each purchase allocation writes a real PurchasePayment (per-bill truth preserved) | DEC-PUR-004 |
| SUP-R07 | Vendor notifications carry product info only — NEVER customer name/phone/address | DEC-SUP-003 |
| SUP-R08 | Sequential nos: SUP- (supplier), SPY- (payment) via the shared counter pattern | DEC-PUR-008 |
| SUP-R09 | Supplier module never writes stock, ever | DEC-PUR-002 |
| SUP-R10 | Money = paisa Int; no floats | core |
| SUP-R11 | Credit is consumed ONLY via apply-credit: negative adjustment settles due, credit stamped `appliedAt`, remainder becomes a fresh credit row; blocked while due = 0. No other code path may consume a credit | review fix 23 Jul |
| SUP-R12 | INACTIVE never hides money: a supplier with due or credit stays on the due board (flagged); INACTIVE blocks NEW purchases | review fix 23 Jul |

## 5. Screens (`apps/admin`)

- `/suppliers` — product-supplier Overview: due board (zero rows visible, "With due only" toggle) + Vendors workspace door
- `/suppliers/list` — product suppliers only: search, type/status filter, due sort
- `/suppliers/new` — create (opening due section included)
- `/suppliers/vendors` — DEC-SUP-009 vendor board: cards with products count · lead time · notify badge · due
- `/suppliers/vendors/new` — vendor-door editor (Fulfillment type pre-picked, notify card first)
- `/suppliers/[id]` — shared detail; vendor face shows Products panel (vendor price · selling · margin) · ledger · Pay · adjustment · manual notify · timeline
- `/suppliers/settings` — SupplierType master (behaviour checkbox for new types) · unlinked-names link tool

## 6. API surface (`/suppliers`)

list · stats · types CRUD · create/patch/soft-delete · detail (balances, items,
credits) · ledger · payments (with allocations) · adjustments · unlinked-names ·
link-names. Static routes above `:id` (Nest route-order trap).

## 7. Cross-module log

- **F11 (new, PENDING §F):** fulfillment order flow — sell without stock deduction
  + auto-notify on order (Automation D7) + order↔vendor purchase link. Needs
  Sales-side design; stock paths untouched this cycle (Assembly verify pending).
- Purchase new-form: free text → Supplier QuickSelect (quick-create inline);
  `supplierName` kept as snapshot. DEC-PUR-003 consequence closed.
- Finance later consumes SupplierPayment events (completed events only).

## 8. Non-goals this cycle

No SMS gateway · no auto-send · no stock-skip sell flow · no commission ledger ·
no per-supplier price lists (Pricing & Offers) · no multi-currency.
