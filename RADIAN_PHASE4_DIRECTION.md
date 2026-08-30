# PHASE 4 DIRECTION — Product / Catalogue (written 22 Aug 2026)

> ⚠️ **STALE ADDRESSES — read this first (30 Aug 2026).** Anything below that
> names `radian-admin.vercel.app`, `radian-web-tan.vercel.app` or
> `radian-api-qnt6.onrender.com` is HISTORY, not an instruction. Vercel, Render
> and Neon are all shut down; the whole system lives on the Hostinger VPS:
> web `development.radianbd.com` · admin `admin.development.radianbd.com` ·
> api `api.development.radianbd.com`. See CLAUDE.md §2. The reasoning in this
> file is still worth reading — only the addresses are wrong.

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
   belongs in the chat.
6. **Design:** premium, emotional, clean, minimal, trustworthy. Whitespace,
   large photos, soft shadows, rounded corners, big CTAs. Brand purple / pink /
   lavender / white, rose-gold accent. A screen must never feel crowded.
   No page prose, no field hints; explanations hide behind a small "i" or a
   hover, never as loose text (owner, 21 Aug — twice).

## 2. Ship path (every single time)

```
code → tsc --noEmit (api + admin) → no-bangla selftest → commit → push main
     → Vercel + Render deploy (2–4 min) → open the demo link and LOOK
```

- admin  https://radian-admin.vercel.app
- api    https://radian-api-qnt6.onrender.com  (free tier — first call can take 30–50 s)
- web    https://radian-web-tan.vercel.app
- **Commit author must stay `green9377 <amiparboinshaallah@gmail.com>`** or
  Vercel silently BLOCKS the deployment. Never override with `-c user.email`.
- Guards to run before pushing: `node apps/api/scripts/no-bangla.selftest.mjs`,
  `apps/api/src/administration/registry.drift.mjs` after any sidebar change.

## 3. What Phase 3 closed with (do not redo)

**Items** — every screen rebuilt; item type master, sub-category, variant family
as its own page, per-variant photos; cost = purchase average (DEC-ITM-023),
sell = cost + markup; "See cost prices" permission (DEC-ADM-012); "We sell it" /
"Sell online" as two switches (DEC-ITM-024/025); **the counter sells Items, never
Products (DEC-POS-018)**.

**Purchase** — the whole circle walked live: create → receive → stock in the
right store → moving AVCO; advance orders; **line-by-line receive
(DEC-PUR-013)**; cost-jump guard (3× refusal + confirm); supplier returns cut
the due first (PUR-R08); supplier ledger reads like a bank book (day headings,
method chips, owed-after per line); **What we buy** tab from purchase history
(DEC-SUP-011).

**Inventory** — stock board as photo tiles (+ table toggle); Opening / Transfer /
Wastage use the shared `ItemPicker`; **a picker only offers what that store
actually holds**; wastage & gift reasons are a master the owner can add to,
rename and delete (DEC-GBL-004); **Wastage & Gift → Analysis tab** (day, month,
store, item, reason — value and count); stocktake sheet = that store's shelf +
"Found something else"; warehouses moved to **Setup**.

**Shop-wide (came out of Phase 3, see RADIAN_GLOBAL_RULES.md)** — one payment
method list with accounts under each (DEC-GBL-001/006), one VAT rate
(DEC-GBL-002), one company identity (DEC-GBL-003), paisa can finally be typed
(`TakaInput` + `round(taka*100)` everywhere), and both bill pages share one face
(`BillUI`: purple money rail, coloured payments, timeline).

**Self-tested live on demo, in the ledger, not just on screen:** PUR-000006/7/8,
PRT-000001, RTN-000006…12, TRF-000002, WST-000001, GFT-000001, STK-000001.

## 4. Phase 4 scope — Product / Catalogue (the website's shelf)

Pages (sidebar → What you sell): Products list · New/Edit product · Categories ·
Collections · Tags · Pricing · Offers/Coupons · the PDP as the customer sees it.

What to do, in order:

1. **Read the code first.** `apps/admin/app/products/*`, `_components/Product*`,
   `apps/api/src/products`, `catalog`, `offers`, and the storefront's PDP under
   `apps/web`. Map the circle before touching any UI.
2. **The boundary that matters:** an Item is stock, a Product is the website
   shelf, and a Product points at exactly one Item (DEC-ITM-022 / DEC-POS-018).
   Selling price on the website is the Product's; the counter price is the
   Item's. Do not let the two drift.
3. **Sweep the screens** the way Items and Purchase were swept: no page prose,
   no field hints, no invented sample data, explanations behind an "i",
   photo-first cards, the house money block wherever money appears.
4. **Verify the circles live:** publish/unpublish → the storefront changes;
   price/offer → the PDP and the cart agree; out-of-stock behaviour
   (`SoldOutMode`) matches what Inventory says; category/collection pages fill.
5. **Expect two known debts here:** the New-order form still carries a hardcoded
   delivery method/fee/slot table (DEC-GBL-005 — it must read the Delivery
   module), and Offers → Coupons still shows invented sample names.

## 5. Known gaps still open (whole system)

| # | What | Where |
|---|---|---|
| 1 | New order (admin) quotes its own delivery fees/slots instead of the Delivery module | DEC-GBL-005 |
| 2 | `ReturnReason` not yet folded into `ReasonMaster` | DEC-GBL-004 rest |
| 3 | One approval threshold for the whole system, or one per module? | owner's decision |
| 4 | One rounding rule for money, or leave each screen? | owner's decision |
| 5 | Movements / Inventory reports untouched this round (they work; never swept) | Phase 3 leftovers |
| 6 | Demo data carries the owner's test rows (bKash "sobuj/sohag" accounts, test items) | harmless |

## 6. The campaign board

| Phase | Scope | State |
|---|---|---|
| 0–2 | Baseline · Administration · Masters | CLOSED |
| 3 | Items → Purchase → Inventory | **CLOSED 22 Aug** (owner-tested) |
| 4 | **Product / Catalogue** | next |
| 5–10 | Checkout/Payment → Orders/Delivery → Returns → POS → Finance → Growth | pending |

`RADIAN_PENDING.md` stays the single live board — update it when Phase 4 opens
and when it closes, same as every phase before.
