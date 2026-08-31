# PHASE 7 DIRECTION — written 31 Aug 2026, for the first message of a new chat

**Read in this order:** `CLAUDE.md` (the standing brief) → **this file** →
`RADIAN_ORDER_MAP_AND_TESTS.md` (what an order touches, and the 39 tests) →
`RADIAN_PENDING.md` (the live board).

`RADIAN_PHASE6_DIRECTION.md` is **history now** — open it only to see what a
Phase 6 decision was and why.

---

## 1. How we work (the owner's standing orders — unchanged)

1. **One page or feature at a time.** Nothing new starts until the owner has
   seen the last thing and said so.
2. **Never invent a business rule.** Ask. Guessing is the most expensive
   mistake on this project.
3. **Say when there is a better way** — with the reason. Agreement alone is not
   help.
4. **Verify before reporting.** The owner sees work ONCE, finished.
5. **English only in files** — code, strings, comments, commit messages, and
   these `.md` files. Bangla belongs in the chat. Touching a file that still
   carries old Bangla comments means translating them in the same edit.
6. **Design:** premium, emotional, clean, minimal, trustworthy. No page prose —
   explanations behind the ⓘ. One `MoneyBlock`, one `QtyStepper`, one `Said`,
   house count-cards, bold clear buttons.
7. **This is not a demo** (owner, 30 Aug). Real orders, real books; only the
   GATEWAY KEY is sandbox. Write "the system", or the address.
8. **Every movement of money lands in Finance** (owner, 30 Aug). Income or
   cost, wherever it happens. If it did not reach Finance, treat it as not
   having happened.

## 2. Ship path — and the trap that cost an hour twice

```
code → tsc --noEmit (api + admin + web) → no-bangla selftest → commit → push
     → VPS console: git pull && docker compose … up -d --build <services>
     → git log --oneline -1 ON THE VPS  ← do not skip this
     → open the live link and LOOK
```

⚠️ **A deploy that never ran looks exactly like a bug.** Twice on 31 Aug the
console command went to a window that was not listening; the code was right and
the behaviour was old, and the obvious conclusion was the wrong one. **Check
`git log --oneline -1` on the VPS before concluding anything about behaviour.**

⚠️ **The hPanel "Web console" button moves.** Clicking fixed coordinates
silently misses it. Find it in the DOM and click it there:

```js
window.__u=null;
window.open=function(u){window.__u=u; return {focus(){},close(){},closed:false};};
[...document.querySelectorAll('button')].find(e=>/web console/i.test(e.textContent||'')).click();
// then navigate to window.__u
```

- web `https://development.radianbd.com` · admin `https://admin.development.radianbd.com`
- api `https://api.development.radianbd.com` · media `https://media.development.radianbd.com`
- commit author stays `green9377 <amiparboinshaallah@gmail.com>`
- the owner logs into the admin himself — never ask for credentials

## 3. Phase 6 is CLOSED. What it changed, in one table

Everything below was walked on the system before it was reported.

| | what it was | now |
|---|---|---|
| **6.1** | two ways to give a parcel to a carrier, one of them invisible to Delivery | one path. `POST /orders/:id/courier` is gone |
| **6.2 · REV-C4** | Orders → Reports did its arithmetic on the first 100 orders | `GET /orders/report` counts in Postgres; checked against psql |
| **6.3 · DEC-DLV-016** | the settle screen asked `duePaisa`, which delivery had already zeroed — so every COD parcel read *prepaid*, the cash could never be remitted, and the parcel left the board with the money still in 1110 | it reads the COD_COLLECTED payment. Whole chain walked: `RMT-000001`, `RMT-000002` |
| **6.4** | 9 blocking `alert()`/`prompt()` on the delivery board | gone, and then all 46 in the rest of the admin |
| **6.5** | retry · bulk · prepaid settle · full slot · blackout · promise | all walked |
| **DEC-DLV-021** | swapping a carrier mid-journey counted as a failure, then dead-ended | `SWAPPED` status; the new carrier can leave |
| **DEC-DLV-022** | the fail reason was free text in a `prompt()` | picked from `ReasonMaster` (purpose `DELIVERY_FAIL`), label snapshotted |
| **DEC-SAL-015** | COD refused on any CRAFTED line — 22 of 24 products | gift and "payment required" only |
| **DEC-SAL-016** | the customer's order page was a frozen browser snapshot | it asks the shop; five real step times on `Order` |
| **DEC-PRD-061** | "Tap to upload" kept the file NAME; no file ever left the device | uploaded, on the line, downloadable |
| **DEC-PRD-014** | a variant order read as the parent product in the admin | the variant leads the line |

