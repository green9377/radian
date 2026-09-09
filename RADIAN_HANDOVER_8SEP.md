# Radian — hand-over, 8 September 2026 (evening)

> **Read this first in a new chat.** It says where the code stands, what was
> built between 2 and 8 September, how it was shipped, and what the owner
> asked for next. Everything here was verified on the running system
> (development.radianbd.com) before being written down.

---

## 1. Where everything stands

| place | on | note |
|---|---|---|
| **GitHub `origin/inv-rev-4-opening-guard`** | `f54ea98` | ⬅️ **the active branch. All work since 2 Sep is here.** `origin/main` (`967a7dc`) was merged INTO it on 8 Sep, so it is ahead of main by ~80 commits and behind it by nothing |
| **VPS `/root/apps/radian`** | `7eb0f3f` | **the running system** — a chain of `Merge inv-rev-4-opening-guard` commits on top of the branch; nothing on the VPS is unpushed |
| `origin/main` | `967a7dc` | the trunk. **Not merged into.** Merging to main and deploying to production both need the owner's explicit say-so |
| laptop `D:\radian` | unknown / stale | **never touched from this session** (owner's order). Work happens in the worktree `D:\radian-test` |

Worktree: `D:\radian-test` is a git worktree of `D:\radian`
(`git --git-dir=D:\radian\.git\worktrees\radian-test --work-tree=D:\radian-test`).
Do not reset, stash, rebase or switch anything in `D:\radian`.

**Standing orders still in force** (owner, 2–8 Sep): do not turn the AI on ·
no real outbound without asking (DEV shares the REAL WhatsApp/SMS credentials;
the outbound guard sends only to `RADIAN_TEST_PHONE` and the test email) ·
never handle his password or PIN, never mint an `AppSession` · do not touch
the outbound kill switch (normal state OFF) · no merge to main, no production
deploy, no PROD schema · one page or feature at a time · ask before assuming a
business rule · **no Bengali in any file** (`no-bangla.selftest.mjs` runs in
BUILD_CHECK; the baseline was refreshed on 8 Sep after main's CLAUDE.md came
in) · every claim of "tested" must have been run and seen.

The owner lets a session use his logged-in admin tab in Chrome (token in
`localStorage["radian.token"]`) to call admin APIs, and the Hostinger web
console to deploy.

---

## 2. What was built, 5 → 8 September (all on DEV)

Storefront
- **Category page** (`[slug]`, `[slug]/[sub]`): parent + sub-category resolve
  end to end (`?sub=`), real 404s, real data only (no mock fallback), one
  image system (`ui/TileImage.tsx` — real `<img>`, media variants, one
  lavender placeholder, never a gradient), SEO (canonical, JSON-LD
  Breadcrumb/ItemList/FAQ, sub-category meta), filter → grid scroll, grid
  fetches 8 then batches, one design rhythm (`SectionShell`, `--page-w`).
  Gift Finder = the homepage wizard scoped to the category. Better Together =
  admin-picked products; Keep Exploring = other categories.
- **Product page**: real `<img>` gallery with a `large` (≤1200 WebP) main
  photo (`media-variants.mjs` backfilled 617 files), thumbnail-rail arrows,
  no template sentences, one discount badge in the admin's shape (FLAT →
  "৳150 OFF", PERCENT → "2% OFF"), no sticker on the photo, offer countdown
  follows the variant switch, upgrade/add-on rails scroll on desktop, "+ Add"
  adds, delivery chip = the Delivery module's own method label, sub-category
  rung in breadcrumb + JSON-LD, **JSON-LD as ProductGroup/hasVariant** with
  the admin SKU (variant sku = linked Item's code, else product code + option
  names), meta fallbacks name no delivery promise.
- **Cards**: discount pill under the price (not on the photo); **Sold out /
  Pre-order** from the one availability rule (`availabilityOf`, now on cards
  too); "Add" opens the product page (it had no handler).
- **Wishlist** works with real products (`GET /shop/products-by-slugs`; it
  used to resolve against the mock catalogue). PDP heart writes the store.
- **Arch cards** (`ui/ArchCard.tsx`) for every pick-a-thing tile; homepage
  occasion tiles = budget tiles in size (322×415, four across).
