# Radian — Pricing & Offers Module Architecture (locked 23 Jul 2026)

> Owner locked v1 scope in the offers kickoff (23 Jul, four rulings below).
> Chat in Bangla; everything here in English per project convention. Companion:
> `RADIAN_ADMIN_PROGRESS.md` §5খ (original lock), `apps/admin/app/_data/offers.ts`
> (UI-first mock that defined the vocabulary), `RADIAN_PENDING.md` §A (D-gaps),
> `RADIAN_RETURNS_MODULE_ARCHITECTURE.md` (doc mould, approval-gate pattern).
> Locked build order: **Pricing & Offers → Delivery Management → G-backlog**.

---

## 1. Purpose

One owner for every discount promise Radian makes: seasonal offers, coupons,
payment-method cashback, free delivery, first-order welcome. Sales/Orders keeps
only the applied snapshot (`couponCode` + `discountPaisa`) — the RULES live here
(One Data One Owner; §5খ original lock). POS stays out: counter price is
negotiable by design (locked §5খ), POS has its own PosDiscountRule interim cap.

## 2. Module responsibilities

**Owns / does:**
- The `Offer` entity (a coupon IS an offer with mechanism=COUPON — mock's ruling kept).
- The quote engine: given a cart → which offers apply, how much off (server-side).
- Redemption records (`OfferRedemption`) — who used what, on which order.
- Approval gate for deep/below-cost discounts (DEC-OFR-004).
- Offer settings (threshold, defaults) — admin-configurable, never hardcoded.

**Does NOT own / do:**
- The order's money fields → Sales owns `Order.discountPaisa` etc.; this module only
  computes and records. Order keeps the frozen snapshot (receipt contract).
- Product price/cost → Product/Item. The engine READS cost to detect below-cost.
- POS negotiation → POS module (DEC-POS-006 interim rules stay there for now).
- Marketing campaigns/ads → Marketing domain (that's why the entity is "Offer",
  not "Campaign" — mock's naming kept).
- Storefront display → Ecommerce (W3 swap will consume the same quote API).

## 3. Owner rulings (kickoff 23 Jul)

| id | Ruling |
|---|---|
| **DEC-OFR-001** | **v1 shapes = Core 6**: SITEWIDE · CATEGORY · PRODUCT · FIRST_ORDER · PAYMENT · FREE_DELIVERY. Bundle/Tiered/Free-gift/BOGO/Corporate deferred — enum stays extensible (addition = non-breaking migration), UI shapes stay visible in mock till then. |
| **DEC-OFR-002** | **Stacking = 1 automatic + 1 coupon.** Best automatic offer auto-applies; customer/staff may add one coupon. Both apply together ONLY if both are `combinable`; otherwise the better single discount wins. Priority (higher number wins) breaks ties between automatics. |
| **DEC-OFR-003** | **Apply points v1 = admin order + preview API.** `POST /offers/quote` previews; Orders create/edit validates server-side and writes `OfferRedemption`. POS excluded (negotiable, locked §5খ). Storefront consumes the same quote API at W1/W3 swap. |
| **DEC-OFR-004** | **Approval gate = below-cost OR ≥ threshold%.** Threshold admin-configurable (`OfferSetting.approvalThresholdBp`, default 2500 = 25%). Trigger → status `pending_approval`; cannot go live unapproved. Any staff approves for now (Returns DEC-RTN-012 pattern), name audited; Roles module gates it later. |
| **DEC-OFR-005** | Sequential `OFR-000001` (D8 lesson). Coupon `code` unique, stored uppercase. |
| **DEC-OFR-006** | Status lifecycle: `draft → pending_approval → approved → (dates decide) scheduled/active/expired`, plus `paused`. Live-ness DERIVED from `startsAt/endsAt` at read time — no cron. Stored status never claims "active"; the API computes `liveState`. |
| **DEC-OFR-007** | Scarcity counter = cosmetic only (never real stock — original §5খ lock). Bonus lines + guarantee text = plain text fields on the offer (Hormozi framing), no separate entities in v1. |
| **DEC-OFR-008** | Redemption releases on order cancel: cancelling an order soft-deletes its redemptions so per-customer/total limits give the slot back. |
| **DEC-OFR-009** | Money discipline: PERCENT = basis points, FLAT = paisa, min-spend/max-cap = paisa. Integers only. Discount NEVER makes a line negative; order-level cap = subtotal. |

## 4. Entities

- **Offer** — everything above; targeting: `categoryId` (CATEGORY), `products` m2m
  (PRODUCT), `paymentMethod` (PAYMENT). Limits: `minSpendPaisa`, `maxDiscountPaisa`,
  `perCustomerLimit`, `totalLimit`.
- **OfferRedemption** — offerId + orderId + customerId + discountPaisa + code
  snapshot. One row per applied offer per order (so a stacked order has 2 rows).
- **OfferSetting** — singleton (`"singleton"` id pattern — PosSetting's cuid slip
  not repeated): approvalThresholdBp, defaultCombinable.

## 5. Quote engine rules (OFR-R*)

| id | Rule |
|---|---|
| OFR-R01 | An offer applies only if: not deleted · approved (or no gate needed) · not paused · now within [startsAt, endsAt] · minSpend met · shape target matches. |
| OFR-R02 | FIRST_ORDER: customer `ordersCount == 0` AND no prior redemption of any FIRST_ORDER offer. |
| OFR-R03 | PAYMENT: order's `paymentMethod` equals the offer's. |
| OFR-R04 | CATEGORY matches a line if the line product's category (or its parent) equals `categoryId`. Discount base = matching lines only. PRODUCT likewise via m2m. SITEWIDE/FIRST_ORDER/PAYMENT base = whole subtotal. FREE_DELIVERY zeroes `deliveryPaisa` (as `deliveryWaivedPaisa`). |
| OFR-R05 | PERCENT discount = base × bp ÷ 10000, capped by `maxDiscountPaisa`; FLAT = min(value, base). |
| OFR-R06 | Per-customer limit counts live redemptions by customerId; total limit counts all live redemptions. |
| OFR-R07 | Stacking per DEC-OFR-002; engine returns the losing candidates too (staff sees why). |
| OFR-R08 | Coupon code lookup case-insensitive; inactive/exhausted/expired each return a distinct human reason. |
| OFR-R09 | Below-cost detection at save: cheapest targeted product's offer price − discount < its cost ⇒ flag + approval (perishable allowed — that's why it's a gate, not a block). |
| OFR-R10 | Orders create re-runs the quote server-side — the client's preview number is never trusted. |

## 6. Order integration (Sales touch — minimal, snapshot stays)

- `POST /orders` accepts `couponCode` (already in schema): OrdersService asks
  OffersService to validate+price, writes `discountPaisa`, keeps `couponCode`
  snapshot, creates redemption rows in the same transaction.
- Automatic offers: applied on create when eligible (staff sees them in preview).
- Cancel → redemptions soft-deleted (DEC-OFR-008). Delivered → nothing (already
  counted at create; analytics reads redemptions joined to order status).

## 7. Reports / analytics (server-side — D1 lesson, no client math)

`GET /offers/analytics?days=` → per-offer: redemptions, revenue (Σ order totals),
discount given, new customers; overview KPIs. Demo fallback keeps the rich mock.

## 8. Non-goals v1 (deferred, triggers named)

Bundle/Tiered/Free-gift/BOGO/Corporate shapes (trigger: owner asks) · POS offers
(POS pass) · storefront banner/scarcity UI (W1/W3 swap) · gateway auto-cashback
(payment gateway) · Roles-gated approval (Roles module) · festival auto-scheduling
(now: plain dates; festival chips stay UI sugar) · PosDiscountRule ownership
transfer (later pass, documented in POS §).

## 9. Files

Schema: `apps/api/prisma/schema.prisma` (Offer · OfferRedemption · OfferSetting).
API: `apps/api/src/offers/*` (static routes above `:id`).
Admin: `/offers/*` screens swap from mock to `_data/api.ts` helpers (demo fallback kept).
Migration: `radian_offers_migrate.bat`.
