# PHASE 8 DIRECTION — written 1 Sep 2026, for the first message of a new chat

**Read in this order:** `CLAUDE.md` (the standing brief) → **this file** →
`RADIAN_PENDING.md` (the live board) → `RADIAN_ORDER_MAP_AND_TESTS.md` (what an
order touches, and the 39 tests).

`RADIAN_PHASE7_DIRECTION.md` is **history now** — open it only to see why a
Phase 7 decision was made. **Phases 0–7 CLOSED.**

---

## 1. Where Phase 8 is going (the owner's words, 1 Sep)

> *"amder pura system amra amder real business ar data diye kaj start kre dibo
> sob kichu clear hole. amder akhono mobile frendly theke start kre onk kaj
> baki ache kra."*

Two things, in this order:

1. **Make it clear** — finish what is still half-done, so the system can be
   trusted with real money.
2. **Then start on the real business data**, and the long list that begins with
   **mobile-friendly**.

⚠️ Do not read "real data" as the cutover to `radianbd.com`. That is its own
later conversation and the owner has ruled on it twice
(*"live ar ktha vule jaw"*). See §5.

## 2. How we work (unchanged, and not up for discussion)

1. **One page or feature at a time.** Nothing new starts until the owner has
   seen the last thing and said so.
2. **Never invent a business rule.** Ask. Guessing is the most expensive
   mistake on this project.
3. **Say when there is a better way** — with the reason. Agreement alone is not
   help.
4. **Verify before reporting.** The owner sees work ONCE, finished. "Measured"
   and "inferred" are said in the same sentence as the claim.
5. **English only in files** — code, strings, comments, commit messages, and
   these `.md` files. Bangla belongs in the chat. Touching a file that still
   carries old Bangla comments means translating them in the same edit.
6. **Design:** premium, emotional, clean, minimal, trustworthy. No page prose —
   explanations behind the ⓘ. One `MoneyBlock`, one `QtyStepper`, one `Said`,
   house count-cards, bold clear buttons.
7. **This is not a demo.** Real orders, real books; only the GATEWAY KEY is
   sandbox. Write "the system", or the address.
8. **Every movement of money lands in Finance.** If it did not reach Finance,
   treat it as not having happened.

## 3. Ship path

```
code → build on a BRANCH first → VPS: git checkout <branch> && docker compose … up -d --build
     → read the build output for "error TS"
     → merge to main only once it is green, then deploy main
     → git log --oneline -1 ON THE VPS  ← do not skip
     → open the live link and LOOK
```

Branching first is not ceremony: on 1 Sep it caught three real TypeScript
errors before `main` ever saw them.

⚠️ **The hPanel "Web console" opens a popup this tooling cannot reach, and the
session dies every 20–30 minutes.** Get the URL out of it instead — this works
every time:

```js
window.__u=null;
window.open=function(u){window.__u=String(u);return{focus(){},close(){},closed:false};};
[...document.querySelectorAll('button,a')].find(e=>/web console/i.test(e.textContent||'')).click();
// then navigate to window.__u  (it carries a ?session_id=…)
```

- web `https://development.radianbd.com` · admin `https://admin.development.radianbd.com`
- api `https://api.development.radianbd.com` · media `https://media.development.radianbd.com`
- commit author stays `green9377 <amiparboinshaallah@gmail.com>`
- the owner logs into the admin himself — never ask for credentials

## 4. What Phase 7 closed

Everything below was walked on the system before it was reported.

