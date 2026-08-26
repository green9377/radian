# Phase 5 — Checkout & Payment: the owner's rulings (26 Aug 2026)

Six decisions, all answered by the owner on 26 August 2026 before any Phase 5
code was written. The five questions in `RADIAN_PHASE5_DIRECTION.md` §6 are
closed by DEC-FIN-029/030/031, DEC-SAL-014, DEC-SAL-015 and DEC-PRD-060.

---

## The facts these decisions rest on — read from the live SSLCommerz panel

Verified 26 Aug 2026 in the merchant panel (`report.sslcommerz.com`), store
`radianbd0live`, and cross-checked against SSLCommerz's own API documentation.
Nothing below is an assumption.

| Fact | Value |
|---|---|
| Gateway charge (TDR) | **2.5%** on every channel — VISA, MASTER, bKash, Nagad, Rocket/Nexus, every bank, every wallet. **AMEX 3.5%. NPSB 0%.** No separate VAT line on the fee |
| Settlement bank | BRAC BANK LIMITED, Natun Bazar branch, A/C 2071119390001, payee RADIAN, route 060263429 |
| Settlement threshold | **৳2,500** — below that, nothing is sent |
| Settlement timing | Not on bank holidays |
| `store_amount` | Present in the validation response: "the amount you will get in your account after bank charge". One documented example returns it EMPTY |
| Refund API | Exists; partial refunds allowed. Needs `bank_tran_id` (we already store it) + a `refund_trans_id` we generate. **Asynchronous** — `processing` then `refunded`, queried by `refund_ref_id` |

The arithmetic was checked against two real transactions that day:
৳1,700 → charge ৳42.50 → receivable ৳1,657.50, and ৳1,450 → ৳36.25 → ৳1,413.75.
Together ৳3,150 in, ৳78.75 charged, ৳3,071.25 payable — which is exactly what
the panel's "Unsettled Payable" showed. The model below has to reproduce that
number or it is wrong.

---

## DEC-FIN-029 — Gateway money sits in its own account, and the charge is booked per payment

**Business problem.** An online payment of ৳1,700 is not ৳1,700 arriving in the
shop's bank. SSLCommerz keeps ৳42.50 and sends ৳1,657.50, days later, and only
once ৳2,500 has piled up. Today `moneyAccountFor('online')` drops the full
৳1,700 into a generic Gateway account with no charge recorded at all, so the
books claim money the shop does not have and a real cost of doing business is
invisible.

**Decision.** The customer's payment stays ৳1,700 on the order — that is what
they paid and it must never move. In Finance it splits at the moment the
payment settles: the **receivable** (`store_amount`) is debited to a dedicated
**SSLCommerz Gateway** money account, and the difference is debited to a
**Gateway charge** expense account. The Gateway account therefore always holds
exactly what SSLCommerz still owes the shop.

**Reason.** The charge is knowable per transaction — SSLCommerz returns it in
the same validation response the payment is already settled from, so there is
nothing to estimate. Booking it then rather than at settlement means every
order carries its true cost on the day it was earned, and profit per order is
honest. And a Gateway account that mirrors the panel's "Unsettled Payable" is a
number that can be checked against an outside source, which is the only kind of
balance worth keeping.

**⚠️ When `store_amount` is empty or missing, the charge is recorded as ZERO
and the full amount goes to the Gateway account.** It is never derived from a
2.5% assumption. A rate typed into code is a rate that will be wrong the day
SSLCommerz renegotiates it, and a wrong charge is worse than a missing one —
the missing one shows up as a gap at settlement and gets fixed; the wrong one
quietly poisons every profit figure.

**Alternatives considered.**
- *Book the charge as a lump sum at settlement time.* Rejected: the fee would
  land on the wrong date, and per-order profit would be permanently unknowable.
  This was the author's own first recommendation and the panel disproved it —
  the per-transaction figure was there all along.
- *Compute the fee as 2.5% in code.* Rejected: AMEX is 3.5%, NPSB is 0%, and
  the rate is a commercial term that changes without touching this codebase.
