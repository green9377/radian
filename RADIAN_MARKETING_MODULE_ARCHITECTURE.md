# Radian — Marketing Module Architecture (drafted 28 Jul 2026)

Status: **decisions locked with the owner, code not started.**
Companion to `RADIAN_MARKETING_KICKOFF.md`. Where the two disagree, this file wins —
it was written after the conversation that changed the shape of the module.

---

## 0. What changed from the kickoff, and why

The kickoff framed Marketing as campaign spend and ROI. The owner corrected that
before any question was answered: *decide which ways we market first, then decide
how each way is used.* That reordering was right, and it produced three facts the
kickoff did not have.

| Found | Consequence |
|---|---|
| **radianbd.com is live** — getCommerce 3.0.0, with real customers, orders, wishlists, tickets. Data will migrate into Radian later | The "no customers yet, so loyalty is decoration" argument in `RADIAN_MODULE_PRIORITY.md` §Tier 5 is **withdrawn**. It was measured against Radian's own empty database, which was the wrong place to look |
| **foodpanda and Sugary already sell**, and staff enter those orders into Radian by hand | Not a data gap. It is a `Channel` gap — see §7 |
| **Affiliate**, not referral: an outside person gets a link, earns commission, and withdraws cash | The largest and riskiest single piece of this module. It is the only place Radian pays money to somebody who is neither an employee nor a supplier |

The objection recorded in kickoff §2 — that Ecommerce + Integrations should come
before Marketing, because the storefront still cannot take money — **still stands
and was not withdrawn.** The owner chose Marketing. Scope is kept to §6 Phase 1
for that reason.

---

## 1. Purpose

Radian already records money coming in. It does not record **what was spent to
bring it in**, and it cannot answer the one question that decides next month's
budget: *did that ৳40,000 come back?*

Marketing exists to put those two numbers next to each other, honestly — including
being honest about the orders whose origin nobody knows.

Second purpose, and for a flower shop the larger one: `RecipientOccasion` has been
quietly collecting birthdays and anniversaries since the Customer module. Nothing
reads it. Marketing turns it into a list of people to talk to this week.

---

## 2. Owned entities

Marketing owns **seven** tables and **no** money, **no** customer, **no** order.

| Entity | What it is |
|---|---|
| `Campaign` | One promotional push — an occasion, not an ad |
| `OrderAttribution` | Marketing's verdict on where one order came from. 1:1 optional with `Order` |
| `Affiliate` | An outside promoter — a person or a business |
| `AffiliateCommission` | What one order earned one affiliate, and its state |
| `AffiliatePayout` | One withdrawal of accrued commission |
| `Outreach` | One contact attempt with one known customer |
| `MarketingOptOut` | Somebody who asked not to be contacted |
| `MarketingSetting` | Singleton — default rate, hold days, minimum withdrawal, lead days |
| `AdInsight` | MKT-D20 — one row per Meta campaign per day. A **cache of what Meta reported**, not a transaction |
| `LoyaltyPoint` | MKT-D16/D21 — the points ledger, **append-only**. Referral and Loyalty share it, so a customer has ONE balance |

### Explicitly NOT owned

`Order` · `Customer` · `Recipient` · `RecipientOccasion` · `Channel` · `Offer` ·
`OfferRedemption` · `Expense` · `JournalEntry` · every account in the chart.
Marketing **reads** all of these and **writes** none of them.

---

## 3. Decisions

### MKT-D01 — A Campaign is one occasion, not one advertisement

"Valentine's Day 2027" is one row. The three Facebook ads, the five Instagram
posts, the `LOVE27` coupon and the forty WhatsApp messages inside it are not rows.

Two reasons, and the second matters more than the first.

Cost data is coarse by nature. `5450` is filled in by hand from receipts. Splitting
one ৳25,000 boost receipt across three ads is work the owner would do twice and
then stop, at which point the data becomes a lie that still renders.

More importantly, *which ad performed better* is a question Meta answers for free
and better. *How did Valentine's Day go across website, phone, walk-in and
foodpanda together* is a question Meta can never answer, because it cannot see
three of those four. Radian should do the job only Radian can do.

A `platform` enum carries the distinction that is actually needed:
`FACEBOOK · INSTAGRAM · GOOGLE · TIKTOK · YOUTUBE · INFLUENCER · PRINT · EVENT ·
PARTNERSHIP · OTHER`. Adding one later is a list entry, not a migration.

**If this proves too coarse**, a `CampaignActivity` child table is additive and
touches no existing row. The reverse — merging six rows into one after the fact —
is manual. Coarse now is the cheap mistake.

### MKT-D02 — Attribution is layered, and the layer is recorded

