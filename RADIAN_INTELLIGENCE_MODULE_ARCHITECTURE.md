# Radian — Intelligence module architecture

**Domain:** Intelligence
**Status:** **Built, reviewed and self-tested — 29 Jul 2026**
**Shape:** one module, four sub-modules · all four built

This file began as the design and became the record. §1–§13 are the decisions as
they were locked, kept unedited so the reasoning can be checked against what was
actually built. §14 onwards is what happened: what was built, what broke, what
the review found, and what was deliberately left alone.

**Self-test: 88 checks, 0 failing** — `radian_intelligence_selftest.bat`.

---

## 0. What changed from the kickoff

The kickoff (`RADIAN_INTELLIGENCE_KICKOFF.md`) asked six questions. All six are
answered below. Two of them moved off the kickoff's own recommendation, and one
of those moved against my advice — recorded plainly in §4 rather than smoothed
over.

Three things were **found in the code** during the question round that the
kickoff did not know, and each changed an answer:

| Found | Where | Consequence |
|---|---|---|
| On-time delivery % is **not computed anywhere** | `deliveryDemo.ts` supplies it; no API line produces it | DEC-INT-003 · a new `Order.promisedBy` field |
| **No export capability exists** in the API at all | no pdf/xlsx/csv library anywhere in `apps/api` | DEC-INT-004 · export is new work, not plumbing |
| STAFF can read Orders and Products, but **Finance is closed to STAFF on purpose** | `finance.controller.ts` header comment | DEC-INT-005 · the dashboard is where that fence leaks |

---

## 1. Purpose

Intelligence answers three questions that today require opening five screens:

1. **What has to happen today** — the work that is stuck
2. **How the business is doing** — against a target, not in a vacuum
3. **Where the money is** — cash, owed, owing, profit

And it produces the paper other people ask for: the VAT office, the accountant,
the bank.

**Core purpose**

> One page that is worth opening every morning, and one place to get every
> report out of the system as a file.

---

## 2. Module responsibilities

### IS responsible for

- Reading figures from the modules that own them, and putting them on one page
- Comparing those figures against targets the owner sets
- Turning existing reports into PDF and Excel files
- Storing a nightly snapshot so history does not have to be recomputed
- Saying, on every figure, whether it is real or demo

### NOT responsible for

| Not this | It belongs to |
|---|---|
| Computing profit, margin, cash, break-even | `FinanceService` |
| Deciding whether a delivery was on time | Delivery / Sales — Intelligence reads the verdict |
| How long stock will last at the current rate | Inventory (see §11) |
| Creating or changing any business record | the owning module |
| Sending anything to anyone | not in this cycle (DEC-INT-004) |

**The single rule this module will break first**

Intelligence owns no business data. It reads. The moment a profit figure is
added up on the dashboard instead of asked for from Finance, there are two
profit figures in the system, and within a month nobody knows which is true.

---

## 3. Data sources

| Category | Source | Read via | Freshness |
|---|---|---|---|
| Sales, orders, channels | `Order` · `OrderLine` · `Channel` | Orders service | live |
| Money — P&L, cash, break-even | `JournalEntry` / `JournalLine` | **`FinanceService` only** | live (today) · snapshot (history) |
| VAT — Mushak 6.3 | `FinanceMushakService` | Finance | on demand |
| Stock, movement, waste | `InventoryStock` · `InventoryMovement` · `ItemExpiryLot` | `GET /inventory/overview` | live |
| Delivery | `DeliveryAssignment` · `Order.deliveryStatus` | Delivery service | live |
| Purchases, suppliers | `Purchase` | `GET /purchases/stats` | live |
| Staff | `Employee` · `Attendance` · `PayrollLine` | `GET /hr/employees/stats` | live |
| Customers | `Customer` | Customers service | live |
| Marketing | `Campaign` · `OrderAttribution` · `AdInsight` · `LoyaltyPoint` | `GET /marketing/stats` | live |

Existing summary endpoints are **called, never re-implemented**:
`/finance/overview` · `/finance/accounts/summary` · `/finance/reports/*` ·
`/inventory/overview` · `/assembly/overview` · `/purchases/stats` ·
`/hr/employees/stats` · `/marketing/stats` · `/marketing/affiliates/overview` ·
`/marketing/loyalty`.

---

## 4. Decisions

### DEC-INT-001 — one page, three sections, nothing hidden

The Executive Dashboard is a single scrolling page in this order:
**Today → Business → Money.** A jump bar at the top scrolls to a section; it
does not hide the others.

The owner first chose three tabs. The objection put to him, and the reason he
changed it: a tab is a promise that content exists, kept by hiding it. Whichever
two tabs are not open stop being read within a month, and the decision "which
tab opens first" is the original question wearing a different hat. Scrolling is
free; clicking is a decision the reader has to justify to themselves each time.

His real concern — twenty numbers on one screen is a crowd — is met a different
way: **four to six figures per section**, everything else behind a *Details*
link to the screen that already exists.

**Not decided yet:** exactly which lines appear in each section. That waits on
the KPI target values (§11), because "how the business is doing" cannot be
written before there is something to be doing well against.

### DEC-INT-002 — today live, history from a snapshot

Today's figures are computed on request. Anything older than today is read from
`DailySnapshot`, written once per night.

Counting today's thirty or forty orders is instant. Recomputing six months of
history on every page load is waste — and last June's sales will not change
again. A morning work list that is an hour stale is worse than useless, so that
half stays live.

The nightly job follows the existing pattern in
`marketing/automation.service.ts`, including the part that matters most here —
its own comment says *"the shop laptop is not on at 2 AM, so catch up shortly
after boot"*. This is **reconciliation, not a cron promise**: a missed night is
filled by the next run, and a run that finds gaps fills all of them.

