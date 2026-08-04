# Radian — what is deliberately unfinished

Last updated **29 Jul 2026**.

This file exists so nothing gets lost between now and the final revision. Every
line here is something we **chose** to leave, not something we forgot. Each says
what is missing, why it is missing, and what has to happen before it can be done.

Rule for this file: when something is finished, strike it through with the date
rather than deleting it. A list that only shows what is left cannot be checked
against what was decided.

---

## 1. Loyalty — no customer-facing surface  · MKT-D21

**Built and working:** earning (1 % of goods − discount, on delivered),
reversal on cancellation, the 20 % spending cap, the ledger, the liability
report, the admin screen, the nightly sweep.

**Missing:**

| | What | Blocked on |
|---|---|---|
| a | The **storefront** cannot show a customer their points, or spend them at checkout | Ecommerce — `apps/web` has no API calls at all yet |
| b | **POS** has no points tender, so a walk-in cannot spend points | POS pass |
| c | Points are not shown on the **customer's own page** in the admin | small; do it with the Customers pass |

**When those are built, all three must call `LoyaltyService.quote()` and
`redeemForOrder()`.** The 20 % cap lives in exactly one place and has to stay
there — the whole reason the "points into store credit" door was closed on
29 Jul is that a second door made the rule optional.

**Before switching Loyalty on:**

1. Import the radianbd.com customers.
2. Seed opening balances — `/marketing/loyalty` → *Put points in by hand* →
   tick **opening balance** (records `reason: OPENING`).
3. Then, and only then, switch `loyaltyEnabled` on.

Doing it the other way round puts a customer who has bought forty times level
with a stranger. That impression cannot be made twice.

---

## 2. WhatsApp — every message is still sent by hand  · MKT-D18

Templates, audience lists, broadcast queue and the send log all work. A person
presses the button and WhatsApp opens with the message filled in.

**Blocked on the owner:** whether the shop has WhatsApp **Business API** access
or only the **WhatsApp Business app**. These are routinely confused and only the
first can send by itself. Writing the integration before checking risks
throwing it away.

---

## 3. Google Ads spend  · MKT-D20

Meta is done. Google's API needs a developer token that Google approves by
hand; the wait is measured in weeks. **Apply, then wait.** Nothing else to do.

---

## 4. CMS — and it does not belong to Marketing

`ContentPage`, `JournalPost` and `FaqEntry` exist in the database and
`apps/api/src/content/content.service.ts` is written. There is **no module, no
controller and no screen**, so none of it is reachable. **No migration needed.**

It was drafted under Marketing because SEO landed there. That was wrong — About
Us, Refund Policy, Terms and the journal are the shop's own words, not
marketing. **It belongs to Ecommerce/Content and should be finished there.**

Worth remembering: bKash and SSLCommerz both want to see a live Refund Policy
and Terms page before they approve a merchant account.

---

## 5. Attribution rung 3 is empty  · MKT-D02

`utmSource` / `utmMedium` / `utmCampaign` are captured on `Order` and the
matching logic is built and tested. The columns stay empty until the new
storefront forwards them on order creation. Rungs 1, 2 and 4 carry the load
meanwhile, and the quality report says honestly how much is unattributed.

---

## 6. The owner's own decisions, still open

| | Question | Where |
|---|---|---|
| 1 | The **WhatsApp message** in his own words — the placeholder is mine and reads like a translation | `/marketing/settings` |
| 2 | Add **foodpanda** and **Sugary** as channels | `/orders/channels` |
| 3 | **Is the marketplace commission recorded in Finance?** If not, reported profit on those orders is overstated. Outside Marketing, but it must not be lost | Finance |
| 4 | Hold days after delivery — should match the real return policy (default 7) | `/marketing/settings` |

---

## 7. Things found and fixed, kept here so they are not re-introduced

- **29 Jul — Chrome autofill was filling credential boxes.** The ad account id
  box was offered the saved username; the token boxes were offered the saved
  website password. `autoComplete="off"` is ignored by Chrome; only
  `autoComplete="new-password"` is obeyed. Fixed on the Ad numbers, Tracking and
  Email/SMS screens. **Any new key or token box needs the same treatment.**
- **29 Jul — a self-test that passed for the wrong reason.** The "an existing
  customer cannot be referred" check passed because the fixture customer had
  `ordersCount = 0`, not because the rule worked. Deleting the rule would not
  have failed the test. Fixed. **Worth re-reading any test that has never gone
  red.**
- **29 Jul — points into store credit was doubly wrong** (see MKT-D21). Removed.
- **28 Jul — document numbers must be generated from the RAW Prisma client.**
  A soft-deleted row still holds its number in the unique index, so counting
  through `prisma.db.*` reuses it. This was a real bug in `campaignNo`.
