# THE ORDER — everything it touches, and everything to test

Written 31 Aug 2026, at the owner's request: *"order sathe amder system ar kon
kon function jorito, ar ki ki test kra lagbe."*

**Every line below was read off the code, not remembered.** The module list
comes from grepping who actually queries `Order` / `OrderLine`; the lifecycle
comes from the public methods on `OrdersService`. When this file and the code
disagree, the code is right and this file is stale — say so.

---

## 1. Why the order is the centre

An order is the one row almost every module has an opinion about. It is where
stock leaves, money arrives, a promise is made to a person, and the books are
written. That is also why nearly every fault this project has found lived at a
seam between two modules rather than inside one.

**26 files touch `Order` or `OrderLine`.** They fall into three kinds:

- **owners** — Sales writes the order; Delivery writes the assignment. Nobody
  else writes those facts (house rule 4)
- **listeners** — Finance, Inventory, Customer, Marketing, Messaging. They act
  on a *completed event*, never by reaching in
- **readers** — Intelligence, reports, the chat AI, the mushak return. They
  only look

---

## 2. The lifecycle — the eleven doors

`OrdersService`, in the order they can happen:

| method | what really happens |
|---|---|
| `create` | the order + lines are frozen (price, name, photo, variant, perso). Offers applied, stock **checked** not taken, customer account made from the order |
| `confirm` | `confirmedAt`. Books the workshop's day (capacity), fail-soft |
| `startPreparing` | **stock −qty** (DEC-MOD-003) — off the VARIANT's shelf when there is one. Inventory ledger mirror. `preparingAt` |
| `outForDelivery` | `outForDeliveryAt` (first departure only). Queues the customer message. Accepts a swap (DEC-DLV-021) |
| `delivered` | **revenue + COGS post to Finance** (DEC-FIN-002/003) · COD collected · customer LTV +1 · best-seller re-rank · `deliveredAt` |
| `failDelivery` | delivery marked failed; the parcel and its stock stay committed |
| `cancel` | per-line refund by rule, stock reverted if preparing had started, offer redemptions released, `cancelledAt` |
| `addPayment` | PAID / ADVANCE / COD_COLLECTED / REFUND → payment status re-derived → Finance |
| `addPhoto` | prep / delivery proof photograph |
| `edit` | guarded by stage: items lock at preparing, money locks at close, COD re-checked on added lines |
| `remove` | soft delete only — an order can never be hard-deleted (FKs everywhere) |

---

## 3. What is joined to an order, and by what

### Writes its own fact about the order

| module | the fact | fires on |
|---|---|---|
| **Delivery** | who is carrying it, when it left, what it cost, whether the cash came back | assignment create / out / delivered / fail / swap / settle |
| **Finance** | the ledger — revenue, COGS, delivery cost, gateway fee, refunds | delivered · payment · stock out/revert · return · delivery cost |
| **Inventory** | stock movements, the parallel ledger | preparing (−) · cancel (+) · stock issue |
| **Customer** | lifetime value, order count | delivered |
| **Offers** | redemption slots taken and released | create · cancel |
| **Capacity** | the workshop's day | confirm · cancel |
| **Returns** | the return record and its refund | staff-started, after delivery |
| **POS** | counter sales live in the SAME `Order` table (DEC-POS-001) | POS sale · shift close |
| **Messaging** | one row per message actually sent, so a duplicate can be refused | confirmed · out for delivery · delivered |
| **Marketing** | attribution, loyalty points, referral and affiliate commission | delivered / paid |

### Only reads the order

Intelligence (KPIs and lenses) · Finance reports, VAT mushak 6.3, drift and
doctor · the inbox chat AI · review invitations · outreach and campaign
audiences · merchandising (best-seller counts from `OrderLine`) · add-on
performance.

### The two that surprise people

- **POS shares the table.** Every online Sales screen filters
  `fulfillmentType: DELIVERY` (AUD-2). Forget it once and counter takings are
  counted twice.
- **The storefront checkout is not a separate order system.** It calls
  `orders.create`, so every rule — stock, COD, offers, capacity — runs there
  too. That is why the COD rule lived in one place and had to be fixed in one
  place.

---

## 4. The test list

Grouped by the circle it closes. **A test is not passed until it was walked on
the system and the result seen** — a type-check proves nothing about a seam.

### A · The money circle
1. Online payment end to end → order paid, gateway fee booked from the
   gateway's own `store_amount` (DEC-FIN-029), not a rate in code
