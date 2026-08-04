# Radian — Returns & Refunds Module Architecture

_Locked 23 Jul 2026 (sobuj)। Build order: Sales → Pricing & Offers → POS → **Returns & Refunds**._
_Companion code: `apps/api/src/returns/*`, `apps/admin/app/returns/*`, `_components/ReturnViews.tsx`._

---

## 1. Purpose

Post-delivery grievance → resolution. The customer has already received the goods
(`deliveryStatus = delivered`) and something is wrong. Pre-delivery abandonment is
**Cancel** (Sales owns it) — not a return. Walk-in POS counter returns are a later
small pass (cash-drawer touch); this cycle focuses on delivered online orders.

## 2. Module responsibilities

Owns the Return document, its lines, the refund/credit payout record, the reason
master, the store-credit ledger, and return policy settings. It **initiates** money
and stock effects but does not own those ledgers: refunds are recorded as real
`PaymentTransaction` rows on the Order, restock flows through `InventoryService`.

## 3. Owned entities

`ReturnReason` · `SalesReturn` · `SalesReturnLine` · `CustomerCredit` · `ReturnSetting`.
Additive relations only: `Order.returns`, `OrderLine.returnLines`,
`Customer.returns` / `Customer.credits`. Enum `PaymentMethod += bank`.

## 4. Decisions (DEC-RTN)

Supersedes/extends the earlier DEC-RTN-001..004 (Returns owns the entities; Sales
SM-RULE-007 retired).

- **DEC-RTN-005** — a return is its own document (`SalesReturn`, `RTN-NNNNNN`). It
  **never mutates `Order.salesStatus`** (One Data One Owner). The order page shows a
  return badge + refunded amount, derived — not stored twice.
- **DEC-RTN-006** — resolution types this cycle: `REFUND`, `REPLACEMENT`,
  `PARTIAL_COMPENSATION`, `STORE_CREDIT`. Exchange deferred (redeliver + new order covers it).
- **DEC-RTN-007** — per line, staff choose `RESTOCK` (goods back to sellable stock)
  or `WRITE_OFF` (discarded/perishable). Default: READYMADE→RESTOCK, CRAFTED→WRITE_OFF
  (and settings `restockDefaultPerishable` can force write-off).
- **DEC-RTN-008** — refund method is admin-configurable per reason. Cash payout maps
  to a `PaymentMethod` (`bank` added for bank transfer); `ORIGINAL` = the order's method.
- **DEC-RTN-010** — sequential `returnNo` (`RTN-000001`), never random (D8 lesson).
- **DEC-RTN-011** — **refund payout ≤ collected.** Payout is capped at
  `order.paidPaisa − order.refundPaisa`. A COD order never delivered/paid refunds 0.
  Store credit is capped the same way. (Sales review principle #1: refund is a payout,
  not an entitlement.)
- **DEC-RTN-012** — approval gate: needed when the reason is flagged, when any line is
  crafted/perishable (locked: case-by-case staff approval), or when value ≥
  `approvalThresholdPaisa`. Any staff can approve for now; real role-gating wires in
  when the Roles & Permissions module lands.
- **DEC-RTN-013** — store credit = `CustomerCredit` ledger (mirrors `SupplierCredit`).
  Balance = Σ amount (ISSUED +, CONSUMED −). Consumed on a future order (Sales pass).
- **DEC-RTN-014** — settings: return window (0 = off, past window **warns, never blocks**)
  + approval threshold + perishable restock default. All admin-configurable.
- **DEC-RTN-015** — restock is written **only** by `InventoryService.postSaleReturn`
  (`SALE_RETURN`, +stock, INV-RULE-001), fail-soft so an inventory hiccup never blocks
  the payout. "Stock Reverted" (Delivery, cancel path) stays a distinct concept.

## 5. Workflows

1. **Create** — pick a delivered order → choose lines + qty (≤ ordered − already
   returned) + restock action → reason + resolution + refund method. Status becomes
   `approved` immediately, or `pending_approval` if the gate trips.