The snapshot table is also the thing that makes a real forecast possible in a
year's time. Not starting it today means starting from zero in a year.

### DEC-INT-003 — three KPIs, colour only, and a missing field

**The KPIs:** monthly sales · gross margin % · on-time delivery %.

**Missing the target does nothing but change a colour** — green, amber, red,
with "82 % of target" beside it. No message, no notification. A monthly target
is unmet for most of the month by definition; a system that says so every day
teaches the reader to ignore it, and then it is also ignored on the day it
matters.

**On-time delivery % cannot be computed today.** `/delivery/performance` shows
"On-time 94 %" from `deliveryDemo.ts`; no line in the API produces that number.
The schema says why: `DeliveryAssignment.deliveredAt` is a real `DateTime`, but
what was *promised* survives only as `Order.date` (a `String`) and
`Order.slotLabel` (a `String`, e.g. `"10:00–13:00"`). The promise is stored as
something to read, not something to compare.

So: **`Order.promisedBy DateTime?`**, filled at order creation from the date and
the slot. Then on-time is `deliveredAt <= promisedBy` and nothing has to be
parsed at read time — a label like `"10:00–13:00"` will be renamed one day, and
a parser would then be quietly wrong rather than loudly broken.

**This field is not Intelligence's.** A delivery promise is Sales/Delivery
business data. Intelligence reads it. It is logged as a cross-module change in
§9 so it is built there, once, rather than reconstructed here into a second
on-time percentage.

Old orders keep `promisedBy = null`. The screen states its denominator —
*"94 %, of 340 orders · 118 older orders have no promised time"* — rather than
silently reporting a percentage of whatever happened to be measurable.

### DEC-INT-004 — one report centre, files on demand, nothing sent

`/intelligence/reports` gathers every report that already exists, adds date
selection, and offers **PDF** and **Excel**. Mushak 6.3 prints on the government
form. Nothing is emailed and nothing is generated on a schedule.

Asked who actually needs paper, the owner named three: the **VAT office**
(Mushak 6.3, monthly, mandatory), the **accountant** (monthly/annual, wants
Excel), and the **bank or licensing** (occasional, wants PDF).

That is roughly twenty-four button presses a year. Against that: automatic
sending needs email attachments — which `messaging.service.ts` does not support,
it sends bodies only — plus a schedule and a delivery log. And a send that fails
fails silently. The accountant does not get the file, and nobody finds out until
the month is closed. This is the §4-ছ trap from the kickoff: prefer the thing a
person can see did not happen.

**There is no export capability in the system at all** — no PDF, Excel or CSV
library anywhere in `apps/api`. This decision is therefore new work, not the
wiring together of existing parts, and §13 sizes it accordingly.

### DEC-INT-005 — the dashboard must not unlock what Finance locked

| Role | Sees |
|---|---|
| **STAFF** | Today section · sales counts and order values |
| **MANAGER** | everything, including margin, cost, cash and profit |
| **OWNER** | everything, plus setting KPI targets |

This copies the line the system already draws rather than inventing one.
`finance.controller.ts` closes the whole module to STAFF on purpose — its own
comment: *"a salesperson should not be able to read what a bouquet cost us or
how thin this month was."* Orders, Products and Inventory have no role gate at
all, so STAFF already sees order values.

Intelligence is where that fence leaks, because Intelligence reads from
everywhere. "Gross margin 46 %" on a dashboard every employee can open makes the
Finance restriction decorative — a locked door beside an open window.

**Enforced in the API, not the screen.** A hidden section that still arrives in
the JSON is not a restriction.

MANAGER seeing profit is not a new grant: MANAGER can already open
`/finance/overview`.

### DEC-INT-006 — Forecasting and market analysis, built on demo data

**The owner has chosen to build the fourth sub-module now, with demo data, and
to include market-demand analysis. This was against my recommendation. The
objection is recorded here in full, because a decision is only reviewable if the
argument against it survives beside it.**

*The objection, twice put:*

Forecasting needs history and Radian's books restart from zero. Worse than
"not enough data" — a flower shop in Bangladesh is violently seasonal.
Valentine's Day, Pohela Falgun, Mother's Day, wedding season, Eid: a handful of
days outsell whole months. A model trained on six months has never seen a single
peak, and a model trained on February would recommend buying at Valentine's
volume all year. `ItemExpiryLot` exists because flowers rot, so an over-forecast
is not an embarrassing number on a screen — it is money in a bin.

And the storefront precedent does not carry. Mock data on the storefront is
*decoration*: "Rakib Hasan, 96 %" is visibly invented. A forecast is *a number
you are meant to act on*, and no one can tell by looking whether "৳12 lakh next
month" came from arithmetic or from a fixture file.

The proof is in this system already. `/delivery/performance` was built to be
wired up later. Real data arrived; the screen still shows fixture numbers,
because "wire it up later" was a thing a person had to remember, and people do
not.

Market analysis is a further step again: competitor prices, what people are
searching for, what is selling elsewhere. **Radian has no source for any of it,
and no module plans one.** Without a source it is not analysis, it is
well-formatted guessing.

*The decision, and the five conditions attached to it:*

The owner decided to build it. The following are not optional — they are what
keeps the delivery-screen failure from repeating:

1. **One file.** Every demo figure lives in `intelligence.demo.ts`. The delivery
   problem was never that fixtures existed; it was that nobody knew where.
2. **Provenance travels with the figure.** Every API response carries
   `source: "REAL" | "DEMO"` per figure. The API decides, not the screen — a
   screen that decides can be told to lie.
