# Radian — what is left, and what is worth building

_28 July 2026. Written after checking the owner's `radian-admin-os.html` module map
(17 July) against what is actually in the code. That file lists 60 modules; its own
status labels are now stale — it marks all eight Finance modules "planned", and
seven of them are built._

---

## 1. Where things actually stand

| Domain | Built | Partial | Not started |
|---|---|---|---|
| Master Data | 9 | 1 | 2 |
| Operations | 3 | — | 1 |
| Commerce | 4 | 1 | 2 |
| Finance | 7 | — | 1 |
| Administration | 2 | 3 | 2 |
| Intelligence | — | 2 | 4 |
| Marketing & Growth | — | — | 10 |
| Automation | — | 1 | 5 |
| **Total** | **25** | **8** | **27** |

The count reads worse than the position is. **The heavy modules are done** —
Sales, Inventory, Purchase, Delivery, POS, Returns, Finance and HR are the eight
that carry real business logic, and all eight are built and tested. Of the 27
remaining, ten are Marketing entries that amount to one API key each.

Three gaps the earlier planning had missed entirely:

- **Branch** — no table at all. Deliberately left out of HR for that reason.
- **Tax Management** — no table. VAT is one rate in settings; a per-item rate is
  not possible.
- **Audit Logs** — the data has been collecting since the first module. There is
  simply no screen to read it.

---

## 2. Priority

### Tier 1 — money is blocked until these exist

**Ecommerce** — cart, checkout, wishlist. The storefront still runs on mock data
here, so no order can reach the system from the website at all.
**Integrations** — the SSLCommerz key. Checkout without it takes no money.

These are one job. Splitting them means finishing neither.

### Tier 2 — these bring money in

**CRM — occasion reminders.** Somebody who sent flowers on their wife's birthday
last year gets a WhatsApp three days before it comes round again. For a flower
shop this is the single largest repeat-sales lever, and the dates are already in
the database — `RecipientOccasion` has been collecting them since the Customer
module.

**Backup.** Not a module: a nightly `pg_dump`. Today the whole business lives in
one Docker volume, and if it goes, everything goes. Cheap to do, and the cost of
not having it is the entire system.

### Tier 3 — nearly finished already

- **Company Settings** — Trade License, BIN, VAT, TIN. Mushak 6.3 is complete and
  waiting on the BIN field alone.
- **Audit Logs** — one screen over data that already exists.
- **Executive Dashboard** — every figure is already computed somewhere; this
  gathers them onto one page.
- **Content / CMS** — journal, FAQ, privacy/terms/refund are still placeholder
  text on the storefront.

### Tier 4 — when the business grows, not before

Branch (a second shop) · Warehouse screen (a second store room) · Tax Management
(more than one VAT rate) · Budget (once there is planning to do) · Loyalty (once
CRM has proved itself) · Quality (once more is made in-house).

Building any of these now means guessing at requirements that do not exist yet.

#### Branch — confirmed as later, 28 July, and the reasoning checked

The owner's position: there is one shop, so there is nothing to branch.

Checked rather than assumed, and it holds — five tables **already carry a
nullable `branchId`**, each commented *"soft ref until Branch module"*:
`Order`, `PosRegister`, `JournalEntry`, `Expense`, `Income`. Somebody in an
earlier cycle left the holes open on purpose.

So the retrofit later is: one `Branch` table, real foreign keys in those five
places, and every historical row set to branch one. **While there is one shop
that backfill is trivial** — every row belongs to the same branch by definition.
Left until after a second shop opens, the same migration would have to answer
"which shop was this sale from?" for rows where nobody knows.

Delaying is correct, and the cost of delaying is small. Doing it now would put a
branch selector on every screen for a business with nothing to select.

Employee has no branch field for exactly this reason (HR, §8 non-goals).

### Tier 5 — recommended NOT to build

This is the part worth arguing about, so the reasoning is given for each.

| Module | Why not |
|---|---|
| Paid Advertising | Meta's own tools are better and free. A wrapper adds a step and removes features. |
| Social Media Management | Posts get made from a phone. Scheduling tools exist and cost less than building one. |
| SEO Management | This is a checklist, not a module. Title, description, sitemap, speed — done once in the storefront. |
| Email Marketing | WhatsApp dominates in Bangladesh. Two channels means two costs and two lists to keep clean. |
| SMS Marketing | Same, plus per-message cost and no images — for a flower shop, pictures are the product. |
| Referral · Affiliate | Both need scale to mean anything. With three customers on file they are decoration. |
| Forecasting · AI Recommendations | Need one to two years of real sales. The books restart from zero today, so anything built now would be trained on nothing. |
| Workflow Builder | Building a tool to build workflows, for an eight-person shop, is the classic trap. The two or three workflows actually needed are cheaper written directly. |
| Approval Workflow | Already there in the form that matters: three roles, and a PIN on every money action. |

**27 left → 10 genuinely needed, 6 that can wait, 11 better not built.**

---

## 3. Suggested order

1. **Ecommerce + Integrations** — the storefront starts earning
2. **Backup** — before there is anything worth losing
3. **CRM occasion reminders** — the repeat-sales engine
4. **Company Settings · Audit screen · Dashboard · CMS** — the near-finished four
5. Then reassess. Tier 4 depends on how the business has actually grown, and
   guessing at that today would be exactly the mistake this document exists to
   avoid.

---

## 4. Working rules that carry forward

- One module at a time; decisions locked before any code.
- Bangla in conversation, English in code and UI.
- Every schema change gets a `.bat`; the owner does not use a terminal.
- **Every module ends with a self-test** in the shape of `hr.selftest.ts`. The
  most dangerous bug found in HR — a payroll marked approved while nothing
  reached the ledger — was invisible to the design review, to reading the code,
  and to using the screens. Only the test caught it.