- **30 Jul — `findUnique` through `prisma.db.*` was never soft-delete filtered.**
  113 call sites across the API, 28 in Marketing. It allowed a payout to a
  deleted affiliate and commission/points on a deleted order. Fixed once in
  `soft-delete.extension.ts` by filtering *after* the query. **The remaining
  limit is nested `include`.** ~~That still needs a hand check.~~ **Hand check done
  30 Jul.** A sweep of every nested include on a soft-deletable relation returned 30
  sites; **27 were correct as written**, and most of those would have BROKEN if
  filtered, because their models carry no `deletedAt` at all — the REV-RTN-4 trap in
  reverse (StockIssueLine, StocktakeLine, JournalLine, PayrollLine,
  AssemblyProductionLine, VariantValue, AddOnGroupItem, SupplierPaymentAllocation).
  Two were real:
  **NST-REV-1** — the supplier PAYABLES AGEING report summed soft-deleted
  `PurchasePayment` rows into `paid`, so `due` came out SMALLER than it is: a money
  report understating what the shop owes. The parent query two lines above it already
  filtered `deletedAt: null`, so soft delete was known about — the nested relation just
  was not covered by the thing being relied on.
  **NST-REV-2** — the product list showed deleted add-on groups, on the line directly
  BELOW a `tags: { where: NOT_DELETED }` that got it right.
  Both fixed. See §13 of the Marketing architecture.
- **30 Jul — a status field that nothing reads is not a rule.** `remove()` on an
  affiliate set `status: 'PAUSED'` and no code path ever looked at it, so
  pausing was decoration for as long as the module had existed. **Worth grepping
  for any other status this system sets but never reads.**
- **30 Jul — a rule that holds on one channel is not a rule.** The opt-out
  (MKT-RULE-009, "exception: none") was enforced on WhatsApp twice and on Email
  and SMS not at all. Also: the first fix put the guard *below* the "no key
  saved" check, so it refused for the wrong reason and would have started
  letting sends through the day a key was pasted in. **Guards for rules with no
  exception go first, above anything about configuration.**
- **`postEntry()` returns `null` on a duplicate `sourceKey`** and the return
  value MUST be checked (DEC-FIN-023 / HR-R28 / MKT-RULE-016). Unchecked, a
  screen says "paid" over an empty ledger.
- **29 Jul — `upsert` on a singleton is NOT enough, and one file still assumes
  it is.** Building Intelligence, the dashboard 500'd on its very first load
  with `P2002: Unique constraint failed on (id)` from
  `intelligenceSetting.upsert()`. Prisma only compiles an upsert into an atomic
  `INSERT … ON CONFLICT` under some conditions; otherwise it is still
  SELECT-then-INSERT, and two requests arriving together both insert. A React
  effect in dev fires the same fetch twice, so this is not rare.

  Looking for the same shape elsewhere turned up **eight singleton accessors
  across seven modules**, in three flavours, and the §8 lesson had reached only
  three of them:

  | Shape | Where |
  |---|---|
  | `findUnique`/`findFirst` → `create` — the pattern §8 forbids, still in use | Inventory · POS · Returns · Offers · Finance (`ensureSeed`) |
  | `upsert`, believed safe, is not | Marketing settings · Tracking · Messaging · SEO |

  **All eight now go through one helper, `apps/api/src/common/singleton.ts`.**
  Not eight hand-written `catch` blocks — those would drift apart again the
  moment a ninth singleton is added, which is exactly how five of these got
  missed the first time.

  The helper is four lines of idea: try to create, and if somebody else got
  there first, read *their* row. A default settings row is not worth failing a
  page over.

  Fixed 29 Jul, with the owner's go-ahead.

---

## 7b. On-time delivery has never been a real number  · DEC-INT-003

Found 29 Jul while designing Intelligence. `/delivery/performance` shows
"On-time 94 %" and **no line in the API computes it** — it comes from
`apps/admin/app/_data/deliveryDemo.ts`. The screen carries a Demo badge, so this
was deliberate, not hidden. But it has outlived its purpose: real deliveries are
happening and the screen still reports a fixture.

It could not have been computed anyway. `DeliveryAssignment.deliveredAt` is a
real `DateTime`, but what was *promised* survives only as `Order.date` (a
`String`) and `Order.slotLabel` (a `String`, `"10:00–13:00"`) — text to read, not
something comparable to a clock.

`Order.promisedBy DateTime?` was added by `radian_intelligence_migrate.bat`.
**Two things still to do, and both belong to Delivery/Sales, not Intelligence:**

| | What | Where |
|---|---|---|
| a | ~~fill `promisedBy` at order creation, from date + slot~~ **Done 30 Jul** — `orders/promise.ts`, wired into create AND edit | Orders service |
| b | ~~Point `/delivery/performance` at the real figure~~ **Done 29 Jul** | Delivery |