- **Checkout**: FlowerAura's shape — rail of steps on the left, one step open
  on the right, finished steps collapse into full-width fact rows with Edit;
  step 5 = payment + lines + bill + Place Order; slim checkout header
  (`Header/CheckoutHeader.tsx`); no breadcrumb, "‹ Back to cart".
  Every field, rule and store call inside the steps is unchanged
  (`CheckoutFields.tsx` — `CheckoutGrid`, `QCard`; `CheckoutReview.tsx` deleted).
- **Quiet pages** (`_data/quietPages.ts`): checkout, cart, wishlist, track,
  login, /account/* carry no reviews rail, no store block, no footer.
- Homepage FAQ: one centred column ("Here to Help" side column gone).
- **Login**: "Continue with Google" (Google's own button; server verifies the
  ID token for our Client ID + verified email; **no phone asked** — checkout
  takes it on the first order). Copy promises "a login code", not WhatsApp.

Admin / API
- **Variant discount switch** (`Product.discountOnVariants`) and
  **per-product variant axis order** (`variantAxisOrder`, ↑↓ in the editor).
- **Reviews only from buyers after delivery** (`/shop/review-links`, invites
  per product on delivery, open review form closed).
- **Notification routing** (`common/notify-route.ts`): BD number → SMS,
  foreign → email (on the order / on file) → WhatsApp last; for every order
  message and the login code. A door not set up passes on; a door that fails
  is FAILED with the provider's reason. Order page → Activity log →
  "Messages to the customer" (channel, status, reason, Send again).
- **Message templates** (`MessageTemplate`; Admin → Marketing → Email & SMS
  → **Templates**): the SMS and email words for 7 kinds, create/edit/on-off/
  remove; 14 defaults seeded; placeholders `{name} {order} {total} {link}
  {product} {code} {minutes} {shop} {phone}`.
- **Email: API or SMTP** (`MessagingSetting.emailSmtp*`, nodemailer);
  provider "SMTP" in the Email panel and in Integrations.
- **Google Sign-In slot** in Integrations & keys (`GOOGLE_SIGNIN`, Client ID
  only). The owner's Client ID is saved and switched on (DEV).
- **Admin menu redesign** ("Deep Purple Panel", `AdminSidebar.tsx`): two
  dashboards on top (login lands on `/intelligence`), sections by who does
  the work, a module opens ONE list (two levels, never three), Manrope
  700/800 (`--font-nav`, sidebar only), deep purple with inner shadow.
  Not one href changed; `registry.def.ts` regenerated, drift check green.

Live checks done on DEV: SMS login code to `RADIAN_TEST_PHONE` went via
KHUDEBARTA with the admin template; 14 templates in `MessageTemplate`;
Google button drawn; all pages above walked.

---

## 3. How this session shipped (so the next does the same)

1. Edit in `D:\radian-test`. Typecheck in the sandbox
   (`/tmp/build/{api,web,admin}`: rsync the app, `npm ci`, `tsc --noEmit`;
   API needs a dummy Prisma engine — see the session transcript for the env
   vars) and run `node apps/api/scripts/no-bangla.selftest.mjs` (2 PASS).
   If `AdminSidebar.tsx` changed: `node apps/api/src/administration/registry.gen.mjs`
   then `registry.drift.mjs` must print 6 passed.
2. Commit on `inv-rev-4-opening-guard`, push.
3. Hostinger hPanel → VPS → Web console. Then:
   `cd /root/apps/radian && git fetch -q origin inv-rev-4-opening-guard && git -c user.name=vps -c user.email=vps@radian merge --no-ff -q origin/inv-rev-4-opening-guard -m '…' ; git log --oneline -1 && (nohup docker compose -f docker-compose.stack.yml --env-file .env.development up -d --build <api admin web> > /tmp/heroNN.log 2>&1 &)`
   Build only what changed (6–9 min). Migrations apply on API start.
   ⚠️ The console drops often ("Lost connection") and a typed command may
   not land — always confirm with `git log -1` / `docker ps` before believing
   a deploy happened.
4. Open the DEV address and look, then tell the owner.

---

## 4. Owner-side items (data, not code)

- Company → trade name capitalisation ("radian" → "Radian"); tag spellings
  ("birtdhay"); test product names/SEO; category meta descriptions; tag and
  budget images; delivery band heading "sdfgsdfg".
- **Email provider** not yet configured (SMS is): foreign customers get
  WhatsApp until it is.
- Google Cloud app is in **Testing** mode — publish it (Google Auth Platform →
  Audience → Publish app) before real customers use the button.
- Account pages behind the login still show **demo** profile/orders (main's
  "Login is real" commit says the same) — a customer-account backend is a
  separate piece of work.

---

## 5. Next (the owner's words, 8 Sep evening)

**"We will start from the checkout page design"** — in a new chat. The stepper
shell is done; what he wants changed next in its design is not yet said.
Ask, then show, then build.

### ✅ DONE, 8 Sep late evening — the checkout redesign

He said it in that new chat and it is built, on DEV and walked
(`296aca9`, `3974afa`, `8416078`; the design he approved first is
`design/checkout-v2.html`).

**Six steps now:** Details · Who's Receiving · Where · **Card Message** ·
When · Payment. The card step is drawn only for a gift; `completeStep` walks
to the next step that is DRAWN, never to `n + 1` (`shownSteps` in the store),
because with the card hidden `n + 1` lands on a step nobody renders.

- "Phone number", not "WhatsApp number" — BD is messaged by SMS now
- every grey helper line moved behind the small ⓘ (house rule 17); errors
  still print
- Card Message: occasion chips, ready-made lines, counter, signature, and the
  card drawn beside it. The signature travels INSIDE `giftMessage` (one text
  for the bench to copy)
- When: one bold line where a paragraph was; **seven** dates and a "Pick a
  date" tile with `min` = the first date this basket can be made by
- COD is not drawn at all when it cannot be taken
- the rail is the deep purple panel, with a progress bar

**Admin, same commit:** order → Photos & proof can add/replace a photograph
(the only place was Delivery → Proof photos), the "send these to the customer"
switch is real (`photoUpdates` on `EditOrderDto`, on the NOTES gate — the
recipient gate closes before the photos are even taken), and the card message
has its own panel with Copy. Also fixed: `adaptOrder` poured a photo's `url`
into `bg`, so **every uploaded proof photo had been showing as the lavender
placeholder**.

⚠️ **Not walked by me, for lack of a way to drive a file picker:** the actual
photo upload click-through, and the two-payment-cards case (every cart I had
held an advance-required product, which correctly closes COD). Worth one look.

Deferred, still: mobile optimisation (a menu on a phone — see
`RADIAN_PENDING.md` Phase 9) · the VPS build-freeze fix · quick-add on cards
for option-less products (asked, not decided) · whole-admin font (Manrope is
on the menu only).

---

## 6. THE ACCOUNT IS REAL — 8 Sep, late night

The owner asked what the customer profile actually was. It was a constant:
`DEMO_CUSTOMER` ("Nusrat Jahan", two Banani addresses) handed to whoever
logged in, six hand-written orders, and addresses / wishlist / dates in one
browser's localStorage. Only the login was real. His instruction: *"sob jen
real hoy, kon mock jen na hoy."*

Built and deployed to DEV (`5cd8124`, design approved first in
`design/account-v1.html`):

- **`CustomerSession`** — issued after the code or Google is verified, **30
  days** (his ruling), only the SHA-256 stored, `Authorization: Bearer`. NOT
  the admin's `x-radian-token`
- **`/shop/account/*`** — login · logout · me (read/write) · orders · order ·
  addresses CRUD · reminders · wishlist · credit · reviews · delete account
- **orders include guest orders**, matched on the verified phone (his ruling)
- **`WishlistItem`** is the only other new table; everything else is read
  from the module that owns it (Customer, Order, Recipient,
  RecipientOccasion, CustomerCredit, Review)
- eight screens rebuilt from the server; the customer's OWN address is kept
  apart from the delivery addresses, as he insisted
- deleting an account erases profile/addresses/wishlist/dates and every
  session, and leaves the ORDERS with the name taken off — the shop's books
- deleted for good: `DEMO_CUSTOMER`, `customerFromPhone`, `_data/orders.ts`,
  `useProfileStore`, `useAddressStore`, `useReminderStore`,
  `useWishlistGroupStore`, `DashboardView` and its helpers

⚠️ **NOT WALKED END TO END YET, and only for one reason:** signing in needs a
one-time code, and sending one is real outbound — which the owner has to
approve. Everything that can be checked without it was: the table exists, the
API is up, every account door answers **401** without a session and refuses a
made-up token. The first login on DEV proves the rest.

---

## 7. THE SHOP CHANGED FONTS — 9 Sep

**Spectral (display) + Public Sans (everything else)**, chosen by the owner
from twenty systems he asked to see together. Live on DEV.

- the switch is **two files**: `apps/web/app/layout.tsx` and
  `apps/web/app/globals.css`. Every screen reads `font-display` / `font-ui`,
  so nothing else needed touching
- **`apps/admin` was NOT changed** — still Fraunces + Jost + Manrope. That is
  a separate decision over 192 screens, and the owner has not made it
- the twenty candidates and the small-print strip that decided it live in
  **`design/font-options.html`** — keep it; it is the cheapest way to answer
  "can we just try a font"
- the reasoning, and the two defects that went out with the old pair
  (132 faked bolds, faked italics), are in `RADIAN_FRONTEND_AUDIT_9SEP.md` §E

⚠️ **The trap worth remembering: `next/font` preloads EVERY declared face.**
The first cut declared five weights in two styles and shipped **268 KB of
fonts on every page load, of which the homepage drew five faces**. Trimmed to
four upright weights, with the italic on its own non-preloaded load, it is
**99 KB**. Nothing warns you about this — measure it:

```js
performance.getEntriesByType("resource").filter(r => /woff2/.test(r.name))
```

---

## 8. THE CONFIRMATION WAITS FOR THE MONEY — 9 Sep

The owner: *"checkout page a amra jkhon place order a click kri sathe sathei
amder sms chole jay customer ar kache. ata thik kro."*

**Proved with his own data before it was touched:** `RAD-70104` — online,
**unpaid**, ৳64,055 — has an `OrderMessage` row `ORDER_CONFIRMATION · SMS ·
SENT · 08 Sep 14:12`. The shop told a customer in writing that it had an
order it had never been paid for.

**What decides the confirmation now is what is OWED**, not which button was
pressed:

| situation | what the customer is told, and when |
|---|---|
| cash on delivery | confirmed at checkout — that IS the end of the checkout |
| store credit covered the whole bill | confirmed at checkout, same reason |
| online, money owed | **nothing at checkout.** `settle()` confirms when the payment lands |
| online, paid by hand in the admin | `addPayment` confirms — never for COD, which was confirmed already and whose `addPayment` fires at the doorstep |
| cancelled / declined / abandoned | `PAYMENT_FAILED`, with the `/pay/{orderNo}` link |

**A failed payment no longer lands on `/checkout`.** It did, with
`?payment=cancel`, and the checkout page read that parameter nowhere — and
the cart had already been emptied when the order was written, so the customer
stood in front of a blank form with no word about their money. It goes to
**`/pay/{orderNo}?from=cancel`** now: "Your order isn't confirmed yet",
the amount owed, one button.

**The closed tab.** SSLCommerz calls back for a success, a failure and the
Cancel button — a closed tab produces nothing at all, so the commonest way to
abandon a payment was the one the shop never heard about. A sweep now queues
the recovery message for an attempt open longer than **`unpaidAfterMinutes`
(15, Admin → Recovery)**, and only for attempts started in the last 24 hours.

⚠️ **The sweep does NOT close the payment attempt, on purpose.** Marking it
FAILED would make `settle()` refuse a payment that lands a minute later —
gateways are slow, and turning away real money to be tidy is far worse than a
message that arrives early. `skipReason` drops the message anyway if the money
has arrived ("already paid").

### ⚠️ THREE SWITCHES ARE OFF ON DEV, AND TWO OF THEM GATE THIS WORK

Read from `MessagingSetting` on 9 Sep, after deploying:

| switch | state | what is dead while it is off |
|---|---|---|
| `smsEnabled` (Admin → Email & SMS) | **OFF** | every message. It was ON yesterday — that is how RAD-70104's SMS went |
| `recoveryEnabled` (Admin → Recovery) | **OFF** | the payment-failed message, both from a real Cancel and from the sweep |
| `sweeperEnabled` (Admin → Recovery) | **OFF** | the 15-minute catch for the closed tab. Its old reason — a timer waking a free Postgres — died with Neon |

They were left OFF deliberately: turning `recoveryEnabled` on starts real
outbound to real people, which is the owner's to approve, not a session's.

Also fixed on the way past: `needsPayment` said `true` even when store credit
had settled the whole bill, so the storefront asked for a gateway session, got
"this order is already paid", and showed a customer who owed nothing "we
couldn't open the payment page".

---

## 9. UPLOADED ICONS ARE PAINTED NOW — 9 Sep

The owner: *"amder system readymade icon gula sundor kre show krche but ami
icon bania upload dile sevabe sundor vabe show krche na … tmi je size blso se
size upload dewar poreo ai kahini."*

**Measured before touching anything:** his uploaded file and a built-in are
drawn at the SAME 24px, inside the same 46px lavender tile, both
`object-contain`. **The size was never the problem** — the file was. A
photograph carries its own background and its own colours; no dimension fixes
that.

Three real defects sat behind it:

1. **The admin promised tinting the shop never did.** "SVG takes the brand
   colour" had been on that screen for weeks; every upload was a plain
   `<img>`. Implemented now: a file that is a SHAPE is used as a CSS mask
   filled with `currentColor`, so an upload is indistinguishable from a drawn
   icon. Whether a file is a shape is decided **at upload, against the alpha
   channel** (`media.ts`) and carried in the file name as `.icon.` — masking a
   photograph would paint a solid purple square, which is exactly what the
   proof below shows.
2. **Two places bypassed `ShopIcon`** with their own `<img>`: the header
   category nav and the PDP trust row. Worse, the PDP row drew built-ins
   through **PdpIcons — a different set**, so a badge set to `flower`, `cake`,
   `wallet` or `globe` showed on the homepage and rendered NOTHING on the
   product page.
3. **The admin preview was not the shop's tile** (30px on white vs 24px in a
   lavender tile), so a bad upload looked fine until it was live. It is the
   shop's own tile now, and every uploaded icon gets a plain verdict — this
   one works, or this is a picture and here is why it will not.

**And the root cause of the uploads themselves:** the built-in set had twenty
symbols and none of them said midnight, same-day, refund, support,
nationwide, photo or freshness — so he drew pictures. **Sixteen added** (36
total), in both `ShopIcon.tsx` and `ShopIconPreview.tsx`, which must stay
identical.

### ⚠️ The media host had to start answering CORS

Chrome fetches a CSS `mask-image` in **CORS mode** — unlike a background image
or an `<img>`. With no `Access-Control-Allow-Origin` the masked element
rendered EMPTY while a plain `<img>` beside it drew the same file. One line
per media block in `Caddyfile`; safe, because everything under those roots is
already a public URL.

**Proved on DEV, not reasoned about:** a 56px span masked with an opaque
uploaded WebP painted a solid brand-purple block, beside the same file as an
`<img>`. Solid purple is the correct outcome for an opaque mask — and is
precisely why the alpha check refuses to tint photographs.

⚠️ Getting that line live needed `docker restart radian_caddy`, not a reload —
see **`RADIAN_ENVIRONMENTS.md` §4b**, the stale single-file bind mount.

### What is still the owner's to do

The four badges that look wrong today still carry photographs. They are not
tinted (correctly — they would become purple squares). Either pick a built-in
symbol, or upload the same shape as an SVG.

---

## 10. THE SHOP'S MESSAGES, ON THE OWNER'S RULES — 9 Sep

His list, given in his own words and confirmed point by point before a line
was written. **Same rules for everyone — there is no new-customer or
old-customer distinction any more.**

| Moment | What goes |
|---|---|
| **Place Order pressed** | **Nothing.** No code, no message |
| Customer reaches the confirmation page | "Order placed" — and for a prepaid order "payment received", because without the money he never reaches that page |
| Order **approved** | a message (**new**) |
| **Delivered** | a message — for COD this is also when the cash is taken |
| **Part payment** | what was cleared and **what is still owed** (**new**) |
| Payment failed / cancelled / walked away | a message, **30 minutes later** |
| Payment succeeded | **at once**, not delayed |

### What changed

- **THE VERIFICATION CODE IS GONE** from checkout, and the "Confirm your
  number" box with it. It cost an SMS on every first order — including the
  ones nobody paid for — and it asked a favour of someone who had just
  finished paying. The shop learns the number is real when its own messages
  arrive. `OtpPurpose.CHECKOUT` stays for **store credit** and **signing in**:
  those are the customer asking the shop for something, which is the right
  moment to ask.
- **`ORDER_APPROVED`** — new. `confirm()` changed the status, wrote a timeline
  entry, took the workshop's hours, and told the person waiting nothing.
- **`PAYMENT_RECEIVED`** — new. Money that lands without settling the bill
  said nothing at all. ⚠️ It is the **only kind that repeats**: `attempt`
  counts the payments, not the retries. The amounts are read at SEND time from
  the order, so a second instalment landing while the first message waits
  cannot send a stale figure, and the message is dropped if the bill is
  settled by then.
- **`PAYMENT_FAILED` waits.** Pressing Cancel used to fire it in the same
  second — a customer whose OTP was slow, or who wanted another card, is
  usually back within minutes and reads that as a shop that gave up on them.
  Both roads (Cancel, and the closed tab that produces no callback) now share
  **one** admin number, `unpaidAfterMinutes`, default **30**.

⚠️ **The two new kinds have no Meta template**, because they are new. SMS and
email carry the admin's own words and work today; the WhatsApp door is
**skipped** for them rather than failed, and begins working by itself the day
a template of that name is approved. Their wording is written in
**Admin → Email & SMS → Templates** like every other, with two new
placeholders: `{paid}` and `{due}`.

⚠️ **Until the owner writes those two templates, both messages are SKIPPED**
and the order's message log says so. That is the designed behaviour — nothing
is hard-coded — but it means the feature is not visible until he types the
words.

### Still his to switch on (unchanged from §8)

`smsEnabled`, `recoveryEnabled` and `sweeperEnabled` were all OFF when last
read. The first two gate everything above; the third gates the 30-minute wait,
which cannot fire without a timer.

### Next, agreed but not started: COLLECT FROM SHOP

The owner asked for a store-pickup delivery option. His rulings when asked:

- **no separate payment rule** — whatever the product demands (advance or full)
  still applies, and a COD product is simply paid in cash at the counter
- **no separate timing rule** — the customer picks a time exactly as with any
  other method and comes at that time

So it is a third `DeliveryMethodKind` beside `RIDER` and `COURIER`, with the
charge set to 0 in admin, the shop's own address and opening hours shown in
place of the address form, and no rider ever assigned. Everything it needs —
address, map link, photo, `ShopHour` — already exists.

---

## 11. COLLECT FROM SHOP — 9 Sep

**It is a switch on the checkout, not a delivery method.** It was built as a
method first — a `DeliveryMethodKind` the owner had to create, price per zone
and tick on every product — and he threw that out on sight:

> *"shop theke collect ato jamela kn kra lagbe. just easy kro. check out jkhon
>  shop collect dibe tkhonei tar delievry charge lagbe na. ar baki sob akdom
>  same vabei kaj krbe. so admin alada kre zone create kra and kon kon product
>  shop collect kaj krbe ata thik kra agula to duniar pecher ktha bolle."*

⚠️ **Worth keeping, because it is the mistake and not the fix.** I modelled it
as a method because that is where it FITS in the schema — beside RIDER and
COURIER, keyed off `deliveryMethodId` like everything else. Tidy in the data,
and it cost him a method to create, a price to set and a tick on every product
before a single customer could collect anything. **A design that is neat in the
data and heavy on the person using it is not a good design.**

### What it does now — the whole of it

| | |
|---|---|
| Where | one switch in the **Where?** step. **Nothing to set up** |
| On | the delivery charge is **0**, and **no address is asked for** — the shop's own card is shown instead: address, opening hours, map link, phone, all from Shop settings |
| Everything else | **untouched.** Same methods, same dates, same slots, same payment rules |
| The order | `fulfillmentType: PICKUP`, which keeps it off the delivery board; the SHOP's address on the row rather than a blank |

### Two bugs the walk caught that reading could not

1. **The label changed and the charge did not** — the summary read
   *"Collection · 3 Hours Delivery — ৳350"*. `c.collect` was read inside the
   totals memo and missing from its dependency list, so it was right once and
   stale for ever after. The quote sent to the server had the same hole, which
   would have let a FREE_DELIVERY offer waive a charge that was not there.
2. **"৳0 FREE"** — a struck-out price only means something when there was one.

⚠️ `DeliveryMethodKind.PICKUP` **stays in the enum, unused and marked so.**
Dropping a value from a Postgres enum means rebuilding the type: real risk for
no gain. Nothing reads it.

### Verified on DEV, by walking it

Collecting: **Collection · 3 Hours Delivery — FREE**, total ৳2,000. Delivering
the same cart: **Delivery · 3 Hours Delivery — ৳350**, total ৳2,350. The Where
step swaps the address form for the shop card with its hours, map link and
phone.

⚠️ **Not walked:** placing a real collected order end to end, so the server
side (`fulfillmentType: PICKUP`, the shop's address on the row, absence from
the delivery board) is confirmed by code and not yet by a row in the database.