3. **The switch is automatic.** When `DailySnapshot` holds enough days, the
   endpoint returns real figures and says so. **No human has to remember
   anything.** This condition is the whole point; the other four are hygiene.
4. **The badge is at the top.** The existing `DemoBadge` component, above the
   content, not under it.
5. **The self-test proves both directions** — that a demo figure never reaches a
   purchase or stock recommendation, and that with insufficient snapshots the
   API really does answer `DEMO`.

**Market analysis stays `DEMO` permanently** until a data source exists. The
screen says so in words. It does not get a countdown, because there is nothing
to count down to.

### DEC-INT-007 — Intelligence owns exactly two tables, and one is a cache

`DailySnapshot` and `KpiTarget`, plus an `IntelligenceSetting` singleton.

This does not break "Intelligence owns no business data":

- **`KpiTarget`** is a management goal, not a business transaction. No other
  module wants it. Nothing downstream reads it.
- **`DailySnapshot`** is **a cache, never a source.** Every figure in it was
  computed by the module that owns it and copied here for speed. If a snapshot
  row ever disagrees with the source, **the source is right and the row is
  rebuilt** (INT-R02). No report may cite a snapshot for a period the source can
  still be asked about directly.

### DEC-INT-008 — when two sources disagree, show both

The pattern already exists on `/marketing/loyalty` — the points ledger and
account 2130 shown side by side with an `agrees` flag, and a red banner when
they part. Intelligence reads from nine modules and will meet this repeatedly.
**No figure is chosen for looking tidier.** Both are shown, and the disagreement
is the headline.

---

## 5. Business rules

| ID | Rule | Exception |
|---|---|---|
| **INT-R01** | Intelligence computes no figure another module computes. It calls the owner. | none |
| **INT-R02** | `DailySnapshot` is a cache. On disagreement the source wins and the row is rebuilt. | none |
| **INT-R03** | Every figure returned carries `source: REAL \| DEMO`, decided by the API. | none |
| **INT-R04** | Two sources for one figure → both shown, plus a banner when they disagree. | none |
| **INT-R05** | The snapshot job is reconciliation: it fills every missing day it finds, up to 90 days back. | beyond 90 days, by hand |
| **INT-R06** | A `DEMO` figure never reaches a purchase, stock or pricing recommendation. | none |
| **INT-R07** | A day is snapshotted only after it has closed (00:30 BD). Today is never snapshotted. | none |
| **INT-R08** | STAFF is never sent cost, margin, profit or cash — enforced in the API. | none |
| **INT-R09** | A percentage states its denominator and how many rows could not be measured. | none |
| **INT-R10** | `prisma.db.*` everywhere; `deletedAt: null` written by hand in `groupBy`, `findUnique`, `upsert` and nested includes. | none |
| **INT-R11** | Money is integer paisa. Rates are basis points (1000 = 10 %). | none |
| **INT-R12** | A KPI target with no value set shows the figure with no colour — never green by default. | none |

---

## 6. Metrics and KPIs

| KPI | Formula | Source | Target set by | Miss behaviour |
|---|---|---|---|---|
| **Monthly sales** | income for the month | `FinanceService` | OWNER, per month | colour only |
| **Gross margin %** | `grossMarginBp` | `finance-reports.service.ts` | OWNER, per month | colour only |
| **On-time delivery %** | `deliveredAt <= promisedBy` ÷ delivered | Delivery, via `promisedBy` | OWNER, per month | colour only |

Supporting figures shown without targets: order count, average order value, new
customers, cash in hand, receivable, payable, inventory value, break-even
progress.

**`DailySnapshot` — one row per closed day**

`onDate` (unique) · `revenuePaisa` · `cogsPaisa` · `grossProfitPaisa` ·
`ordersCount` · `avgOrderValuePaisa` · `newCustomers` · `deliveredCount` ·
`onTimeCount` · `measurableDeliveries` · `inventoryValuePaisa` ·
`cashBalancePaisa` · `computedAt`

Every one of these is **fetched from its owning service** for that day's range
and stored. None is computed here.

---

## 7. Shape of the module

```
Intelligence
├── /intelligence                    Executive Dashboard   (DEC-INT-001)
├── /intelligence/reports            Reports centre        (DEC-INT-004)
├── /intelligence/kpis               Analytics & KPIs      (DEC-INT-003)
└── /intelligence/forecast           Forecasting & market  (DEC-INT-006, demo)
```

Sidebar shows `INTELLIGENCE · 4` — one module, four sub-modules. It is not four
modules and the Executive Dashboard is not a module.

---

## 8. Owned entities

| Entity | What it is | Notes |
|---|---|---|
| `DailySnapshot` | one row per closed day, all figures copied from source | cache · INT-R02 |
| `KpiTarget` | `(year, month, kpi)` → target value | OWNER only |
| `IntelligenceSetting` | singleton — RAG bands, snapshot threshold for the demo→real switch | **must be added to `NO_SOFT_DELETE`** |

`IntelligenceSetting` has no `deletedAt`. Without the `NO_SOFT_DELETE` entry
every call returns 500 — the kickoff §4-চ trap, met five times already.

---

## 9. Cross-module log

| # | Change | Owner | Why it is not Intelligence's |
|---|---|---|---|
| 1 | `Order.promisedBy DateTime?`, set at order creation from date + slot | **Sales / Delivery** | the delivery promise is a business fact; Intelligence reads the verdict |
| 2 | PDF + Excel helper in `common/export/` | shared infrastructure | each report's *numbers* stay with the module that owns them; Intelligence asks and formats |
| 3 | `IntelligenceSetting` → `NO_SOFT_DELETE` in `soft-delete.extension.ts` | Intelligence | singleton without `deletedAt` |
| 4 | `/delivery/performance` should read real on-time once #1 exists | **Delivery** | it is showing `deliveryDemo.ts` today · noted so it is not left |