- *Send the full amount straight to the BRAC Bank account.* Rejected: the bank
  statement would disagree with the books for days at a time, and the money
  stuck at the gateway would be invisible.

**Impact.** Finance (chart of accounts, `finance-events.service.ts`), Shop
payment (`payment.ts` — the validation response must now be read for
`store_amount`), Reports (profit per order).

**Related.** DEC-FIN-008 (money accounts), DEC-GBL-006 (a method is not an
account), DEC-FIN-030.

---

## DEC-FIN-030 — Settlement is its own screen, not a hand-written transfer

**Business problem.** When SSLCommerz pays out, the money has to move from the
Gateway account into BRAC Bank. Finance → Money in/out can already do that, but
it accepts whatever figure is typed without knowing what the Gateway account is
supposed to hold — so a mistyped settlement leaves an orphan balance that
nobody notices until it is old and untraceable.

**Decision.** A small **Gateway settlement** screen: it shows what the Gateway
account currently holds, takes the settlement date and the amount that reached
the bank, posts the transfer, and says plainly when the two do not agree.

**Reason.** This reconciliation will happen several times a month for as long
as the shop takes card payments, and its correctness can be checked against an
outside authority — the panel's own Unsettled Payable. Work that recurs and can
be checked automatically should not be done by hand. The owner was given both
options and the trade-off in plain terms and chose the screen.

**Alternatives considered.** *Money in/out only.* Rejected by the owner after
the failure mode was explained: nothing to build, but every settlement has to
be reconciled by eye and a slip is found late or never.

**⚠️ Scope note.** This is Finance work landing inside a Checkout phase. It is
here deliberately: the charge (DEC-FIN-029) and the settlement are two halves
of the same money circle, and testing one without the other proves nothing. The
owner was asked and chose to build it now rather than defer to Phase 9.

**⚠️ No new table, and that was a correction.** A `GatewaySettlement` model was
written into the schema and removed the same hour. A payout is money moving
from one money account to another, and `Transfer` already owns that fact —
document number, date, actor, note and all. A second table would have been a
second owner of one fact, which house rule 4 forbids. What is actually special
about a settlement is not the record but the rules around it, and those belong
in the service and the screen: the from-account is always Gateway, the payout
can never exceed what the gateway still owes, and the balance is shown so it
can be checked against the panel.

**Impact.** Finance (new screen + validation over the existing `Transfer`
posting), Administration (sidebar registry). No schema change.

**Related.** DEC-FIN-029, DEC-FIN-011 (reconciliation, light version).

---

## DEC-FIN-031 — An online refund may go back either way, and the shop chooses each time

**Business problem.** A customer who paid by card is owed money back. It can be
sent by hand (bKash, cash) or pushed through SSLCommerz's refund API onto the
original card. Only the manual path exists today, so the choice is not the
shop's to make.

**Decision, in the owner's words:** *"manual chaile manual refund, ar jodi chai
SSLCommerce theke dibe tahole taw jen dite pare — depend on customer upor and
amder situation ar upor."* Both paths are built. The refund screen asks which,
per refund.

**Reason.** The two are genuinely different instruments. The gateway refund
returns money to the card it came from, which is what a card-paying customer
usually wants and what leaves the cleanest trail — but it is slow and it cannot
be undone. A manual send-back is immediate and works for a customer who would
rather have it in bKash. Neither is right for every case, so neither is made
the rule.

**⚠️ The gateway refund is asynchronous, and the screen must not pretend
otherwise.** The API answers `success` when the request is *initiated*; the
money arrives later, and the status is only `refunded` after a separate query
on `refund_ref_id`. "Sent" and "arrived" are shown as two different things. A
screen that collapses them tells the customer their money is back when it is
not, which is the one lie a refund screen must never tell.

**Built sandbox-first** (house rule 10): going live means changing a key,
nothing more.

**Alternatives considered.** *Manual only* (nothing to build, but the shop can
never return money to the card it came from). *Gateway only* (cleanest trail,
but useless when the customer wants bKash and impossible once the transaction
is too old to refund).