2. **Approve / Reject** — for pending returns.
3. **Complete** — executes: restock RESTOCK lines → pay out (cash `PaymentTransaction`
   REFUND + bump `Order.refundPaisa`/paymentStatus, or issue `CustomerCredit`) → mark
   completed. Replacement moves no money (redeliver as a fresh order).
4. **Cancel / Delete** — before completion only.

## 6. API surface (`/returns`)

`GET /` list · `GET /analytics` · `GET /eligible/:orderId` · `GET /credit/:customerId` ·
`GET /reasons` `POST /reasons` `PATCH|DELETE /reasons/:id` · `GET|PATCH /settings` ·
`POST /` create · `GET /:id` · `GET /:id/timeline` · `POST /:id/approve|reject|cancel|complete` ·
`DELETE /:id`. (static routes before `:id` — POS lesson.)

## 7. Screens (`apps/admin/app/returns`)

`/returns` Overview + list · `/returns/new` create-from-order · `/returns/[id]` detail
(approve/complete/reject/cancel + timeline) · `/returns/settings` reasons + policy.

## 8. Non-goals this cycle

POS counter cash returns (next small pass) · Exchange resolution · gateway auto-refund
(manual record now) · store-credit consumption at checkout (Sales pass) · role-gated
approval (Roles module).

## 8a. Review pass (architecture-review, 23 Jul — same day as build)

Ran the module-review checklist against the built code. Fixed:

- **REV-RTN-1 🔴 double payout** — store credit was not counted toward the refund
  cap, so a store-credit return + a cash refund on the *same order* could hand back
  up to 2× the collected money. `complete()` now subtracts prior completed
  store-credit (`salesReturn.aggregate`) as well as `order.refundPaisa` before
  capping. Payout is provably ≤ collected across cash + credit + multiple returns.
- **REV-RTN-2 🔴 poisoned numbering** — after demo `RTN-D###` rows existed, the old
  `desc + parseInt` picked `RTN-D004` → `NaN` → every future number broke.
  `nextReturnNo()` now takes the numeric max over `^RTN-(\d{4,})$` only, ignoring
  demo/malformed rows (self-healing).
- **REV-RTN-3 🟠 unified timeline** — a return now also drops events on the **Order**
  timeline (opened / refunded / store-credit issued), so staff see it without
  leaving the order.
- **REV-RTN-4 🔴 soft-delete singleton gap** (found during live bring-up) — the global
  soft-delete Prisma extension injects `deletedAt: null` into every read for models NOT
  in its `NO_SOFT_DELETE` set. `ReturnSetting` is a singleton with no `deletedAt` column;
  it was missing from that set, so **every `/returns/settings` call 500'd** (and the demo
  seed aborted before creating returns). Fixed by adding `'ReturnSetting'` to
  `NO_SOFT_DELETE` (same pattern as `InventorySetting` / `PosSetting`). Code-only, no
  migration. Lesson: any new singleton/no-`deletedAt` table must be registered there.

**Live-verified 23 Jul** (Claude, in-browser): migration applied, all `/returns/*`
endpoints return correct JSON, admin `/returns` renders 4 seeded demo returns
(pending / approved / cash-refunded / store-credit) with correct KPIs and money.

Checked & OK (no change): refund cap re-reads fresh per complete (no stale double);
returnable qty reserves in-flight returns; restock is fail-soft and Inventory-only;
`Order.salesStatus` never mutated; approval gate fires on reason/crafted/threshold;
COD delivered orders have `paid > 0` so cap works. Known non-goals unchanged.

## 9. Cross-module follow-ups → RADIAN_PENDING.md §F

- Consume `CustomerCredit` at checkout (Sales/Ecommerce pass).
- POS counter return → cash drawer (`PosCashMovement`) pass.
- Finance consumes REFUND completed events (ledger) — no direct writes.