---

## 10. Non-goals this cycle

- **No new business reports.** Existing ones are gathered, not rebuilt.
- **No scheduled generation and no sending.** DEC-INT-004.
- **No stock runway** — "how many days will red roses last at this rate" is
  Inventory's question, and building it here is exactly the §4-ক trap. Raised in
  §11 for Inventory instead. Today's `reorderLevel` is a fixed number, so the
  same "below 50" warning means half a day in February and two weeks in July.
- **No writes to any business table.** Intelligence has no write path except its
  own three tables.
- **No occasion calendar.** Festival dates are real and useful, but they belong
  to CRM's occasion reminders (Tier 2 in `RADIAN_MODULE_PRIORITY.md`).

---

## 11. Open — the owner's to decide

| | Question | Needed before |
|---|---|---|
| 1 | **The KPI target numbers** — monthly sales, gross margin %, on-time % | the Business section of the dashboard can be laid out (DEC-INT-001) |
| 2 | **RAG bands** — how far below target is amber, how far is red | the KPI screen |
| 3 | **Snapshot threshold** for the forecast to go real — my recommendation is **365 days**, so a full seasonal year is seen | the forecast screen |
| 4 | Whether the radianbd.com history can be **imported as orders**, not just customers | would change #3 materially — real history beats waiting |

Item 4 is worth a real look. The existing TODO plans to import radianbd.com
*customers*. If the **orders** can come too, the forecast has a past on day one
and DEC-INT-006's whole argument changes.

---

## 12. Self-test — planned

`apps/api/src/intelligence/intelligence.selftest.ts`, run by
`radian_intelligence_selftest.bat`, in the shape of `marketing.selftest.ts`.
It creates its own fixtures, and cleans up before and after.

What it must prove:

1. **No second source of truth.** A figure on the dashboard equals the figure
   `FinanceService` gives for the same range — to the paisa. This is the test
   that matters most; it is the one that fails the day someone adds up profit
   locally.
2. **The snapshot is a cache.** Corrupt a `DailySnapshot` row, ask for the
   period, and the source's answer must win and the row must be rebuilt
   (INT-R02).
3. **Reconciliation fills gaps.** Delete three days from the middle, run the
   job, get three days back — not one, and not a silent success.
4. **Today is never snapshotted** (INT-R07).
5. **`DEMO` is honest.** With fewer than the threshold of snapshots, the
   forecast endpoint returns `source: "DEMO"`. With more, `"REAL"` — and the
   switch happens without anything being edited (DEC-INT-006 condition 3).
6. **Demo never leaks into advice.** No recommendation payload is reachable
   while any input to it carries `DEMO` (INT-R06).
7. **STAFF gets nothing it should not.** Call every Intelligence endpoint as
   STAFF and assert no cost, margin, profit or cash field is present **in the
   JSON** — not merely hidden by the screen (INT-R08).
8. **A percentage states its denominator.** On-time % with some orders lacking
   `promisedBy` reports the measurable count, and does not quietly divide by the
   measurable subset alone (INT-R09).

**Read every check that has never gone red** (kickoff §8). Test 7 is the
likeliest to pass for the wrong reason — a STAFF fixture with no orders would
pass it with the rule deleted. The fixture must have real money behind it.

---

## 13. Build order

Schema → API → frontend, one piece verified before the next.

| | Piece | Notes |
|---|---|---|
| 1 | `DailySnapshot` · `KpiTarget` · `IntelligenceSetting` + `radian_intelligence_migrate.bat` | `NO_SOFT_DELETE` entry in the same pass |
| 2 | Snapshot job — reconciling, in the `automation.service.ts` shape | verify a missed night is caught up |
| 3 | `Order.promisedBy` + backfill-as-null + `radian_promisedby_migrate.bat` | cross-module #1; Sales/Delivery |
| 4 | Dashboard API — three sections, role-gated, `source` on every figure | static routes above `:id` |
| 5 | Dashboard screen | §1 layout, jump bar, four to six figures per section |
| 6 | KPI API + screen | targets, RAG colour, no messages |
| 7 | `common/export/` — PDF + Excel | cross-module #2 |
| 8 | Reports centre | gathers existing reports; Mushak on the government form |
| 9 | Forecast + market screens, demo, five conditions | `intelligence.demo.ts` |
| 10 | `intelligence.selftest.ts` + `.bat` | eight checks above |

Every `.bat` carries a comment saying **what it adds and why**, so it still
reads six months from now — the `radian_loyalty_migrate.bat` shape.

---

## 14. Built — 29 Jul 2026 (piece 1 of 4)

Steps 1–5 of §13. The other three sub-modules are not started.

| Area | Where |
|---|---|
| Schema — 3 tables + 1 enum + `Order.promisedBy` | `apps/api/prisma/schema.prisma` |
| `NO_SOFT_DELETE` — `DailySnapshot`, `IntelligenceSetting` | `apps/api/src/prisma/soft-delete.extension.ts` |
| Migration | `radian_intelligence_migrate.bat` |
| API | `apps/api/src/intelligence/` — service · controller · module · automation |
| Nightly reconciling sweep | `intelligence.automation.ts` (00:30 BD + hourly + after boot) |
| Screen | `/intelligence` · `ExecutiveDashboard.tsx` |
| Nav | one module, one sub-module listed — the other three appear when built |

**Checked, not assumed**

