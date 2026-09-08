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
