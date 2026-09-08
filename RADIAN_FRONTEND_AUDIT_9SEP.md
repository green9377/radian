# Radian storefront — full audit, 9 September 2026

> Asked for by the owner: *"abr amder pura frontend analysis kre khuje ber kre
> dekho kon mock ache kina and kothay kothay somossa ache … improve ar jayga
> ache kothay ar frontend a ache bt admin control a nei."*
>
> Everything below was found by reading the code **and** walking
> development.radianbd.com. Nothing here is a guess; where I could not prove
> something I say so.

---

## A · What is still made up in the browser

The account was the last big one and it is gone (8 Sep). What is left:

| # | Where | What | How bad |
|---|---|---|---|
| A1 | `/contact` | **Placeholder phone, WhatsApp and email — live on the site.** "+880 1X XXX XXXXX" and `hello@radian.com.bd`. A customer who opens Contact cannot reach the shop | **Serious** — the header shows the real number two centimetres above it |
| A2 | `/contact` | Address "House 12, Road 5, Dhanmondi, Dhaka 1205" — invented. The shop's own Visit Us block (admin data) says **Gulshan 1** | **Serious** — two different addresses on one site |
| A3 | `/about` | The whole page is a hand-written draft (`_data/about.ts`) with a yellow "Draft" banner in front of customers, and its first statistic reads **"2 hr — Express delivery in Dhaka"**. The shop's express is **3 hours** (`deliveryClaims.ts`, the owner's own ruling) | **Serious** — a speed claim the shop cannot keep, the exact fault fixed on the hero in August |
| A4 | Cart summary | The trust row is typed: **"4.9 on Google"**. The real rating is 4.2 and the checkout was fixed to read it live (`getGoogleRating`); the cart was missed | **Serious** — an invented number beside a Place Order button |
| A5 | Cart summary + footer | The payment strip lists **COD** as a badge even when the basket cannot take COD (gift, advance item) | Small |
| A6 | `_data/products.ts` | The mock catalogue (`PRODUCTS`) is still imported by `collections.ts` and `search.ts` as a fallback | Medium — a page can quietly show products that do not exist |
| A7 | `_data/promo.ts` | `COUPONS` and `FREE_DELIVERY_PROMO` — dead code, nothing imports them any more | Tidy-up |
| A8 | `_data/reminders.ts` | `SEED_REMINDERS` — dead since the account went real | Tidy-up |
| A9 | `_data/journal.ts` | Three sample articles + `JOURNAL_DRAFT`. The index and the article page are live from the admin now, so these are only a fallback | Tidy-up |
| A10 | `_data/policies.ts`, `_data/faq.ts` | Hand-written drafts, used only when the admin has nothing. FAQ is filled; the four policy pages should be checked | Medium |
| A11 | `_data/search.ts` | The synonym map (`CAT_TERMS`, `OCC_TERMS`) — "rose → flower, romance…" is written in the app, so nobody can teach the search a new word without a release | Medium |

**21 files still carry a `SWAP HERE` note** — the marker this project uses for
"this becomes an API call later". Most are harmless now; the list is the honest
map of what is not yet wired.

---

## B · Things that are simply wrong on screen

| # | Where | What I saw |
|---|---|---|
| B1 | Homepage hero vs the strip under it | Hero: **"3 Hours Delivery"**. Strip below: **"2-Hour Delivery"**. Both are the admin's own data, and they contradict each other |
| B2 | Homepage strip | Two badges read **"New promise"** — placeholder rows never filled in |
| B3 | Announcement bar | **"New announcement +++665655"** — test text, on every page |
| B4 | Homepage section | Heading **"every person descrip"**, sub-line **"1000"** |
| B5 | Product cards | Names like *"Order testing 000000"*, *"Discount > System 15% OFF"*, descriptions like *"asdfgasdfsdaf…"* — test products in the live catalogue |
| B6 | Product cards | The description line under the name is raw text with no length limit, so junk fills the card. It should clamp to one line |
| B7 | Delivery chips | *"same day Delivery"*, *"3 Hours Delivery"*, *"Midnight Delivery"* — the shop's own labels, capitalised three different ways |
| B8 | Journal | The first post has no cover picture (flat pink), and the titles are test text (*"bf"*, *"5545"*, *"545454"*) |
| B9 | Visit Us block | *"Gulshan 1 Dhaka 1230"* then *"Dhaka 1205"* — two lines of address that disagree |

**B1–B9 are all DATA, not code** — they are fixed in the admin, not in a
release. That is the good news; the bad news is that a visitor cannot tell the
difference.

---

## C · In the frontend, but nobody can change it from the admin

This is the list the owner asked for by name.

| # | What the customer sees | Where it comes from | What it needs |
|---|---|---|---|
| C1 | The whole **About** page — story, four statistics, three pillars, the steps | `_data/about.ts` | It is a page like any other: it should be **Content → Pages**, the same editor the policies use |
| C2 | **Contact** — the three channels, opening hours, the reasons list | `_data/contact.ts` | Phone / WhatsApp / email / address / hours belong to **Shop setup**, once, and every screen should read them (the header already does) |
| C3 | The four **policy** pages, when the admin has none | `_data/policies.ts` | Write them once in Content → Pages and the fallback stops being reachable |
| C4 | **Search synonyms** — what "rose", "cake", "romantic" match | `_data/search.ts` | A small "search words" screen, or tags doing the job |
| C5 | **Collections** — which collection pages exist, their chips and order | `_data/collections.ts` (DB wins when a row exists) | Finish the DB side so the file can go |
| C6 | The **journal** fallback articles | `_data/journal.ts` | Delete once the real posts are written |
| C7 | **Gift Finder** questions | Admin (SYSTEM tag groups) ✅ | Nothing — this one is done, and is the model for the rest |
| C8 | Footer payment badges (bKash · Nagad · VISA · Mastercard · COD) | Hard-coded list | Should follow **Setup → Payment methods**, like the checkout does |
| C9 | Trust badges on cart / PDP | Partly admin, partly typed | One source: the admin's trust badges (A4 is the visible symptom) |