- `tsc --noEmit` on the admin app: **0 errors.**
- API cannot be compile-checked in the sandbox (stale Prisma client — kickoff §8);
  every remaining error there is `Property 'dailySnapshot' does not exist`, the
  expected class, and `deliveryAssignment` fails identically, which is what
  proves the client is stale rather than the code wrong.
- V8 `vm.Script` pass on all four new API files — the duplicate-`const` check the
  TypeScript parser does not do.
- No `:id` route in the controller, so the Nest ordering trap has nothing to
  catch.

**Three bugs found and fixed — one by reading, two by running it**

1. **Double-counted work (found by re-reading).** The first version counted
   `deliveryStatus: unassigned` in *two* Today lines — "orders to prepare" and
   "deliveries with no rider" — so one order appeared twice and the two counts
   silently reported the same work. Split on the states that already exist:
   `preparing` is being made, `unassigned` is made and waiting to be carried.

2. **`P2002` on the settings singleton — the whole dashboard 500'd on first
   load.** Kickoff §8 says "singleton `findUnique → create` is wrong, use
   `upsert`". That is right and it is **not enough**. Prisma only compiles an
   upsert into an atomic `INSERT … ON CONFLICT` under some conditions;
   otherwise it still emits SELECT-then-INSERT and the gap is back. A React
   effect in dev fires the same fetch twice, both requests found no row, both
   inserted, one died. Now: upsert as the fast path, and on `P2002` read the row
   the winner just wrote.

   ⚠️ **The same fault was in seven other modules** — see
   `RADIAN_FINAL_REVISION_TODO.md` §7. Four still used the `findUnique → create`
   shape §8 explicitly forbids; four used `upsert` and believed themselves safe.
   All eight now share `apps/api/src/common/singleton.ts`. Fixed 29 Jul on the
   owner's instruction, after being flagged rather than changed unasked.

3. **The empty chart looked broken (found by looking at it).** `historyReady`
   asked "are there rows?" — but the sweep back-fills 90 days on its first run,
   so rows appear immediately while there is still nothing in them. The result
   was a flat line of zero-height bars: precisely the "looks broken" outcome the
   section exists to avoid. The question is now "did anything *happen*?", and
   with no sales the panel says so in words instead of drawing nothing.

**Proved working on the owner's machine, 29 Jul**

Migration applied (`20260729114428_intelligence`), API restarted, all four
sections render, `radian_check_and_restart.bat` passed with an empty check log.
The boot catch-up sweep ran by itself and filled 90 days without being asked —
DEC-INT-002's reconciliation behaviour, confirmed rather than assumed.
Every figure reads zero because the books are genuinely empty.

**Known gaps — stated now rather than discovered later**

1. **On-time delivery reads as unmeasurable, and that is correct.** Nothing sets
   `Order.promisedBy` yet — that is step 3 of §13 and it belongs to Sales. Until
   then the KPI says *"no delivery has a promised time yet"* instead of a number.
2. **The history strip is empty until the first night passes.** The screen says
   so rather than drawing a flat line that reads as zero sales.
3. **Cash and stock value are only stored on the most recent snapshot day.**
   They are balances, not sums over a range, so a back-filled day cannot know
   what they were — it stores 0 rather than today's balance under an old date.
4. **`/delivery/performance` still shows the invented "On-time 94 %".** Fixing it
   is Delivery's, once `promisedBy` exists — §9 row 4.
5. **Reports, KPIs screen and Forecast are not built.** The nav lists only what
   exists; an entry that leads nowhere is a promise the panel cannot keep.

---

## 14b. Built — Analytics & KPIs (piece 2 of 4)

| Area | Where |
|---|---|
| Service | `intelligence.kpi.service.ts` — targets, the year grid, movement, weekday pattern |
| Routes | `GET /intelligence/kpis` · `/kpis/movement` · `/kpis/weekdays` · `POST /targets` · `/targets/clear` · `/targets/copy` |
| Screen | `/intelligence/kpis` · `KpiCentre.tsx` |
| Self-test | `intelligence.selftest.ts` + `radian_intelligence_selftest.bat` |

**Two arithmetic traps this sub-module exists to avoid**

1. **A month's margin is not the mean of its daily margins.** A day with ৳100 of
   sales at 80 % and a day with ৳10,000 at 20 % is a **20.6 %** month, not a
   50 % one. Rates are rebuilt from the summed money; the self-test seeds
   exactly those two days and demands the honest answer.
2. **"Nothing recorded" is not "zero".** A month before the shop kept records
   returns `null`, drawn as `—`. A 0 would put a valley on the chart that never
   happened and make the year look like a recovery.

**The "why" — an exact split, not an estimate**

Revenue moves for exactly two reasons: more orders, or a bigger basket. They
call for opposite responses, so telling them apart is the most useful sentence
this screen can say.

```
volume effect = (N₁ − N₀) × AOV₀
value effect  = the remainder
------------------------------------
together      = R₁ − R₀        ← always, to the paisa
```

The value effect is taken as the remainder deliberately, so rounding can never
leak into an unexplained gap. The self-test asserts the identity.

**A validation that matters more than it looks:** margin and on-time targets are
basis points. Without a range check, an owner typing `95` for margin sets a
target of **0.95 %** and the month is green for ever.

**Three faults, and not one was found by reading the code**

| Found by | What |
|---|---|
| `radian_check_and_restart.bat` | `const months = []` infers `never[]`, so every push failed to compile |
| the same script, second run | `MonthActual` was not exported, so the controller's return type could not be named (TS4053) |
| **the self-test, on its first ever run** | the year guard said `year < 2020`, quietly making historical targets impossible |