**Impact.** Returns (refund screen), Shop payment (`payment.ts` — refund
initiate + status query), Finance (a gateway refund credits the Gateway
account, a manual one credits the money account it actually left).

**Related.** DEC-RTN-008 (cash refund capped at what was collected),
DEC-SAL-013 (the cancellation ladder), DEC-FIN-029.

---

## DEC-SAL-014 — A website order is paid in full or it is COD

**Business problem.** Big and custom orders are commonly part-paid up front.
The website offers only "pay everything now" or "pay the rider", so a customer
wanting to put half down has no way to.

**Decision.** Unchanged. The website takes the full amount online or COD.
Part payment on a website order is not offered; when it is needed, the order is
raised from the admin, where advance handling already exists.

**Reason.** The owner's call. Every extra choice at checkout costs orders, and
the case it serves is rare enough to be worth a phone call. Nothing is lost —
the capability exists on the admin side for the orders that need it.

**Alternatives considered.** *Offer "pay half now" on the site*, gated by amount
or by product. Rejected: it needs its own rules (what share, on which products,
what happens when the balance is never paid) and would put a second money
decision in front of every shopper to serve a handful of orders.

**Impact.** None — this decision is that nothing changes. Recorded so the
question is not reopened from scratch.

**Future review.** Revisit if custom/corporate orders through the site grow
enough that the phone call becomes the bottleneck.

---

## DEC-SAL-015 — A short payment is chased by a human, not by the system

**Business problem.** A customer can come back from the gateway having paid
less than the total. The money is real and is kept (`payment.ts` records it and
leaves the order part-paid on the due board), but nothing says who chases the
rest.

**Decision, in the owner's words:** *"ata manually handle krbe. dorkar hole link
dibe, delivery r time collect krbe — depend on customer."* The system's job is
to show the due clearly and to have `/pay/{orderNo}` ready. It does not send an
automatic chase message.

**Reason.** A short payment is rare and usually means something went wrong that
a person should look at before money is demanded. An automatic "you still owe
us" to a customer whose card was double-charged, or whose balance the shop has
already agreed to take at the door, is worse than silence. The two tools the
staff need — a due board that is accurate and a payment link that works — both
already exist.

**Alternatives considered.** *Automatic WhatsApp chase with the pay link*
(nothing for staff to remember, but it fires without knowing the situation).
*Always collect the balance at delivery* (rejected: it takes the choice away
from both the customer and the shop).

**Impact.** Orders (due board must show part-paid website orders honestly),
Messaging (no new automatic message — recorded so one is not added later by
assumption).

**Related.** DEC-FIN-029 (a short payment's charge is still whatever
`store_amount` says it is).

---

## DEC-PRD-060 — A prepaid-only product says so on its own page

**Business problem.** `prepaidOnly` products refuse COD, and the refusal is
enforced in `orders.service.assertCodAllowed` — at the very end of checkout.
A customer who has filled in the whole form only then learns they cannot pay at
the door, and that is where orders are abandoned.

**Decision.** The product page states it before the customer commits: this
product needs payment in advance. Checkout keeps its refusal — the page is the
warning, the server is the rule.

**Reason.** The owner chose it. A condition of sale belongs where the buying
decision is made, not where it is confirmed. The same reasoning as the delivery
promise on the card and the date pills on the PDP: tell them while they can
still choose.

**⚠️ The rule itself is not copied to the page.** The page reads the product's
own `prepaidOnly` field and says so; the decision about whether COD is allowed
stays in `assertCodAllowed`, in one place. The browser's copy of this rule
already went wrong once — 24 Aug 2026, when `apps/web/_data/payment.ts` looked
products up in a mock catalogue, never found them, and so offered COD on
made-to-order goods. A sentence on a page is not a second implementation; a
second `if` would be.

**Alternatives considered.** *Leave it to checkout* (works, refuses correctly,
but only after the customer has spent their patience).

**Impact.** Storefront PDP (`apps/web`), no API or schema change.

**Related.** DEC-PRD-048 (required personalisation is checked server-side too),
the COD note in `checkout.ts` §4.