---

## D · Where the frontend can be better

**Speed and pictures**

- 31 raw `<img>` tags, only one with `loading="lazy"`. `TileImage` already does
  this properly (real `<img>`, media variants, one placeholder) — the account
  screens I built yesterday and a few older cards do not use it yet.
- Two `next/image` uses left over; the project has settled on `TileImage`, so
  they are inconsistent rather than wrong.

**The customer's own account** (built 8 Sep, worth a second pass)

- The wishlist heart works signed out and syncs on login; the same trick is not
  yet applied to the Address Book (a guest cannot save an address).
- The order list has no "reorder" that fills the cart — the button opens the
  product page instead.

**Trust and conversion**

- No delivery-date promise on the product card (only in checkout). FlowerAura
  says "Delivered today, 9 AM – 1 PM" on the card itself, and it is their
  strongest line.
- No "recently viewed" and no "people also sent" — both are pure data we
  already hold (`salesCount`, order lines).
- Reviews exist per product but the shop-wide rating only appears in two
  places; the PDP and the category page could carry it.

**Mobile** — still the deferred Phase 9 item. The account, the checkout rail
and the new panels were built desktop-first and only lightly checked on a
phone.

**Accessibility** — headings are consistent and forms have labels, but several
icon-only buttons (heart, remove, edit) have no `aria-label`.

---

## E · The typography — SETTLED 9 Sep 2026

> ### ✅ The owner chose **Spectral + Public Sans** (option 8 of twenty)
>
> Live on the shop since 9 Sep. Set in **`apps/web/app/layout.tsx`** and
> **`apps/web/app/globals.css`** — those two files are the whole switch;
> every screen reads `font-display` / `font-ui` and follows.
>
> **Spectral** — a serif drawn by Production Type for screens rather than for
> paper: even colour, restrained contrast, real italics. It replaces Fraunces,
> whose playful wobble read craft-fair against the purple.
>
> **Public Sans** — the grotesque of the US Web Design System, tall x-height,
> sturdy digits. It replaces Jost for the reason below: nine tenths of this
> shop is 12–14px, and Jost was faint at that size.
>
> **Two defects went out with them**, both invisible until the fonts were
> counted:
> · `font-bold` is used **132 times** and neither old face carried a 700 — so
>   every bold button on the shop was a browser-smeared 600, against the
>   owner's own rule (22 Aug: buttons are bold and clear). Both new faces
>   carry a real 700.
> · `italic` is used on review quotes and card messages with no italic loaded,
>   so those were slanted uprights. Spectral's italic is a real cut.
>
> The twenty candidates, and the small-print strip that decided it, stay in
> **`design/font-options.html`** — worth keeping, because the next person who
> wants to "just try a font" can see all twenty in one screen.
>
> ⚠️ **The admin was NOT changed.** `apps/admin` still runs Fraunces + Jost +
> Manrope. That is a separate decision and a separate 192-screen surface.

The reasoning that led here, kept because it is the test to re-run if anyone
ever proposes changing this again:

Before: **Fraunces** for headings, **Jost** for everything else.

Why it did not feel premium:

1. **Jost is the problem, not the serif.** It is a geometric sans in the Futura
   family: wide, low x-height, thin at 12–13px. Most of this shop is 12–14px
   text, so labels, prices and helper lines all read faint and slightly toy-like.
   Its digits are the weakest part — and this is a shop where numbers (৳6,849,
   01940974467, 3:00 PM – 10:00 PM) carry the meaning.
2. **Fraunces is a "wonky" serif** — its default axes give it a soft, playful
   wobble. Charming for a bakery; against a deep-purple luxury palette it reads
   craft-fair rather than gift-house.
3. **The pair does not agree.** A quirky serif plus a geometric sans is a
   1930s-poster combination; nothing in it says "expensive gift, safe hands".

Three replacements were drawn first, then twenty when the owner asked to see
more (`design/font-options.html`) — the same hero, product card, price, form
and button in each, so the choice was made by eye and not by name. My own
recommendation had been Playfair Display + Manrope; the owner picked **8 ·
Spectral + Public Sans**, which is the quieter of the two and holds small text
better. The strip at the bottom of that file — twenty-one small-print lines,
no headings, no colour — is what settled it, and is the right way to judge any
future proposal.

---

## F · What I would do, in order

1. **Today, in the admin (data, no release):** the announcement bar, the two
   "New promise" badges, the hero vs strip contradiction, the test products,
   the journal titles and covers, the Visit Us address (B1–B9).
2. **One release:** the contact details and the About page — the two places a
   customer is currently told something untrue (A1, A2, A3), plus the cart's
   4.9 (A4).
3. **The font**, once the owner picks one — it touches one file.
4. **Then:** About and Contact into Content → Pages / Shop setup (C1, C2), so
   they never go stale again; delete the dead mock files (A7–A9).