Both compile faults were caught **before the API restarted** — the script
refuses to restart over a broken build, so the running system never saw either.
That refusal is the entire reason the script exists.

**The third one is the interesting one, and it is the §8 trap exactly.**

The first run reported:

```
PASS  a margin target of 150 % is refused  (That year does not look right)
PASS  and a negative sales target          (That year does not look right)
```

Both green. Both meaningless. The margin was not refused for being 150 % — it
was refused because the test year, 2019, tripped a *different* guard. **Delete
the margin rule entirely and those two checks stay green.**

The cause was in the test helper: `refuses()` took the expected message as
*optional*, and passed on any error at all. A refusal test that accepts any
error is not testing a rule; it is testing that the code can throw.

Fixed in both directions:

- `refuses()` now **requires** the expected message — a check must say why it
  expected the refusal
- a new check asserts the opposite case: **2019 must be accepted**, because the
  guard is there to catch a typed `20`, not to have an opinion about history

**Result: 37 passed, 0 failed** — with every refusal check now naming its own
reason.

---

## 14c. Rebuilt — Analytics as nine lenses (DEC-INT-009)

**The owner rejected the first Analytics screen, and was right to.** A table of
targets is not analysis. What he asked for: *lenses across the top — click
Delivery and get delivery, click Sales and get sales — the whole business, every
angle, in charts.*

`/intelligence/analytics` — nine lenses, four periods:

| Lens | Read from |
|---|---|
| Sales | `FinanceReportsService` (P&L, breakdown) + order counts + `DailySnapshot` |
| **Delivery** | **`DeliveryAnalyticsService` — new, built inside Delivery** |
| Inventory | `InventoryService.overview` + `issueReport` |
| Products | `ProductsService.analytics` |
| Customers | counted here — see the exception below |
| Finance | `FinanceService.overview` + `reports/aging` |
| Marketing | `CampaignsService.stats` |
| Purchases | `PurchasesService.stats` + `SuppliersService.stats` |
| Staff | `EmployeesService.stats` |

**One shape for all nine.** Every lens answers `{ cards, charts }`, so a single
renderer draws all of them and a tenth lens is a service method with no frontend
change at all. Nine bespoke payloads and nine bespoke screens is how an
analytics page becomes the thing nobody dares touch.

**The delivery demo figure is dead.** `/delivery/performance` has shown an
invented "On-time 94 %" from `deliveryDemo.ts` since Delivery was built.
`DeliveryAnalyticsService` now computes it for real — **inside Delivery, not
inside Intelligence**, because the verdict on whether a parcel was on time
belongs to the module that carried it. Intelligence reads it. Two modules each
computing "on-time %" is how a shop ends up with two answers to one question.

Today it honestly reports *"no delivery has a promised time yet"*, because
nothing fills `Order.promisedBy` until Orders is wired (§13 step 3). An honest
blank replacing a confident fiction is the whole point.

**One documented exception to INT-R01.** The Customers lens counts for itself,
because no module produces customer aggregates — so it is not a *second* source,
it is the only one. Marked in the code. If a Customers module ever grows
`stats()`, this must switch to calling it.

**The lens and period live in the URL** (`?lens=delivery&range=30d`), so a view
can be bookmarked and sent to somebody. Without it, every visit reopens on Sales.

**Six faults, all caught by the gate, none by reading**

Every one came from me assuming another module's return shape instead of reading
it. `radian_check_and_restart.bat` refused the restart each time.

| Assumed | Actually |
|---|---|
| `salesBreakdown().byChannel` | `.channels`, and the field is `salesPaisa` |
| `issueReport().byDay[].onDate` | `.series[].date` |
| `Customer.ltvPaisa` is a number | it is a **BigInt** |
| `aging().customers` | `.receivable.buckets` |
| product margin in basis points | in **paisa** |
| `purchases.stats()` is all numbers | it carries an `advanceWaiting` array |

The lesson is not "the gate is useful" — it is that **reading nine modules means
reading nine modules**, and a lens layer is exactly where guessing gets punished.

**Verified by opening all nine.** Real figures already show through where data
exists: Inventory 6 items tracked, Products 5 listed, Suppliers 2 active. The
rest read zero because the books are empty — and each says which of the two it
is, in words.

---

## 14d. Built — Reports centre (piece 4 of 4)

`/intelligence/reports` — ten reports in four groups, one date range, and two
ways out. **Not one new report was written**: every figure already existed
somewhere, and what was missing was one place to find them.

| Group | Reports |
|---|---|
| Money | Profit & loss · Trial balance · Owed to us · What we owe · Supplier balances |
| Sales | Sales by channel and zone · Product performance |
| Stock | Stock valuation · Wastage and gifts |
| Operations | Delivery performance |

**One shape again.** Every report answers `{ columns, rows, totals }`, so one
table draws all ten, one CSV writer exports all ten, one print stylesheet prints
all ten, and an eleventh is a method with no screen work at all.

### DEC-INT-010 — PDF is the browser's print, deliberately

**The obvious move was a PDF library on the server, and it would have been
wrong.**

Mushak 6.3 is a Bangladeshi government VAT form and it is printed in Bangla.
`pdfkit` — the natural choice for a Node service — **cannot shape complex
scripts**: conjuncts like ক্ত and ন্ধ come apart into their components. On a
government form that is not a cosmetic defect, it is an invalid document. No
amount of font embedding fixes it, because the problem is shaping, not glyphs.

The browser shapes Bangla correctly. And the panel **already** prints the Mushak
challan exactly this way — `FinanceMushak.tsx` has had `@media print` and a real
Bangla form since Finance was built. The pattern was already here; it only
needed following.

So: **print for paper and PDF, CSV for the accountant.** Consequences worth
stating —

