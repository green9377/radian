# PHASE 5 DIRECTION — Checkout & Payment (written 26 Aug 2026)

This file is written for the FIRST message of a new chat. It carries what the
next session must know so nobody rediscovers the project from zero.

Read in this order: `CLAUDE.md` (the standing brief) → this file →
`RADIAN_PENDING.md` (the live board) → `RADIAN_GLOBAL_RULES.md` (what is
shop-wide and must not be duplicated).

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
5. **English only in files** — code, strings, comments, commit messages. Bangla
   belongs in the chat. When touching a file that still carries old Bangla
   comments, translate them in the same edit.
6. **Design:** premium, emotional, clean, minimal, trustworthy. Whitespace,
   large photos, soft shadows, rounded corners, big bold CTAs. Brand purple /
   pink / lavender / white, rose-gold accent. No page prose — explanations
   behind the small ⓘ (`Info`). One `MoneyBlock`, one `QtyStepper`, house
   count-cards everywhere.
7. **Demo stays sandbox.** Going real must only ever mean flipping a key.

## 2. Ship path (every single time)

⚠️ **REWRITTEN 30 Aug 2026.** Vercel and Render are gone — everything is on the
Hostinger VPS, and the VPS does NOT deploy itself. See CLAUDE.md §2.

```
code → tsc --noEmit (api + admin + web) → no-bangla selftest → commit → push main
     → VPS console: git pull + docker compose up -d --build
     → open the live link and LOOK
```

- web    https://development.radianbd.com
- admin  https://admin.development.radianbd.com
- api    https://api.development.radianbd.com
- media  https://media.development.radianbd.com

The old addresses (`radian-admin.vercel.app`, `radian-web-tan.vercel.app`,
`radian-api-qnt6.onrender.com`) answer nothing. Do not go looking there and
conclude the system is broken.
- **Commit author must stay `green9377 <amiparboinshaallah@gmail.com>`** or
  Vercel silently BLOCKS the deployment. Never override with `-c user.email`.
- Guards before pushing: `node apps/api/scripts/no-bangla.selftest.mjs`;
  `apps/api/src/administration/registry.drift.mjs` after any sidebar change.
- The owner logs into the admin himself — never ask for credentials.

## 3. What Phase 4 closed with (do not redo)

**Product/Catalogue, CLOSED 26 Aug (owner-tested).** Flat URLs + reserved-slug
guard · variant combinations (colour × size) · category FAQ/trust/spec
inheritance shown on the product form (with "Use these and edit") · badge rules
(Auto/Always/Never + 90-day best-seller rank) · offer templates shelf + offer
performance on the real API · **DEC-PRD-059: unconditional automatic offers move
the DISPLAYED price everywhere** (cards, PDP headline, sizes, variants,
upgrades, bundle items — checkout still re-quotes server-side, OFR-R10) · the
PDP fully redesigned (sticky gallery + sticky buy bar, FlowerAura-style gleam,
photo upgrade cards, add-ons with ADD + QtyStepper, bundle rail, anatomy
"What's inside", date pills with Today gated on slot cut-offs per DEC-DLV-018,
live gift-card preview, buy-bar selection summary, under-buy text editable in
Storefront → Shop hours & texts) · units family rules (DEC-PUR-013 /
DEC-ITM-026 / DEC-POS-024) · one QtyStepper both apps (rule 18) ·
Categories/Collections/Products family swept to house cards + ⓘ.

⚠️ Demo leftovers from Phase 4: test offer **OFR-000027 (10% Fresh flower) may
still be RUNNING** — pause it in Offers before comparing prices. The design
scratch page `apps/web/app/preview/pdp-ideas/` can be deleted once the owner
agrees.

## 4. What ALREADY EXISTS in checkout/payment (read before touching)

More is built than the campaign board suggests. **Code is truth** — the circle
was built in July–August and parts are owner-tested:

**Storefront checkout** (`apps/web/app/_components/Checkout/*`,
`apps/api/src/shop/checkout.ts` ~1400 lines):
- Steps: fields → delivery → payment → review. Server-side quote is the ONE
  rule the file enforces: **the client never sends money** — the API re-prices
  lines, delivery fee, offers (OFR-R10), first-order discount (OFR-R02).
- Delivery menu from the Delivery module (DEC-DLV-011 zone × cart sieve,
  DEC-DLV-019 blackouts, slot load DLV-R05 warn-only for admin / hard for web),
  promised-by resolution (DEC-INT-003).
- COD vs online (`paymentMethod: 'online' | 'cod'`), personalisation
  requirements (DEC-PRD-048), bundles as own lines (DEC-MOD-003), variant on
  the line (DEC-PRD-014), phone = customer identity (DEC-CUS-002), recipient
  filed under the customer (DEC-CUS).
- Track order (`/track`, DEC-SAL-003 — same status engine as admin).