```
1  ref code present      → that Affiliate     (money depends on it — highest)
2  coupon code used      → that Campaign
3  UTM captured          → that Campaign
4  staff set it by hand  → that Campaign
5  nothing               → UNATTRIBUTED
```

`OrderAttribution.source` stores which rung answered. A number derived from
coupons and a number derived from a staff guess are not the same quality of
number, and the report must be able to say so.

### MKT-D03 — Unattributed orders are shown, never distributed

This is the rule most systems break, and breaking it is how every campaign ends up
looking profitable. If 70 of 120 orders have no known origin, the report says
**"70 orders — origin unknown"** in the same size type as the rest. It does not
spread them proportionally across campaigns, and it does not hide them.

### MKT-D04 — One order belongs to one campaign

An order counted in three campaigns turns ৳5,000 of revenue into ৳15,000 and makes
all three look good. One campaign, one affiliate — two separate ledgers, so an
order may carry both, but never two campaigns.

### MKT-D05 — Marketing spend stays in Finance; Marketing only tags and reads

`Expense` gets one nullable `campaignId`. The expense form gets one optional
dropdown. Nothing else moves.

This is exactly the shape HR used — `JournalLine.employeeId` was added beside the
money, not instead of it, and HR reads. It works. Two ledgers for the same taka
never reconcile, and the whole Finance design rests on there being one.

The accounts already exist for most of it: `5450` Marketing & Ads · `5495`
Branding & Design · `5496` Event Cost. Two are new — see §7.

**Accepted limit:** one expense, one campaign. A ৳25,000 boost covering two
campaigns is entered as two expenses. A split table was considered and rejected —
it needs a percentage screen, and percentage screens get filled in wrong.

### MKT-D06 — ROI shows three lines; contribution is the headline

```
Revenue            ৳ 3,20,000     →  8.0×      (matches what Meta reports)
− Cost of goods    ৳ 1,76,000
= Gross profit     ৳ 1,44,000     →  3.6×
− Delivery cost    ৳   32,000
= Contribution     ৳ 1,12,000     →  2.8×      ← headline, set against spend
```

Revenue-only ROI is how a campaign that lost money reports 4×. A push heavy on
imported chocolate at 20 % margin can return ৳2,00,000 on ৳50,000 of spend and
still be ৳10,000 underwater.

Both other lines stay visible because the owner will see the revenue figure inside
Meta's own reporting, and two numbers that disagree with no explanation are worse
than one wrong number.

Both deductions are real per-order journal lines (`COGS` and `DELIVERY_COST` are
posted with `orderId`), so this is arithmetic on recorded facts, not an estimate.

**Gateway fee is not included** — it posts as a monthly expense, not per order.
Including it would require a Finance change, which is out of scope here.

### MKT-D07 — Occasion reminders: a list plus one click. No API needed

`wa.me` opens WhatsApp with the message already written; staff press Send. This is
the pattern radianbd.com already uses. Zero cost, zero approval, zero dependency —
and the kickoff's assumption that sending requires Phase 2 was wrong.

The owner does hold WhatsApp Business API credentials. **That claim is unverified**
— "WhatsApp Business app" and "WhatsApp Business API" are routinely confused — and
it will be checked before any Phase 2 work. Phase 1 does not depend on it.

### MKT-D08 — The entity is `Affiliate`, not `Partner`

"Partner" already means shareholder in this system: `3000 Partner Capital`,
`3100 Partner Drawings`, `5410 Partner Salary`, `Expense.partnerId`. Reusing it
for an influencer would make `partnerId` permanently ambiguous.

One table, `type: INDIVIDUAL | BUSINESS`. The influencer with a link and the
wedding hall that sends walk-ins differ in exactly two ways — who they are, and
how they are recognised. Commission rule, earnings ledger, holding period, payout
and clawback are identical. Two tables would mean two paths for cash to leave the
shop, each with its own bugs.

### MKT-D09 — Commission base is goods value after discount

```
Goods            ৳ 1,000
− Discount       ৳   100
= Base           ৳   900        10 % → ৳ 90
  Delivery ৳200 and VAT ৳75 are excluded
```

Delivery is a cost passed through to a rider, not margin. VAT belongs to the
government. Paying commission on either means paying commission on money that was
never Radian's.

### MKT-D10 — Commission accrues on delivery, is held, then paid

Two events, two dates, two journal entries — the same shape as salary and advance
in HR, for the same reason.

```
On delivery      Dr 5451 Affiliate Commission  →  Cr 2120 Affiliate Payable    state: PENDING
After hold                                                                     state: AVAILABLE
On payout        Dr 2120 Affiliate Payable     →  Cr 1010 bKash (or chosen)    state: PAID
```