- the API keeps **zero third-party dependencies** beyond Nest and Prisma, which
  is remarkable for a system this size and worth not spending casually
- CSV is written in **taka with two decimals, not paisa** — a spreadsheet
  reading `420000` where the shop made ৳4,200 is worse than no spreadsheet
- the file carries a **UTF-8 BOM**, or Excel opens Bangla and ৳ as mojibake

**Mushak is not in the list**, on purpose: it is a per-order government form
with its own layout, not a table. The screen links to it rather than
reproducing it badly.

### A caveat is a report warning you about its own numbers

Three reports carry one, and it prints **above** the table rather than as a
footnote:

- **Trial balance** — if debits and credits disagree, that is said in the
  subtitle, not left for the reader to add two columns and notice
- **Sales by channel and zone** — the two halves describe the *same* sales from
  two angles; adding them together doubles the money
- **Delivery performance** — how many deliveries have no promised time and are
  therefore **not counted as late** (INT-R09)

### Self-test now covers the registries

Two checks worth more than they look:

1. **Every lens and every report is actually run.** A registry entry that throws
   is invisible until somebody clicks it — the button exists, the failure waits.
   Nineteen entries, nineteen calls.
2. **Every money total must equal the sum of its rows.** A footer that does not
   add up is the fastest way to lose an accountant's trust in the whole system.
   P&L is excluded by name, because its rows *are* sections and subtotals and
   summing them would double-count by design.

**62 passed, 0 failed.**

---

## 14e. Full module review — 29 Jul 2026

Run against `architecture-review`, module checklist, all thirteen sections.
**Seven findings. The two worst were mine, and neither would have shown up as an
error — both would have quietly told the owner something untrue.**

### 🔴 R1 — The nav reversed a locked decision

`AdminSidebar.tsx` carried `roles: ["OWNER","MANAGER"]` on the Intelligence
module, which hid **the whole module from STAFF** — including the Executive
Dashboard, which DEC-INT-005 gives STAFF **on purpose**. The API was still doing
its job correctly: `/intelligence/dashboard` is open to everyone and withholds
cost and cash per figure. The nav simply closed a door the architecture had
deliberately left open.

Nothing failed. No error appeared. Staff would just never have found the screen
written for them.

**Fixed:** `Sub` now carries its own `roles`, so a module can be open while
individual screens are not. Intelligence has no gate; Analytics, Reports and
Targets are OWNER/MANAGER.

### 🔴 R2 — Three different definitions of "average order value"

| Where | What it divided |
|---|---|
| Executive Dashboard | **ledger income** ÷ order count |
| Analytics · Sales lens | sum of **order totals** ÷ order count |
| `DailySnapshot` | sum of **order totals** ÷ order count |

Ledger income excludes the VAT held for the government and can include income
that never came from an order; the order count is strictly orders. Two
populations, one division.

So the same figure meant something different depending on which screen you
opened — **and changed meaning again the moment it aged from "today" into
history**. This is the exact fault the module exists to prevent, committed
inside the module itself.

**Fixed:** one definition — the sum of order totals over the number of orders —
everywhere. With no orders it returns `null` and says so, rather than ৳0.
A self-test now compares the dashboard against the lens directly.

### 🟠 R3 — Two reports labelled a lookback with the dates you chose
### *(first handled honestly, then fixed at the source)*

`Product performance` and `Wastage` ask their owning service for *"the last N
days"*. The first version computed N from the chosen dates and then printed
**those dates** as the heading — so asking for last March returned the last 31
days **to today**, under a heading that said March.

**First fix — honest:** both declared `usesRange: false`, titled "(last 30
days)", with a caveat saying why. The date picker disappeared rather than lying.
Reaching around Products and Inventory to compute a ranged figure *here* would
have been a second source of truth — the one thing this module may not do.

**Second fix — at the source, and this is the real one.** `ProductsService.
analytics()` and `InventoryService.issueReport()` now accept `{ from, to }` as
well as a day count. Both reports are ranged again, both lenses are `full`, and
the caveats are gone because there is nothing left to warn about.

The honest label was the right *stopgap*. Fixing the owning module was the right
*answer*. Documenting a limitation for ever is how a system fills up with
footnotes nobody reads.

The self-test now asserts the opposite of what it asserted this afternoon: a
report asked for **March 2019 must come back empty**, not full of this month's
figures under a 2019 heading. That is the exact failure the original bug
produced, so that is what is guarded.

### 🟠 R4 — Four period buttons that did nothing
### *(and two more that only half worked)*

Finance, Marketing, Purchases and Staff **ignored the period entirely** —
identical figures whether you asked for today or the whole year. Inventory and
Products used only the *length*, always ending today.

A control that changes nothing is worse than no control: it does not merely fail
to help, it tells the reader the number covers a span it does not. The Reports
centre already refused to do this; Analytics was doing it.

**Fixed in two steps, like R3.** Every lens declares `rangeMode` — `full`,
`lookback` or `none`; the buttons grey out on a `none` lens and the screen says
in words what actually happened. Then Inventory and Products were moved from
`lookback` to **`full`** once their services learned to take a window, so only
the four genuinely "right now" lenses are left declaring `none`.

A self-test asserts a `none` lens really does answer identically for every
period — so the declaration cannot quietly drift away from the behaviour.

### 🟡 R5 — Dead end at the dashboard

The Executive Dashboard answers "what is happening"; the next question is always
"why", and the only route through was the sidebar. **Fixed:** Analytics and
Reports links in the header, shown only to those who may open them.

### 🟡 R6 — The nightly sweep is 90 sequential rebuilds