| | what it was | now |
|---|---|---|
| **P7-1…P7-11** | the counter: a shift open 11 days, cash leaving the till with Finance never told, a refund that never left the drawer, an invented ৳12,260, two shifts at once, a count box that could not hold paisa — and the till could not take cash at all | all fixed and walked; DEC-POS-025/026/027 |
| **P7-12…P7-17** | purchase returns told Finance nothing · stock from nowhere never reached the books · store credit could be given but never spent · every POS payment credited the receivable twice · money paid before the goods booked as a payment | all fixed, with live cleanups recorded in PENDING |
| **Instagram** | dead 2½ days. Meta held the messages, our token could read them, and Meta pushed none — every setting reporting healthy | a poller under the webhook. First tick recovered **133** messages, including customers nobody had answered |
| **Messenger** | quietly dropping messages too; nobody had counted | the same poller caught **34** |
| **"Guest"** | 48 of 49 Facebook threads. Not the token, not the scopes — the code asked `/{psid}`, the one endpoint Meta refuses | names come from the conversation listing. **Guest = 0 on both channels**, and it repairs itself now (three separate ways) |
| **"which admin replied"** | wanted, and Meta will not say — an outgoing message is *from the Page*, on both channels | the screen says **"Replied from Meta"** rather than inventing a name |
| **DEC-INB-011** | a per-thread AI switch that would have silenced one customer forever | one switch, at the top, true everywhere |
| **attachments** | `ig_post`, `ig_reel`, `unsupported_type` printed as raw signed URL and pushed a sideways scrollbar | every kind renders; video plays, audio plays, expired links fall back to a card |
| **the inbox shell** | a long thread grew the PAGE; the list slid off the top, the composer walked off the bottom | one viewport, exactly two scrollers, composer pinned |
| **the drift checker** | said the shop owed suppliers **nothing** while six bills were open — it netted every supplier together and clamped once, and counted bills whose goods had not arrived | per supplier, floored per supplier and per bill, RECEIVED only |
| **sales returns** | goods went back on the shelf and the books were never told: Inventory writes `refType 'SALE_RETURN'`, Finance looked for `'RETURN'` | fixed + backfilled: **৳3,560** posted, 15 of 17 returns |
| **stock drift** | compared the books against *today's* cost while the books hold cost-at-movement — then apologised for it in its own advice | same basis both sides; revaluation reported separately. **−৳4,097.01 → −৳160.64** |
| **P7-4** | the till's day started at the server's midnight, not Dhaka's | proved on the two real midnight sales (POS-000002, POS-000014) |

**The drift board at the close of Phase 7:**

```
watch  supplier-dues   books   4,050.00   real   4,480.00   diff  −430.00
watch  stock-value     books 106,804.81   real 106,965.45   diff  −160.64
wrong  negative-money  −5,772.95                          ← the owner's
everything else: ok
```

## 5. What is on the table for Phase 8

### ✅ The engineering side is CLOSED — 1 Sep evening

Everything on this list that was ours to do is done, deployed and walked on the
live system. Full account in `RADIAN_PENDING.md`; in one screen:

```
supplier-dues  −৳430.00  →  ok, 0    books ৳4,480 = the purchase register
stock-value    −৳160.64  →  ok, 0    1150 = the stock ledger, to the paisa
negative-money −৳5,772.95   wrong    ← the owner's, and only his to close
everything else                ok
```

- **P8-1** a replacement's goods left the shop costing nothing (৳405.15)
- **P8-2** ৳1,070 of advances that could never come out of 1200
- **P8-3** goods from a half-received bill were invisible → **2050 Goods
  Received, Not Billed**, and half-received is now a state the books describe
- **P8-4** stock booked at the bill total, not at what the goods cost (৳334.21)
- **P8-5** ৳1,500 paid to suppliers against no bill discharged the payable
- **DEC-INB-011 finished** — `aiDefaultForNew` is gone: DTO, settings write,
  admin type, schema, migration. A dead switch on a settings screen is a
  promise the system does not keep
- **the live path walked too** — `PUR-000015`, a real bill in two deliveries,
  drift `ok · 0` at every step (not just the backfill: the next bill too)

### What is left in Phase 8 is the OWNER'S, and he has said he will do it later

1. **Opening balances.** Finance → Money accounts → *Post opening balances*.
   `1000 Cash Drawer` reads **−৳5,472.95** and `1030 Other Wallet` **−৳300**
   because the shop's day-one money was never recorded. Nobody else can invent
   those numbers.
2. **The SSLCommerz live key** — the only thing still in sandbox.
3. **`WHATSAPP_*` and `RESEND_API_KEY`** — never set anywhere. Without them a
   customer gets no order message at all.
4. **The real catalogue, stock, suppliers and staff.**

### The owner's own next list

4. **MOBILE-FRIENDLY — he named it first, and it has never been started.** Both
   apps. The admin was built at desktop widths throughout; the new inbox shell
   is `h-[100dvh]` with a fixed 360px list, which is exactly the shape that
   breaks on a phone. Expect this to be a real phase, not a pass.
5. **Real business data.** Everything so far has been our own orders. Starting
   on his real catalogue, real suppliers, real staff and real opening balances
   is its own body of work — and the drift board is the thing that will tell
   the truth about whether it landed.

### Never walked

6. **HR/payroll, Marketing, Intelligence.** Each has code and screens; none has
   had somebody walk a whole circle with the owner.
7. **WhatsApp has never received a single message** — 0 threads, ever. Whether
   nobody has messaged the number or it is broken like Instagram was has **not
   been distinguished**. Do not guess; send one and watch.
8. **`WHATSAPP_*` and `RESEND_API_KEY` were never set anywhere.** Those
   features are silently off until keys exist.
9. **SMS is send-only by decision** (owner, 31 Aug) — the gateways are one-way
   masking SMS. It is off the inbox on purpose. Receiving needs a two-way
   short/long code bought from the operator.