**The one thing Phase 6 did not finish:** variant photos. That is **data, not
code** — Products → the product → **Variants**, one photo per combination. The
cart, checkout and order snapshot already read `variant.imageUrl ?? product
image`, and the API falls back to the master value's photo.

## 4. What is on the table for Phase 7

Nothing here is chosen. **Ask the owner first** — this is a menu, not a plan.

### Measured, real, and nobody has decided about them

1. **The missed-promise list (DEC-DLV-023).** The owner asked for it on 30 Aug
   — a missed 2-hour / same-day / midnight promise gets flagged and collected
   into a follow-up list, with the call or compensation left to a person. He
   later said **no auto follow-up on a FAILED delivery**; whether that also
   retires this list was never settled. **Ask.** Both halves of the comparison
   now exist: `Order.promisedBy` and `Order.deliveredAt` (DEC-SAL-016).
2. **9,598 lines of Bangla comments** still in 250 files, cleared 303 so far.
   The rule is nothing new ever; the backlog is swept file-by-file as files are
   touched. A deliberate pass is possible but has never been asked for.
3. **Meta webhooks still point at the dead Render host** (see PENDING). WhatsApp,
   Messenger and Instagram messages stop arriving with **no error anywhere**.
   The docs are fixed; Meta's own dashboard is not.
4. **`WHATSAPP_*` and `RESEND_API_KEY` were never set anywhere** — not on
   Render either. Those features are silently off until keys exist.

### Modules that have never had a Phase

Orders, Delivery, Checkout, Payment and Returns have been walked. **POS,
Inventory, Purchases, HR/payroll, Marketing and Intelligence have not.** Each
has code and screens; none has had somebody walk it with the owner and find
what Phase 5 and 6 kept finding — a screen that lies about a rule that is
itself correct.

⚠️ **The pattern worth carrying:** every fault this project has found lived at
a **seam** — two doors to one fact, a screen computing what the database should
count, a column read by one module and zeroed by another. Not inside a module.
Walking a whole circle end to end is what finds them; type-checks and code
reading never did.

## 5. Test rows left on the system

Real rows in the real books. **Not cleaned up on purpose** — several are
delivered, with revenue posted and cash settled, so cancelling them now would
write refunds that never happened. All are named "TEST · do not deliver".

`RAD-92283` · `RAD-51013` · `RAD-75470` (delivered, settled, `RMT-000001`) ·
`RAD-52077` (delivered, prepaid settlement) · `RAD-86607` (delivered, settled,
`RMT-000002`) · `RAD-57835` (9 Sep, Morning slot) · three from the bulk-assign
walk · `RAD-76123` (out for delivery with no assignment — the old two-door
state, fixed for anything new).

Also: assignments `DLV-000001`–`DLV-000010`, and the *Anniversary GIFT* product
still carries `stockQty: 5` from a Phase 5 return test.

**Put back after testing** (checked, not assumed): the Morning slot's capacity
is 10 again, and the 11 Sep blackout is deleted.

## 6. Traps this project has already sprung

| trap | what happens |
|---|---|
| a deploy that never ran | the code is right, the behaviour is old, and the wrong conclusion is the obvious one. Check `git log -1` on the VPS |
| `alert()` in an action handler | the admin looks frozen; the rule was right all along. Use `Said.tsx` |
| a screen computing from a paged list | numbers look right under 100 rows and lie past it |
| two doors to one fact | one of them will be silent. The courier bug, the out-for-delivery bug, the COD rule — all this shape |
| a column one module zeroes and another reads | the settle screen called every COD parcel prepaid for a month |
| `isActive` used to find a finished delivery | DEC-DLV-015 — it will not find it |
| a soft-deleted row keeps its number | number generators read the raw client and retry on P2002 |
| routes under a `:id` route | put static routes ABOVE `:id` |

---

_Phase 6 closed 31 Aug 2026. Phase 7 opens on the owner's word._
