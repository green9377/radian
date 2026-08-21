# Radian Business OS — what has to be GLOBAL

_Opened 21 Aug 2026, on the owner's ruling._

> **The owner's words:** "ami pos a jevabe setting set kri seta abr purchess a
> kaj kre na… agula asole global system howa uchit amr pura business OS ar.
> off krle sob jaygay off, on krle sob jaygay on."

**The rule:** if a thing is true about the SHOP, it is written down once and
every module reads it. A module may only own the things that are true about
that module alone. Anything switched off must be off everywhere — no screen
keeps a private copy of a shop-wide fact.

This file is the audit that came out of the payment-method complaint, and the
board for fixing it. Nothing here is implemented until the owner says which.

---

## A. One real thing, many lists (the payment-method disease)

### A1. Payment methods — FIVE places, one switch

| Where | What it holds | Who reads it |
|---|---|---|
| `PaymentMethod` enum | online · cod · counter · cash · bkash · nagad · card · bank | website checkout, Orders, POS transactions |
| `PayMethod` enum | CASH · BKASH · NAGAD · BANK · CARD · OTHER | Purchases, supplier payments |
| `ReturnRefundMethod` enum | CASH · BKASH · NAGAD · CARD · BANK · ORIGINAL · STORE_CREDIT | Returns |
| `PosSetting.enabledMethods` | the shop's on/off list (DEC-POS-021) | **POS only** |
| `FinanceAccount.isMoneyAccount` + `payMethod` | the money account each method lands in (DEC-FIN-008) | Finance posting |

Result the owner hit: bKash switched off at the till is still offered on a
purchase bill and on a refund.

**Proposed fix — DEC-GBL-001.** One master table `PaymentMethodMaster`:
name · short label · icon · **isActive** · where it may be used (sell / buy /
refund) · the Finance money account it posts to · sort order. The three enums
stay in the database as the stored value (history must not move), but every
SCREEN and every validation reads the master. Off = gone everywhere.
Seeded from what exists today, so nothing breaks on the day it lands.

### A2. VAT rate — three copies

| Where | Field | Note |
|---|---|---|
| `FinanceSetting` | `vatEnabled`, `vatRateBps` (15% default), `vatInclusivePricing` | the real one; Mushak 6.3 prints from it |
| `PosSetting` | `defaultTaxRateBps` | a second rate the till uses |
| `Purchase.taxRateBps` / `Order.taxRateBps` | per-document snapshot | **correct** — a bill must keep the rate it was written with |

**Proposed fix — DEC-GBL-002.** Finance owns the live rate; POS and Purchase
read it and keep writing their snapshot per bill. `PosSetting.defaultTaxRateBps`
is dropped (or becomes an override the screen shows as "different from the
shop's rate").

### A3. Company identity — two copies of the same government facts

`CompanySetting` (legalName · bin · tin · trade licence · vatCircle ·
registered/operating address · publicPhone · logo · signatory) **and**
`FinanceSetting.businessBin / businessName / businessAddress /
businessVatCircle / signatoryName / signatoryDesignation`.

Two copies of a BIN is how a challan goes out with the wrong number.

**Proposed fix — DEC-GBL-003.** `CompanySetting` is the owner of these facts.
Finance reads it; the Mushak screen refuses to print only when *those* fields
are empty. The Finance copies are removed after a one-time copy-over.

---

## B. Lists the owner cannot edit (hardcoded in a screen)

| Screen | Hardcoded | Should be |
|---|---|---|
| Inventory → Wastage | `WASTAGE_REASONS` — Rotten, Dried out, Broken, Expired, Damaged in transit, Other | a reason master the owner can add to — Returns already has one (`ReturnReason`) |
| Inventory → Gift out | `GIFT_REASONS` — Marketing, Relationship, Corporate sample, Compensation, Other | same master, different purpose tag |
| Admin → New order | `METHODS` (delivery methods + fees) and `SLOTS` — written into the file, marked "static for the mock" | the Delivery module already owns methods, zones, slots and fees; the admin's own order screen must read them, or it quotes a price the website does not |
| Offers → Coupons | `OFFER_OPTS` sample names | the offers that exist |

**Proposed fix — DEC-GBL-004.** One `Reason` master with a purpose
(RETURN · WASTAGE · GIFT · ADJUSTMENT · CANCEL), the Returns table folded into
it. **DEC-GBL-005** — New order reads the Delivery module, no local fee table.

---

## C. Already global and correct — do not touch

Units · Channels · Item types / categories / brands / colours / sizes ·
Warehouses + `InventorySetting` defaults (sale / receive / assembly floor,
negative-stock policy) · `ItemSetting.defaultMarkupBp` · access templates and
"See cost prices" · delivery masters (methods, zones, slot templates) ·
messaging channels · SSLCommerz keys.

---

## D. Open questions for the owner

1. **Approvals.** Returns have an approval threshold (`ReturnSetting`).
   Purchases and POS discounts have their own separate rules. Should there be
   ONE "money above ৳X needs the owner" rule for the whole system?
2. **Rounding.** Every screen rounds to the paisa its own way. One shop-wide
   rounding rule (nearest taka on a counter bill?) or leave it?
3. **A method that is off but was used yesterday.** History keeps it (a bill
   written in bKash stays bKash) — the master only stops NEW use. Confirmed
   as the intended behaviour.

---

## E. What is done

**A1 · DEC-GBL-001 — SHIPPED 21 Aug.** `PaymentMethodMaster`, one row per method,
one On/Off each (the owner's choice: no per-place ticks). Setup → Payment
methods. POS, purchase bills, supplier payments and refunds all read it, and the
server refuses a payment on a method that is off, so a stale tab cannot slip one
through. What the owner had already switched off at the till was carried over on
the first run. Rows cannot be added or deleted — a new name would have nowhere
to be stored (the three enums still hold the value on old bills).

**A2 · DEC-GBL-002 — SHIPPED 21 Aug.** Finance owns the VAT rate. POS reads it
(the till's own `defaultTaxRateBps` is no longer written or read) and the POS
settings screen shows the shop's rate with a link to Finance. Each bill keeps
its own snapshot, as it must.

**A3 · DEC-GBL-003 — SHIPPED 21 Aug.** CompanySetting owns the BIN, the
registered name and address, the VAT circle and the signatory. The Mushak screen
now SAVES there instead of writing a second copy into Finance (it already read
the company row first). A migration copies over anything that only ever got
typed into the Finance copy.

## F. Still open

1. **B** — the reason master (wastage / gift), and New order reading the
   Delivery module instead of its own fee table.
2. **D1** — one approval threshold for the whole system, or one per module?
3. **D2** — one rounding rule, or leave each screen as it is?