**(b) is built.** `apps/api/src/delivery/delivery-analytics.service.ts` computes
on-time, by-zone, by-rider, failed rate and delivery margin for real, and
`GET /delivery/performance` serves it. It lives in **Delivery**, not
Intelligence — the verdict on whether a parcel was on time belongs to the module
that carried it, and two modules computing it would mean two answers.

It currently reports *"no delivery has a promised time yet"* rather than a
number, which is correct and will stay correct until **(a)** is done. The
`deliveryDemo.ts` fixture can be deleted from the admin panel once the
`/delivery/performance` screen is repointed at the new endpoint.

Old orders keep `promisedBy = null` for ever. They are reported as
**unmeasurable**, never as late, and the count of them is shown — a percentage
that hides its own denominator is how a number stops being true.

---

## 7c. ~~Two self-tests do not type-check~~ · found 29 Jul, **both closed 30 Jul**

`radian_check_and_restart.bat` runs a second, wider check that includes the
self-test files. It currently reports two errors, both **pre-existing** and both
harmless to the running API — `tsconfig.build.json` excludes self-tests on
purpose, so the build and the restart are unaffected.

| File | Error | What it means |
|---|---|---|
| `hr/hr.selftest.ts:395` | `privateHidden` does not exist on the returned employee type | the service adds the field at runtime but the type does not admit it. The check `asManager.privateHidden === true` compares against `undefined` as far as TypeScript is concerned |
| `marketing/marketing.selftest.ts:865` | `gotPoints` is possibly `undefined` | strict-null gap; `undefined > 0` is `false`, so this fails loudly rather than passing wrongly |

Neither can pass for the wrong reason, so neither is the §7 "green for the wrong
reason" trap. But a test file that does not type-check is a test file nobody is
reading, and both are one line each.

**Both were already fixed by the time the 30 Jul review looked, and each carries a
comment explaining why** — `employees.mask()` now returns `T & { privateHidden?: true }`
("the test was right and the type was wrong"), and `gotPoints` is `?? 0` with a note
saying it silences nothing because the assertion still demands `> 0`. So this section
was **stale documentation**, which is the §7d lesson turned on itself: documenting a
limitation for ever is how a system fills up with footnotes nobody reads.

---

## 7d. Products and Inventory cannot report on a past window  · found 29 Jul

`ProductsService.analytics(days)` and `InventoryService.issueReport(days)` both
take **a number of days counted back from today**, not a date range. There is no
way to ask either of them about, say, last March.

Found while reviewing Intelligence: the Reports centre was computing the day
count from the chosen dates and then printing *those dates* as the heading — so
a request for March returned the last 31 days to today, labelled March. A wrong
report that looks right is worse than a missing one.

**Handled honestly for now**, not worked around: both reports are titled
"(last 30 days)", have no date picker, and carry a caveat saying why. Computing
a ranged version inside Intelligence was rejected — that would be a second
source of truth for a figure Products and Inventory own.

| | What | Where | Status |
|---|---|---|---|
| a | `analytics({from, to})` alongside `analytics(days)` | Products | ~~to do~~ **done 29 Jul** |
| b | `issueReport({from, to})` alongside `issueReport(days)` | Inventory | ~~to do~~ **done 29 Jul** |

**Both fixed the same day, at the source.** Each method now accepts either a day
count (unchanged behaviour for every existing caller) or an explicit window.
Product performance and Wastage are ranged reports again, the Inventory and
Products lenses are `rangeMode: 'full'`, and the caveats are gone because there
is nothing left to warn about.

The honest label was the right stopgap for an afternoon. It was not the answer —
documenting a limitation for ever is how a system fills up with footnotes nobody
reads. The Intelligence self-test now asserts the opposite of what it asserted
before: **a report asked for March 2019 must come back empty**, not full of this
month's figures under a 2019 heading.

---

## 8. Not started at all

- **Ecommerce ↔ API.** `apps/web` is 100 % mock — a cart and a checkout page
  with no API call behind either. Until this is done: no online orders, no
  Purchase pixel event, no UTM capture, no customer-facing points. My
  long-standing recommendation is that this is the highest-value remaining
  work; the owner has chosen to take it last.
- **SSLCommerz / bKash payment.**
- **Company Settings & Integrations** — Trade License, BIN, TIN, key store.
- ~~**Executive dashboard.**~~ ~~**Intelligence module.**~~ **Built and
  self-tested 29 Jul 2026** — all four sub-modules. Dashboard · Analytics (nine
  lenses) · Reports (ten reports) · Targets & KPIs · Forecast & market.
  88 checks, 0 failing. See `RADIAN_INTELLIGENCE_MODULE_ARCHITECTURE.md` §14.

  Two things Intelligence deliberately did NOT do, because they belong
  elsewhere: the stock runway (Inventory) and the occasion calendar (CRM).