`reconcile()` walks up to 90 days one at a time, each doing a P&L groupBy plus
three counts — roughly 450 queries on the API's own event loop. It completes
today, and it will get slower as the ledger grows. **Fixed:** capped at 30 days per run, in batches of 3.

Nothing is lost by the cap — this is reconciliation, so whatever is still
missing is found on the next pass, and the hourly timer makes "next pass" within
the hour. The batch size is deliberately small: 90 concurrent groupBys against
the shop's single Postgres would make the panel unusable for whoever is standing
at the counter. And `reconcile()` now returns `remaining`, so a sweep that
leaves work for later **says so** rather than quietly appearing finished — a
self-test asserts that count is reported.

### 🟢 R7 — `DailySnapshot.onDate` carries both `@unique` and `@@index`

Redundant — the unique constraint already creates the index, so Postgres is
maintaining two identical B-trees on a table that gains one row a night.

**Deliberately not fixed, and this is a recommendation rather than an omission.**
Removing it costs a schema migration the owner has to run, and buys back a few
kilobytes and a few microseconds a day. That is a worse trade than leaving it.
It is written down here so the next person knows it was seen and judged, not
missed. If a migration is ever run for another reason, fold it in then.

### Checklist verdict

| Section | Status |
|---|---|
| Identity · Responsibilities · Entities | ✅ |
| Operations · Rules · Workflows | ✅ |
| Relationships (one-way, nine sources) | ✅ |
| Reports · Analytics | ✅ after R3, R4 |
| Settings | ✅ |
| Bangladesh context (Bangla print, Mushak, AVCO, paisa) | ✅ |
| Scalability | ⚠️ R6 noted |
| Known critical gaps | ✅ — none apply; Intelligence owns no business data |

**Self-test after the review: 77 passed, 0 failed** — up from 62, with the three
faults above each now guarded.

**Still open, and deliberately:** the Forecast sub-module (DEC-INT-006), and
`Order.promisedBy` remaining unfilled until Orders is wired (§13 step 3).

---

## 14f. Built — Forecast & market (piece 4 of 4) · the module is complete

`/intelligence/forecast`. Built on demo data, as the owner decided, with all
five conditions of DEC-INT-006 implemented and three of them machine-proved.

### Each projection declares its own data requirement

One global threshold could not tell the truth, because the truth is different
for each horizon:

| Projection | Needs | Method when real |
|---|---|---|
| Next seven days | **28 days** of trading | each weekday averaged over the last four weeks — a flower shop's week is not flat, and a plain 7-day mean smears Thursday and Friday away |
| Next month | **365 days** | the same month last year, moved by how the last 90 days compare with the same 90 a year ago |

The month needs a year for the reason DEC-INT-006 was argued over: **without
last year's Valentine's Day, a model has no idea February exists.**

So the screen can be honestly real about next week while still refusing next
month — which is the actual state of things, and one number could not have said
it.

### An empty day is not history

**The single most important line in this sub-module.** The nightly sweep
back-fills 90 days on a fresh install. If those counted, a shop that has never
sold anything would be declared ready to forecast — the exact failure the whole
design exists to prevent.

Only days with **actual trading** count. The screen showed `Days with trading:
0` against 90 stored rows, which is correct, and a self-test asserts it.

### Every figure is a range

`somewhere between ৳9,60,000 and ৳13,20,000` — never one confident number. A
single figure invites a purchase decision the data cannot support, and this
shop's stock rots.

### Market demand is permanently demo, and says so

No competitor prices, no search trends, no marketplace feed enter this system,
and no module plans to bring them in. Unlike the forecast there is **no
countdown**, because there is nothing to count down to. The screen says that in
words rather than implying it will fill in on its own.

### The five conditions, and how each is held

| | Condition | How |
|---|---|---|
| 1 | one file for every invented number | `intelligence.demo.ts` |
| 2 | provenance travels with the figure | API returns `source` per projection; the screen only renders it |
| 3 | **the switch is automatic** | proved: 28 seeded trading days flipped it to REAL with no human step |
| 4 | badge at the top | existing `DemoBadge`, above everything it applies to |
| 5 | demo never reaches advice | the module issues **no** buying recommendations at all, and says why |

**Self-test: 88 passed, 0 failed.**

---

## 14g. Module status — complete

| Sub-module | Screen | State |
|---|---|---|
| Executive Dashboard | `/intelligence` | built · reviewed |
| Analytics (9 lenses) | `/intelligence/analytics` | built · reviewed |
| Reports (10 reports) | `/intelligence/reports` | built · reviewed |
| Targets & KPIs | `/intelligence/kpis` | built · reviewed |
| Forecast & market | `/intelligence/forecast` | built |

**One cross-module item is still open and it is not Intelligence's to close:**
`Order.promisedBy` is never filled, so on-time delivery reports honestly that it
cannot be measured. Orders must set it at order creation — §13 step 3, and
`RADIAN_FINAL_REVISION_TODO.md` §7b(a).

---

## 15. Decision log references

`DEC-INT-001` layout · `DEC-INT-002` snapshot strategy · `DEC-INT-003` KPIs and
`promisedBy` · `DEC-INT-004` reports scope · `DEC-INT-005` role visibility ·
`DEC-INT-006` forecast on demo data, with the objection · `DEC-INT-007` owned
tables · `DEC-INT-008` disagreement is shown, not resolved.

Related: `DEC-FIN-023` / `HR-R28` / `MKT-RULE-016` (`postEntry()` returns `null`
on a duplicate `sourceKey` — Intelligence writes no money, so this does not bite
here, but the silence-is-failure shape does) · `MKT-D21` (the `agrees` pattern
reused in DEC-INT-008).