10. **9,500-odd lines of Bangla comments** in ~250 files. The rule is nothing
    new ever; the backlog is swept file-by-file as files are touched.
11. **Variant photos** — data, not code. Products → the product → Variants.

## 5b. How far is it from real trading? (asked 1 Sep — measured, not guessed)

**The shop was built mobile-first. The admin was not.** Counted in the repo:

```
apps/web    142 tsx files   105 of them (74%) use breakpoints   382 uses
apps/admin  373 tsx files   112 of them (30%) use breakpoints   678 uses
            347 fixed w-[NNNpx] and 50 min-w-[NNNpx] in the admin
```

So a customer on a phone is largely served today; **the owner and his staff on
a phone are not**. That splits the road into three, and only one of them is
big engineering:

| | what it is | who does most of it |
|---|---|---|
| **Phase 8 — make it clear, then real data** | the SSLCommerz **live key**, opening balances, the ৳1,500 decision, `WHATSAPP_*` and `RESEND_API_KEY` (without them a customer gets no order message at all), and entering the real catalogue, stock, suppliers and staff | **mostly the owner.** Days, not weeks |
| **Phase 9 — the admin on a phone** | 261 of 373 admin files have no breakpoint at all, and the new inbox shell is `h-[100dvh]` with a fixed 360px list | **engineering.** A real phase |
| **Phase 10 — the cutover** | 395 indexed URLs on `radianbd.com` in shapes this system does not serve; a redirect map and the old shop's data | engineering + a decision the owner has twice deferred |

⚠️ **He can trade on `development.radianbd.com` at the end of Phase 8.** Phases
9 and 10 make it comfortable and move the address — neither has to come first.

Everything after that (HR/payroll, Marketing, Intelligence, the Bangla backlog)
is improvement while trading, not a gate in front of it.

⚠️ **Not verified:** the storefront has not been opened on a real phone. The
viewport meta is correct and 74% of its files are responsive, but nobody has
looked. That is one minute of the owner's time and worth spending before
Phase 8 closes.

## 6. ⚠️ The bare domain is NOT ours to point anywhere

`radianbd.com` runs the owner's **existing, trading shop** — getCommerce, its
own admin, a live cart, real prices, and **395 URLs in Google's index** (201
`/product/<slug>`, 167 `/category/<slug>`, 9 posts). Our system serves flat
`/[slug]`, so **not one of those URL shapes survives a cutover** without a
redirect map.

Owner's ruling, twice: **build the system first.** Do not touch the bare
domain, its DNS, or the old shop's data. Measurements for whoever opens it are
in `RADIAN_PHASE6_DIRECTION.md` §3.

## 7. Test rows left on the system, on purpose

Real rows in the real books — several are delivered with revenue posted and
cash settled, so cancelling them now would write refunds that never happened.

Orders `RAD-92283` · `RAD-51013` · `RAD-75470` · `RAD-52077` · `RAD-86607` ·
`RAD-57835` · `RAD-76123` · three from the bulk-assign walk ·
assignments `DLV-000001`–`DLV-000010` ·
POS `POS-000015` (+`RTN-000018`) · `POS-000016` · `POS-000017` · `POS-000018` ·
`EXP-000001` (৳250.50) · shift `SHF-000003` open on Main Counter ·
the *Anniversary GIFT* product still carrying `stockQty: 5`.

## 8. Traps this project has already sprung

| trap | what happens |
|---|---|
| **a partial reading stated as a whole conclusion** | four wrong calls in one afternoon on 31 Aug. Measure each thing separately, and say which half is measured |
| **an absence is not evidence** | an empty screen and a silent log are both absences. Prove the thing would have spoken before concluding from its silence |
| **fixing the repair, not the path** | the Guest names were backfilled while every NEW thread kept arriving broken. Fix the live path too, or it comes back tomorrow |
| **a deploy that never ran** | the code is right, the behaviour is old, and the wrong conclusion is the obvious one. Check `git log -1` on the VPS |
| **two doors to one fact** | one of them will be silent. The courier bug, the COD rule, and the sales-return restock were all this shape |
| **a checker that apologises in its own advice** | if the yardstick has to explain itself away, the question is wrong. Fix the question |
| **`Math.max(total, 0)` over a whole shop** | it turns a negative into a tidy zero and the fault disappears. Clamp per party, never in aggregate |
| **a screen computing from a paged list** | right under 100 rows, lying past it |
| **a column one module zeroes and another reads** | every COD parcel read prepaid for a month |
| **a soft-deleted row keeps its number** | number generators read the raw client and retry on P2002 |
| **routes under a `:id` route** | put static routes ABOVE `:id` |

---

_Phase 7 closed 1 Sep 2026. Phase 8 opens on the owner's word._