Commission is never withdrawable the moment a sale lands. A ৳500 commission paid
out before the return window closes is ৳500 that must be chased afterwards.

### MKT-D11 — Referral rides on Offers; Loyalty waits for the migration

Referral needs per-customer coupon codes, which the Offers module already has. It
carries no history requirement and can be built inside this cycle.

Loyalty cannot. On the day points switch on, everybody has zero — including the
customer who has bought forty times through radianbd.com. **The best customer is
the one most insulted by the launch.** The fix is to migrate the order history
first and seed opening balances from it, the way Finance seeds opening balances.
So: design now, build after migration.

### MKT-D12 — Marketplaces are a Sales `Channel`, not a Marketing concept

foodpanda and Sugary are places orders come from, not promotions. They belong in
the existing `Channel` table, which is admin-configurable and already carries
`Order.channelId`. Marketing's only interest is attribution.

**Found while building:** the Channel API has existed since the Sales module and
there was never a screen for it. So there was nowhere to record the two
marketplaces the shop already sells on, and those orders have been landing under
whatever channel somebody picked. A screen now exists at `/orders/channels` —
under Orders, because Sales owns it. Marketing links to it and reads it.

### MKT-D14 — Automation is reconciliation, not hooks

The old module map listed "Marketing Automation" beside a workflow builder. It is
neither. It is five jobs that were already written and that nothing was calling:

```
1  a delivered order earns its affiliate's commission        MKT-RULE-012
2  commission past its hold becomes withdrawable             MKT-D10
3  a cancelled or fully-returned order gives the money back  MKT-RULE-014
4  a campaign starts and finishes on its own dates
5  recent orders are re-checked for where they came from     MKT-D02
```

The obvious build is a hook in `OrdersService.delivered()` and
`ReturnsService.complete()`. It was considered and rejected. **A hook that fails,
fails silently** — which is the whole reason Finance has a drift checker, and
why the worst bug in HR survived a design review, a code read and daily use of
the screens.

So this **asks the orders what happened and makes the commission ledger agree**.
A missed event repairs itself on the next pass instead of becoming a permanent
hole. Every step is idempotent: the `(orderId, affiliateId)` unique stops a
double accrual and `sourceKey` stops a double ledger entry (DEC-FIN-023).

Rhythm, borrowed from `FinanceDriftService` because it works: every 15 minutes
over the last 14 days · 2 AM Bangladesh time over the last 120 days · once 90
seconds after boot, because a shop laptop is not running at 2 AM. There is also a
**Run the checks now** button, and the result is written to `AuditLog` — no new
table.

**Campaign status moves forward only.** If the owner marks a campaign finished
early because the budget ran out, the machine must not quietly restart it
tomorrow just because the end date has not arrived. The person's decision came
later, so it wins.

**A partial return is deliberately left alone.** A cancelled order and a wholly
returned one are unambiguous, so they reverse. But quietly docking somebody's
earnings by a formula nobody can explain is worse than showing it: the commission
list flags "৳X of this order came back" and a person decides.

### MKT-D20 — reading the ad account, and why it is not the money

Marketing reads Meta's own numbers — spend, impressions, clicks, CTR, cost per
click, per campaign — into `AdInsight`, and shows them at
`/marketing/ads`. Credentials live on `TrackingSetting` (`adAccountId`,
`adsAccessToken`, `adsCurrency`), separate from the Conversions API token beside
them: that one **sends** events to Meta and needs the dataset permission, this
one **reads** what the ads cost and needs `ads_read`. A token minted for one
will not do the other's job, and saying so on the screen saves an evening.

**Why the ledger is untouched.** Meta reports what it billed, in the ad
account's currency — usually US dollars for a Bangladeshi account. The bank
charges something else once the conversion rate, the card fee and the
government's levies land. Both figures are true and they will never agree. If
Meta's figure were posted automatically, the books would start disagreeing with
the bank statement by exactly the exchange rate, every month, for ever.

So the button beside a campaign opens the **Finance expense form** with the
payee, the note and the campaign filled in — and the amount left for a person to
type from the statement. When the ad account bills in dollars the amount is
deliberately left **blank**: a dollar figure sitting in a taka field is precisely
the mistake this screen exists to prevent.

**Cached, not live.** A pull writes rows; the screen reads rows. Meta rate-limits
an ad account hard enough that an afternoon of refreshes starts returning errors
instead of numbers. The compound key
`(platform, accountId, externalCampaignId, onDate)` means re-fetching a window
overwrites it — a spend figure that grows every time you press refresh would be
worse than no figure at all.

**Scoped to one account.** If the shop ever opens a second ad account, the old
account's rows must not quietly join this month's totals.