2. COD self order on a made-to-order product → **accepted** (DEC-SAL-015)
3. COD on a gift → refused, in a sentence a customer can read
4. COD on a product marked *payment required* → refused, naming the product
5. Partial advance, then the rest at the door → payment status walks
   unpaid → advance_paid → cod_collected
6. Refund, manual and down the gateway (DEC-FIN-031) — and *sent* is not
   *arrived*
7. Price changed under the customer → 409, never a silent overcharge
8. **Every one of the above appears in Finance.** If it is not in the ledger it
   did not happen (CLAUDE.md §4 rule 4a)

### B · The fulfilment circle
9. Confirm → prepare → out → delivered, watching stock leave at *preparing*
   and off the **variant's** shelf
10. Assign from the order screen and from the board — both produce a
    `DeliveryAssignment` (§6.1)
11. **Swap the carrier on the road** → old = `SWAPPED`, new can still leave
    (DEC-DLV-021)
12. Fail a delivery, then retry it → `failed → out_for_delivery` (REV-M1)
13. Bulk assign 3+ parcels, one of them cancelled → the other two still go
    through, and the failure is named
14. Courier parcel with a consignment id → tracking URL built from the
    courier's own template
15. Deliver an unpaid online order → **refused** (REV-C5)
16. A blackout date and a full slot → refused at checkout
17. 2-hour, same-day and midnight against real slot cut-offs
    (DEC-DLV-018, DEC-INT-003)

### C · The rider's money — **walked 31 Aug 2026**, and it found a fault
18. ✅ Delivered parcel → record its cost → `Dr 5200 / Cr 2300`
19. ✅ Remit the rider's cash → clears the accrual (`Dr 2300`, **not** 5200).
    Walked on RAD-75470: 1110 went 0 → 267000 → 0, cash drawer +252000,
    5200 = 15000 (expensed once), `RMT-000001`
20. ⬜ A prepaid parcel also appears on the settle list — the rider was still
    paid. **Still not walked.** The code reads right; so did everything else
    in this section for a month
21. ✅ `costRecordedAt`, not `costPaisa > 0`, decides "priced yet"

⚠️ What the walk found: the settle screen asked `order.duePaisa`, which
delivery has already zeroed — so every COD parcel read as *prepaid*, the cash
could never be remitted, and the parcel left the board with the money still
sitting in 1110. Fixed; both `unsettled()` and `settle()` now read the
COD_COLLECTED payment.

### D · What the customer sees
22. Admin advances the order → the customer's own page follows
    (DEC-SAL-016), with real times, not invented ones
23. `/track` with order number + phone; wrong phone opens nothing
24. The success page shows the order in the URL, never the browser's last one
25. "On its way" is sent once — **not** again after a carrier swap

### E · The order's own contents
26. Variant order → the admin says which variant, everywhere (DEC-PRD-014)
27. Customer's photo → uploaded, on the line, downloadable full size
    (DEC-PRD-061)
28. A product with *photo required* → refuses an order without one
29. Personalisation text reaches the admin line
30. Bundles, add-ons and size upgrades priced by the server, not the browser

### F · Reports and books
31. Orders → Reports counted by the database; check the headline numbers
    against psql, not against the screen (REV-C4)
32. Revenue counts delivered orders only, and matches Finance
33. Counter sales stay out of the online figures
34. VAT mushak 6.3 from real orders

### G · The edges that have bitten before
35. Cancel a *preparing* order → stock comes back; cancel a made-to-order line
    → it does not (DEC-SAL-012)
36. Edit an order after preparing → items locked, money still open
37. Add a made-to-order line to a COD order → refused
38. A soft-deleted row keeps its number — a new return/order must not collide
39. Any admin action that a rule refuses → the reason appears **on the page**,
    never in a browser `alert()`

---

## 5. What is still open in Phase 6

| | |
|---|---|
| **row 20** | a prepaid parcel on the settle list — the only part of the rider's cash chain still unwalked |
| **variant photos** | data, not code: Products → the product → Variants, one photo per combination |
| **53 × `alert()`** | the rest of the admin — `ProductViews` (7), `OffersLive` (5), `ProductListView` (4), `OrderEditor` (4)… The delivery board is now the pattern to copy |

Closed 31 Aug: **DEC-DLV-022** (fail reason from a list) and the delivery
board's own nine `alert()`/`prompt()` calls.

`RADIAN_PHASE6_DIRECTION.md` carries the detail and what has already closed.