**SSLCommerz** (`apps/api/src/shop/payment.ts`, sandbox-first per owner 3 Aug):
- session → gateway → IPN + browser return → **we validate back with `val_id`
  before writing money** (never trust the redirect); amount checked against the
  FROZEN `PaymentSession.amountPaisa`; idempotent settle (IPN and redirect race
  safely); currency check; short-payment recorded and left visible as due;
  credentials from Administration → Integrations (admin-switchable
  Sandbox/Live, env fallback, public testbox last); `/pay/{orderNo}` due link;
  payment-failed recovery message queued on fail/cancel.
- ⚠️ This file still carries a few OLD BANGLA comment blocks — translate on
  first touch.

**Money on the order** (`orders.service.ts addPayment`): increment-only
(ORD-REV-2), collect ≤ outstanding, refund ≤ collected (REV-M8), then
`finance.onPaymentRecorded` books it: ADVANCE/PAYMENT as liability→receivable,
COD_COLLECTED into Cash-with-carrier per rider/courier (DEC-FIN-021), REFUND
out of the money account. DEC-SAL-013 cancellation ladder is BUILT and
owner-locked (50% of what was PAID after work started, all before, nothing
after handover).

## 5. Phase 5 scope — what actually remains

This phase is the owner **hands-on testing the full circle on demo** plus the
gaps below. Order of work:

1. **Read the code first** — the files above, `PayView.tsx`,
   `OrderSuccessView.tsx`, `useCheckoutStore`, `finance-events.service.ts`.
   Map before touching.
2. **Walk the whole money circle live yourself** before showing anything:
   web order (online, sandbox card) → success page → order paid in admin →
   journal entry; again for fail / cancel / COD; `/pay/{orderNo}`; short
   payment. RUN_TESTS covers parts of this — extend where it does not.
3. **Known gaps found in the 26 Aug survey:**
   - **No admin screen shows `PaymentSession` rows.** When a customer says "I
     paid but the order shows due", the truth sits in `PaymentSession.raw`
     reachable only by SQL. An Orders-side "Online payments" view (sessions
     with status, amount, gateway verdict; a door from the order) is the
     reconcile screen the shop will need on day one.
   - **Which money account does online money land in?** `moneyAccountFor(
     'online', accountId?)` — SSLCommerz settles into a bank account later, so
     check the mapping is a real account the owner named (DEC-GBL-006), not a
     silent default.
   - **Online REFUND goes back manually** (bKash/cash out) — the SSLCommerz
     refund API is not integrated. Ask the owner whether manual is the rule or
     the gateway refund is wanted; do not build unasked.
   - **Checkout UI sweep** to the house language (rule 16/17 — bold buttons, ⓘ
     instead of prose, MoneyBlock arithmetic shape on the summary). The
     storefront checkout predates those rules.
   - **Order edit (admin)** still wears its own money UI — the cosmetic
     MoneyBlock pass deferred from the 21 Aug list (logic is right, face is
     old).
   - **Payment-failed recovery** (`queuePaymentFailed` → `sendDue`) — verify
     the message actually goes out on demo channels, not just queues.
4. **Sweep, then verify circles live** — same pattern as Phases 3–4.

## 6. Open business questions for the owner (ask FIRST, one at a time)

1. Online refund: manual send-back stays the rule, or integrate the SSLCommerz
   refund API?
2. Which real account receives SSLCommerz settlements (bank? which one?) — so
   Finance shows gateway money where the owner expects it.
3. Advance/partial payment on WEBSITE orders: today the web takes full amount
   or COD. Should the site offer "pay half now" (common for big/custom
   orders), or is that admin-only?
4. `prepaidOnly` products refuse COD — is the refusal wording his, and should
   the PDP say it before checkout does?
5. A short payment leaves the order part-paid on the due board — who chases
   it, and with what message?

## 7. Known gaps still open (whole system, carried forward)

| # | What | Where |
|---|---|---|
| 1 | `ReturnReason` not yet folded into `ReasonMaster` | DEC-GBL-004 rest |
| 2 | One approval threshold for the whole system, or one per module? | owner's decision |
| 3 | One rounding rule for money, or leave each screen? | owner's decision |
| 4 | Movements / Inventory reports never swept (they work) | Phase 3 leftovers |
| 5 | Order edit money UI cosmetic pass | this phase, §5.3 |
| 6 | Demo data carries the owner's test rows | harmless |

## 8. The campaign board

| Phase | Scope | State |
|---|---|---|
| 0–2 | Baseline · Administration · Masters | CLOSED |
| 3 | Items → Purchase → Inventory | CLOSED 22 Aug |
| 4 | Product / Catalogue | **CLOSED 26 Aug** (owner-tested) |
| 5 | **Checkout & Payment** | next |
| 6–10 | Orders/Delivery → Returns → POS → Finance → Growth | pending |

`RADIAN_PENDING.md` stays the single live board — update it when Phase 5 opens
and when it closes, same as every phase before.