**Google Ads is not here.** Its API needs a developer token that Google approves
by hand, and the wait is measured in weeks. Meta first; Google when the token
arrives.

### MKT-D21 — Loyalty points on ordinary purchases

Locked with the owner, 29 Jul 2026. Every number below is a **setting**; the
figures given are the defaults he chose.

| | Rule | Default |
|---|---|---|
| Earn | share of **goods − discount** | **1 %** (`earnRateBp` 100) |
| Earn when | the order is **delivered** | — |
| Festival | multiply earning, with an end date | ×1 (`earnMultiplierBp` 10000) |
| Spend | most of one order points may settle | **20 %** (`redeemMaxBp` 2000) |
| Spend floor | smallest redemption | **50 points** (`minRedeemPoints`) |
| Minimum order | **none** | — |
| Value | 1 point | **৳1** (`pointValuePaisa` 100, shared with Referral) |
| Live? | `loyaltyEnabled` | **false** |

**Why delivered, when Referral pays on confirmed.** Referral happens a few times
a year and reverses easily. Purchase points happen on *every* order, and paying
on confirmed opens a hole with a name: order Monday, spend the points Tuesday,
cancel on Wednesday. The nightly sweep notices — and finds nothing left to take
back. Delivery costs the customer hours, not days, on a shop that promises
two-hour delivery.

**Why the base excludes delivery and VAT, in both directions.** The delivery
charge goes to the rider and the VAT goes to the government; neither was ever
Radian's margin to give away. The same base is used for spending, so there is
one number to remember rather than two.

**Why the rate started at 1 %.** The owner first proposed 10 %. On a 46 % gross
margin that is 22 % of the profit on every order, and stacked with the 10 %
referral friend discount it makes a 20 % first order. The objection was put with
the arithmetic; he chose 1 %. The reasoning that decided it: **a rate is easy to
raise and impossible to lower** — cutting one reads as a punishment, raising one
reads as a gift. The festival multiplier exists so generosity can be turned on
for a week without becoming permanent by accident, which is why it carries an
end date.

**Points are a TENDER, not a discount.** A redemption settles part of the bill;
it does not shrink it. The invoice keeps its full value, VAT is computed on the
full value, and the shop still owes the government the same VAT in cash. Booking
points as a discount would quietly reduce the taxable value of every order they
touch — a tax position nobody here chose to take.

**Accounting** (`5453` is new, kept apart from `5452` so "what referrals cost"
and "what loyalty costs" stay two answerable questions):

```
earning      DR 5453 Loyalty Points Cost      CR 2130 Customer Points Payable
redemption   DR 2130 Customer Points Payable  CR 1100 Receivable
reversal     DR 2130                          CR 5453
```

A redemption must **not** credit 5453. The cost was real on the day the point
was given; un-booking it when the point is spent would make a redeemed point
look free. The self-test asserts this explicitly.

**One door, closed.** `ReferralService.redeem()` — points into store credit —
was **removed**. Two reasons, the second worse than the first:

1. It went round the 20 % cap. Store credit is money and money has no cap.
2. Its accounting was wrong and had been from the start: it credited 5452
   (un-booking the cost) *and* created a `CustomerCredit` row with **no journal
   entry at all**. The shop took on an obligation the books did not know about
   while forgetting it had ever cost anything — two errors in opposite
   directions, cancelling out just enough to look plausible.

**Off until migration.** `loyaltyEnabled` ships **false**. Switching it on
before the radianbd.com customers are imported puts the man who has bought forty
times level with a stranger, and that is not an impression anyone gets to make
twice. Import → seed opening balances (`reason: OPENING`) → switch on.

**What is NOT built.** Redemption has no customer-facing surface: the storefront
cannot take an order yet, and POS has no points tender. Today points are spent
from the admin, against an order, OWNER + PIN. When Ecommerce and POS are built
they call the same `quote()` / `redeemForOrder()` — the cap lives in one place
and must stay there.

---

## 4. Business rules

Prefix `MKT-RULE-`. Each is stated so a non-technical reader can check it.

| ID | Rule | Exception |
|---|---|---|
| 001 | An order belongs to at most one campaign | An order may also carry one affiliate — different ledger |
| 002 | Attribution follows the D02 order, and `source` records which rung matched | Staff may override to a campaign; the override is audited and `source` becomes `MANUAL` |
| 003 | Unattributed orders are counted and displayed, never allocated to a campaign | None |
| 004 | A cancelled or returned order leaves campaign revenue, in full or by the returned amount | None |
| 005 | VAT is never campaign revenue | None |
| 006 | Campaign cost is read from `Expense` only. Marketing never stores a cost figure | None |
| 007 | Occasion messages go to the **buyer**, never to the recipient | None. `anonymousGift` makes this absolute |
| 008 | One occasion, one contact per customer per year | Owner may send again manually; it is logged as a second `Outreach` |
| 009 | A customer in `MarketingOptOut` is excluded from every list and every send | None |
| 010 | A `02-29` occasion surfaces on 28 Feb in a non-leap year | None |
| 011 | Commission base = goods − discount. Delivery and VAT excluded | A per-affiliate override may be agreed; it is stored on the affiliate and snapshotted onto the commission row |
| 012 | Commission accrues only when the order reaches `delivered` | None. A placed-but-undelivered order earns nothing |
| 013 | Commission becomes withdrawable only after the hold period ends | Owner may release early, with PIN and audit |
| 014 | Return or cancellation reverses the commission. If already paid, the amount becomes recoverable from future commission | Same treatment as an employee advance |
| 015 | An affiliate earns nothing on their own purchase — matched on phone number | None |
| 016 | A payout requires OWNER + PIN, and **fails outright unless `postEntry()` returns a real entry** | None — see below |
| 017 | A ref code stays attached to a visitor for 30 days | A later coupon or a manual override wins, per D02 |
| 018 | A campaign with attributed orders or tagged expenses cannot be deleted, only archived | None |
| 019 | Every count uses `prisma.db.*`, never `prisma.*` | None |
| 020 | An affiliate code is unique and stored uppercase | None |
| 021 | Ad-platform spend is **reference only**. Nothing in the ad screens writes to the ledger | None. Finance owns the taka (MKT-D05) |
| 022 | One Meta campaign belongs to at most one Radian campaign | None — two owners would double-count the spend |
| 023 | A pull overwrites the day it re-fetches, never adds to it | None |
| 024 | Loyalty points are earned only when the order is **delivered** | None. Referral pays on confirmed; see D21 for why they differ |
| 025 | Points are earned on **goods − discount**, never on delivery or VAT | None |
| 026 | Points may settle at most **20 %** of goods − discount on one order — the customer always pays 80 % from their own pocket | The share is a setting; 100 % is unreachable by design |
| 027 | Points may not pay delivery or VAT | None |
| 028 | Points are a **tender**, not a discount: the invoice and its VAT are unchanged | None |
| 029 | Points can be spent **only against an order**. There is no conversion to store credit | None — removed 29 Jul, see D21 |

**On rule 016.** The most dangerous bug found in HR was a payroll marked APPROVED
while nothing reached the ledger — `postEntry()` returned `null` on a duplicate
`sourceKey` and nobody checked (DEC-FIN-023, HR-R28). Affiliate payout has exactly
that shape: a screen that says *paid*, a state that says `PAID`, and possibly no
journal entry. Every `postEntry()` call in this module checks its return value.

Source keys: `AFFCOM:<commissionId>` on accrual, `AFFPAY:<payoutNo>` on payout.

---

## 5. Shape of the module — MKT-D13

Marketing is **one module with four sub-modules**, and each sub-module carries
its own screens. Three levels of navigation, not two (owner's call, 28 Jul).

```
Marketing & Growth
├── Overview                          the doorway — four cards, one number each
├── Campaigns
│     ├── Overview                    best return · running now · order sources
│     ├── All campaigns               list + create
│     ├── Order sources               the five rungs, and what is unknown
│     └── [id]                        the three-line ROI
├── Offers & Promotions   ← MOVED HERE, ownership unchanged
│     ├── Overview · Offers · Coupons · Templates · Approvals · Settings
├── Affiliates & Partners
│     ├── Overview                    who brings most · who is waiting to be paid
│     ├── All affiliates              list + add
│     ├── Commission ledger           one row per order, per affiliate
│     ├── Payouts                     every time money left the shop
│     └── [id]                        their link, ledger and the payout button
├── Occasions & Outreach
│     ├── Occasions due               the list + one-click WhatsApp
│     ├── Contact history             who we talked to, and whether it worked
│     └── Do not contact              MKT-RULE-009
└── Marketing settings
```

### On Offers moving — what did and did not change

**Did not change:** the `Offer` entity is still owned by the Offers module.
Marketing reads it and never writes to it. `DEC-OFR-*` all stand. The API is
still `/offers`. Not one line of Offers business logic was touched.

**Did change:** where it sits in the panel, and its admin URLs
(`/offers/...` → `/marketing/offers/...`). The old routes are **redirects**, so
every existing link and bookmark still lands in the right place.

The reason is not architectural, it is human: to the person running the shop, a
coupon *is* marketing, and a campaign's coupon is also the strongest evidence
attribution has. Keeping them in different corners of the panel made two halves
of one job look like two jobs.

⚠️ **Reserved names.** `/marketing/campaigns/[id]`, `/marketing/affiliates/[id]`
and `/marketing/offers/[id]` are dynamic, so every static folder beside them —
`list` · `sources` · `commissions` · `payouts` · `coupons` · `templates` ·
`approvals` · `settings` · `perf` — is a word no id may ever be. Next resolves
static segments first.

UI in English throughout.

---

## 6. Scope

### Phase 1 — nothing external required

Campaign · attribution · three-line ROI · occasion list with one-click WhatsApp ·
outreach log · Affiliate with commission, hold, clawback and PIN-guarded payout ·
Referral on top of Offers · the `Channel` fix for foodpanda and Sugary.

Build order: **Campaign → Outreach → Affiliate → Referral.**

### Phase 2 — blocked on outside approval, and on verification

Automatic WhatsApp sending · pulling Meta and Google spend in automatically ·
SMS and Email sending.

### Phase 3 — after the radianbd.com migration

Loyalty, with opening point balances seeded from migrated order history.

---

## 7. Cross-module log

Everything this module changes outside itself. Nothing here is owned by Marketing.

| Module | Change | Why |
|---|---|---|
| **Finance** | `Expense.campaignId` — nullable | D05. Finance owns the row; Marketing reads |
| **Finance** | New account `2120` Affiliate & Partner Payable (LIABILITY, group Payable) | Commission owed but not yet paid |
| **Finance** | New account `5451` Affiliate Commission (EXPENSE, VARIABLE, Selling Cost) | Commission as a cost of selling |
| **Finance** | Expense form gains an optional campaign dropdown | So the tag can actually be set |
| **Sales** | `Order` gains `utmSource` · `utmMedium` · `utmCampaign` · `refCode`, all nullable | Raw capture of how the order arrived — a Sales fact, like `channelId`. Marketing interprets it, Sales records it |
| **Sales** | `Channel` rows for foodpanda and Sugary if absent | D12 |
| **Offers** | None. Read-only | Coupons stay where they are |
| **Customer** | None. Opt-out lives in `MarketingOptOut` | Keeps `Customer` untouched |
| **Ecommerce** | The new storefront must forward UTM values on order creation | Not built yet. Until it is, rung 3 stays empty and rungs 1·2·4 carry the load |

**Migration discipline:** every schema change gets its own `.bat`, run in order.
Writing schema code without running the migration stops the API from booting —
that has happened twice.

---

## 8. Non-goals this cycle

- **SEO module** — a one-time storefront checklist, not a module
- **Social media scheduling** — posts are made from a phone; tools exist and cost less than building one
- **Ad creative management** — Meta and Google do this better, for free
- **Email and SMS engines** — Phase 2 at the earliest, and only after WhatsApp proves itself
- **Loyalty** — Phase 3, deliberately (D11)
- **Workflow builder, forecasting** — unchanged from `RADIAN_MODULE_PRIORITY.md` Tier 5
- **Branch** — no branch field anywhere, matching HR

---

## 9. Open — still the owner's to decide

None of these blocked the build. Each one is a **setting with a working default**,
changeable from Marketing → Settings without touching code.

| | Question | Default in place |
|---|---|---|
| 1 | Days on hold after delivery | **7** — should be matched to the real return policy |
| 2 | Smallest withdrawal | **৳500** |
| 3 | Default commission rate | **10 %**, overridable per affiliate |
| 4 | Reminder lead time | **7 days, then 3** |
| 5 | **The WhatsApp message** | A placeholder is in place. It needs the owner's own words — a translated message reads like a machine and customers can tell |
| 6 | **Marketplace commission** | Not answered. Is foodpanda's and Sugary's cut recorded in Finance today? If not, reported profit on those orders is overstated. Outside this module, but it must not be lost |
| 7 | Referral reward shape | Not answered — Referral is not built yet |

---

## 10. Built — 28 Jul 2026

### What is in

| Area | Where |
|---|---|
| Schema — 8 tables, 3 additions elsewhere | `apps/api/prisma/schema.prisma` |
| Migration | `radian_marketing_migrate.bat` |
| API | `apps/api/src/marketing/` — campaigns · attribution · affiliates · outreach · settings · automation |
| Sales channels | `/orders/channels` — the screen that never existed (MKT-D12) |
| Screens | 15 routes across four sub-modules — see §5 |
| Offers moved | `app/offers/*` → `app/marketing/offers/*`, old routes left as redirects; every admin link updated |
| Finance change | `Expense.campaignId` + a campaign dropdown on the expense form; accounts `2120` and `5451` seeded |
| Meta ad numbers (MKT-D20) | `apps/api/src/marketing/ads.service.ts` · `/marketing/ads` · `radian_ads_migrate.bat` |
| Loyalty (MKT-D21) | `apps/api/src/marketing/loyalty.service.ts` · `/marketing/loyalty` · `radian_loyalty_migrate.bat` |
| Self-test | `apps/api/src/marketing/marketing.selftest.ts` · `radian_marketing_selftest.bat` |

### Known gaps — stated plainly rather than discovered later

1. ~~Commission accrual is not automatic.~~ **Closed** — MKT-D14. It now accrues
   by itself, within fifteen minutes of the order being marked delivered, and
   the button remains for anyone who wants it this second.

2. ~~Commission reversal is not wired to Returns.~~ **Closed** — MKT-D14. A
   cancelled or wholly returned order gives the money back unasked. A partial
   return is flagged rather than guessed at.

3. **UTM capture waits on the storefront.** Rung 3 of the ladder is built and
   tested; the columns stay empty until the new storefront forwards
   `utm_campaign` on order creation. Rungs 1, 2 and 4 carry the load meanwhile.

4. ~~Referral and Loyalty are not built.~~ **Closed** — Referral MKT-D16 (28
   Jul), Loyalty MKT-D21 (29 Jul). Loyalty ships **switched off** and must stay
   off until the radianbd.com customers are imported and their opening balances
   seeded, or the customer who has bought forty times starts at zero.

   Still open on the Loyalty side: **no customer-facing surface.** Points can be
   spent from the admin against an order; the storefront checkout and the POS
   points tender arrive with Ecommerce and POS respectively. Both must call
   `LoyaltyService.quote()` — the 20 % cap has to keep living in exactly one
   place.

5. **The WhatsApp Business API claim is unverified.** The owner says the
   credentials exist. "WhatsApp Business app" and "WhatsApp Business API" are
   routinely confused, and it will be checked before any Phase 2 work. Phase 1
   does not depend on it.

---

## 11. Self-test

`apps/api/src/marketing/marketing.selftest.ts`, run by
`radian_marketing_selftest.bat`. It invents its own campaign, affiliate,
customer, recipient and orders; drives orders through all five rungs of the
attribution ladder; checks that revenue comes to exactly the right figure with
VAT and a cancelled order excluded; earns commission, tries to withdraw it
early, returns an order and checks the clawback nets off the next payout; opens
the resulting journal entries and reads them; and tries every rule that is
supposed to say no.

**The test that matters most** plants a decoy ledger entry on the exact
`sourceKey` the next payout will use, then attempts the payout. `postEntry()`
judges it a duplicate and returns `null`. The rule says refuse and leave nothing
behind — and the test checks that no payout row survives and no commission was
marked paid. That is the HR-R28 shape, reproduced deliberately, because in HR
the same silence wrote "APPROVED" over an empty ledger and no review, no code
reading and no use of the screens caught it.

Cleanup runs before and after, and it also sweeps the `AFFCOM:` / `AFFREV:` /
`AFFPAY:` keys the module's own entries carry — a marker of ours never reaches
those, and that exact leak is what hid the HR bug for a month.

---

---

## 12. How to run it

```
1  radian_marketing_migrate.bat     the tables, once
2  radian_lock_all.bat              restart with the new code
3  open the panel → Marketing
4  radian_marketing_selftest.bat    proves the rules, cleans up after itself
```

---

## 13. Full module review — 30 Jul 2026

Requested by the owner after the module was declared finished: read every line
again and find what is broken. Nine things were, five of them seriously. All
nine are fixed and each one now has a check in §14 of the self-test, so undoing
any of them turns the run red.

Prefix `REV-MKT-`.

| | Severity | What was wrong |
|---|---|---|
| 1 | 🔴 Critical | `findUnique` through `prisma.db.*` was **not soft-delete filtered** |
| 2 | 🟠 Major | Pausing an affiliate did **nothing** — they kept earning |
| 3 | 🟠 Major | A wholly **returned** order did not take back Loyalty or Referral points |
| 4 | 🟠 Major | **Deleted customers** stayed on the occasion list, with a WhatsApp button |
| 5 | 🟡 Minor | The unattributed-orders figure compared two different populations |
| 6 | 🟡 Minor | Two WhatsApp audience filters overwrote each other |
| 7 | 🟡 Minor | The affiliate list grouped every commission row in the database |
| 8 | 🟡 Minor | Pausing an affiliate wrote nothing to the audit trail |
| 9 | 🟠 Major | **Opting out did not stop Email or SMS** — only WhatsApp |

### REV-MKT-1 — `findUnique` was never filtered

Prisma will not accept a non-unique field in a `findUnique` where clause, so
`deletedAt: null` could not be pushed down the way it is for every other read.
The extension's header said as much and told callers to use `findFirst`.

They did not. **28 `findUnique` calls on soft-deletable models in Marketing
alone; 113 across the API.** What that allowed, all of it involving money:

- an affiliate payout **to a deleted affiliate**
- commission accrual **on a deleted order**
- loyalty points **on a deleted order**
- an order attributed **to a deleted campaign**

Fixed in `soft-delete.extension.ts`, once, for every module: `findUnique` and
`findUniqueOrThrow` now fetch by key and then **drop the row if it is
soft-deleted**. Filtering after instead of before.

Twenty-eight hand-edits would have drifted apart the moment somebody added a
twenty-ninth call — which is precisely how the singleton race got missed in five
places (§7 of `RADIAN_FINAL_REVISION_TODO.md`). Restore-from-trash paths were
checked first: all four use the RAW client, so none of them changed.

**The limit that remains:** it does not reach inside a nested `include`. That
still has to be handled by hand — REV-MKT-4 below is exactly that case.

### REV-MKT-2 — a paused affiliate is not paused

`remove()` on an affiliate who has ever earned does not delete them; the ledger
still points at their rows, so it sets `status: 'PAUSED'`. **Nothing read that
status.** The owner pressed remove, the screen said paused, and the fifteen
minute sweep went on accruing commission on every new order carrying their code.

Attribution rung 1 and `accrueForOrder` now both require `ACTIVE`. Payout
deliberately does **not** — what they earned while active is still theirs, and
pausing somebody must not quietly confiscate their money.

### REV-MKT-3 — a whole return kept its points

The affiliate side has read `SalesReturn` since it was built (MKT-RULE-014).
Loyalty and Referral only ever tested `salesStatus === 'cancelled'`, so a
customer could send an entire order back and keep the points — and the owner had
been told returns were handled. Both reconcilers now use the affiliate's test,
with the affiliate's restraint: only a **whole** return reverses; a partial one
is flagged, not docked by a formula nobody can explain (MKT-D14).

### REV-MKT-4 — deleted customers on the occasion list

`RecipientOccasion` is filtered, but the recipient and the customer arrive
through a nested `include`, which the extension does not reach into. The
`marketingOptOut` check two lines below already knew that trap; the rows above
it did not. A deleted customer kept appearing every year with a one-click
WhatsApp button beside their name.

### REV-MKT-5 — the honesty figure was drifting towards zero

`unattributed30` = orders **placed** in 30 days − attributions **decided** in
30 days. Two different populations. Re-running attribution over old orders,
which the nightly sweep does across 365 days, pushed the second number up
without touching the first. MKT-D03 exists so that "how many orders we cannot
explain" is told honestly; it was quietly flattering itself. Both halves now key
on the order's own `placedAt`.

### REV-MKT-6 — the audience filters overwrote each other

`orderedWithinDays` and `notOrderedForDays` each assigned `where.lastOrderAt`
outright, so asking for "bought in the last 90 days but not in the last 30" got
just the second half — a **wider** list than anybody asked for. On a send list,
wider is the wrong way to be wrong.

### REV-MKT-9 — the opt-out rule held on one channel only

MKT-RULE-009 reads "excluded from every list and every send. Exception: none."
WhatsApp enforced it twice over — the audience filter drops opted-out customers
and `OutreachService.log()` refuses them again. `MessagingService.sendEmail()`
and `sendSms()` enforced it **nowhere**: both take a `customerId` and sent.

Nothing has been harmed by it, but only because no email or SMS key is saved
yet. That is luck, not a design, and it runs out the day the first key is
pasted in.

Worth recording how the fix went wrong once first: the guard was added at the
top of the provider logic, *below* the "channel is switched off" and "no key
saved" checks. The self-test went red immediately — refused, but with the wrong
reason. That ordering would have looked fine today and started letting sends
through the moment a key was saved, which is the worst possible time to find
out. The check now runs **first**, before anything about configuration, because
a rule with no exception must not sit behind a condition that happens to be
failing for another reason.

### What the self-test could not have caught, and now can

None of these nine showed up in 160 passing checks, because every one of them
was a case nobody had thought to write down. §14 pins all nine. Two of them
needed real fixtures to be worth anything: a completed `SalesReturn` for
REV-MKT-3, and a customer with a known `lastOrderAt` for REV-MKT-6 — an earlier
draft of the REV-MKT-6 check compared `0 ≤ 0` and would have passed whatever the
code did, the same shape of empty test the 29 Jul review had already caught once.

**Result: 183 passed, 0 failed.** HR's self-test (65 checks) was run afterwards
to confirm the extension change broke nothing elsewhere, and the panel was
opened on the Marketing, Affiliates and Products-trash screens.
