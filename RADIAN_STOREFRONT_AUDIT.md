# Radian storefront — page-by-page audit against the admin panel

Started **30 Jul 2026**, at the owner's instruction. The method is his:
walk the storefront one page at a time, list everything on it, and check whether
the shop can actually control it. Nothing gets connected until the whole
storefront has been through this.

**Why this file exists.** `apps/web` has never made a single API call — every
page runs on `app/_data/*.ts`. Connecting page by page and *discovering* missing
data mid-way means stopping to add a column, then re-connecting. Cheaper to
find all the holes first.

## Rules for this audit — agreed 30 Jul

1. **Compare against `schema.prisma` and the API, not the admin screens.**
   A field can exist in the database and simply have no screen. Auditing
   against screens reports it as missing, which leads to building it twice —
   breaking One Data One Owner.
2. **Every gap gets one of three answers, not one.** `HAVE` / `BUILD` /
   `DROP`. Without `DROP`, mock-data inventions become admin fields nobody
   ever fills.
3. **A gap is a database gap first.** Record table + field + owning module.
   The admin screen is the last and smallest step.
4. **Display pages only.** Cart, checkout, account and tracking are excluded —
   what is missing there is *business rules*, not fields, and Ecommerce is not
   locked in the architecture project. They get a separate list of questions.

The owner's division of labour, stated 30 Jul: he decides what a page should
do, in visual terms. Schema, API and sequencing are not his to read.

---

## Page 1 — Homepage · audited 30 Jul 2026

Thirteen sections, in render order (`apps/web/app/page.tsx`).

| # | Section | Status | Detail |
|---|---|---|---|
| 1 | Hero slider | 🔨 BUILD | No banner table of any kind. 2 zone-aware banners hard-coded in `HeroSection.tsx` |
| 2 | Trust strip | 🔨 BUILD | **Corrected 30 Jul** — first marked "leave". Wrong: "2-hour delivery" and "freshness promise" are the shop's biggest claims, and per zone. Owner must own them. Per item: icon + title + subtitle, zone-specific |
| 3 | Shop by category (8) | ✅ HAVE | `Category` — `name` `summary` `imageUrl` `isFeatured` `showOnNavbar` `sortOrder`. The "120+ arrangements" line is a count, computed |
| 4 | Occasion / relation tabs | ✅ HAVE | `TagGroup` + `Tag` — `imageUrl`, `displayStyle` (CHIP/CARD), `sortOrder`. ⚠️ no `mothers-day` tag; frontend already routes it to `/occasions` to dodge a 404 |
| 5 | Best sellers (8) | ✅ HAVE | `Product.isBestSeller` `isPublished` `zone` `salesCount` |
| 6 | Promo strip | 🔨 BUILD | Same missing table as #1. One build, two placements |
| 7 | Delivery band | ✅ HAVE | `DeliveryMethod` — `label` `cutoffTime` `etaLabel` `feePaisa` `zone`; `Product.supportsExpress/SameDay/Midnight`. The countdown has a real `cutoffTime` behind it |
| 8 | Gifts by budget (4) | 🔨 BUILD | No collection concept exists. `/collections/[slug]` is a live route with nothing behind it |
| 9 | Gift finder wizard | ✅ HAVE | Needs no table of its own — it filters on #4 and #8. Blocked only by #8 |
| 10 | Customer reviews (4) | 🔨 BUILD | No review table. Current quotes are invented |
| 11 | Latest articles (3) | 🔨 BUILD (half) | `JournalPost` exists and `content.service.ts` is written. **No module, no controller, no screen** — carry-over from `RADIAN_FINAL_REVISION_TODO.md` §4 |
| 12 | Visit store | ✅ mostly | `CompanySetting.operatingAddress` `publicPhone` exist. **Opening hours do not** |
| 13 | Footer | ◻ leave | Links and icons |

### Decisions taken by the owner, 30 Jul

**#1 + #6 — banners: build the screen.** He manages them himself: image, copy,
CTA, and a live-from/live-to date. Eid, Valentine's and Mother's Day each move
the hero; routing that through a developer every season guarantees a stale
homepage.

**#8 — budget groups: automatic, by price.** A product priced under ৳1,000
belongs to *Under ৳1,000* without anyone tagging it. Hand-picking would mean
every new product silently missing from the group it obviously belongs in.
Note this makes budget collections a **price rule**, not a stored membership
list — so `premium` and `valentines`, which are *not* price ranges, still need
a hand-picked shape. Both kinds must live behind one `/collections/[slug]`
route.

**#10 — reviews: three sources.** Google Business, customer-submitted from the
storefront, and admin-entered by hand. Deliberately redundant — Google can go
quiet and the shop still has words on its homepage.

- **Moderation is on by default** (my call, flagged to the owner): a
  customer-submitted review is stored unpublished and appears only after he
  approves it. Publishing straight to the homepage hands the shop's most
  valuable surface to anyone with a browser.
- **The storefront submit form is out of scope for this pass.** It is a *write*
  from `apps/web`, and every storefront write waits on the Ecommerce lock.
  Google + admin-entered now; the form with the money pages.
- ⚠️ **Do not average a Google star rating together with own-site reviews.**
  Two different populations, one of which the shop selects. Show them as
  separate voices or show no aggregate.

**#11, #12 — mine to decide, no input needed.** The journal admin screen (the
data is already there) and an opening-hours field on `CompanySetting`.

### Page 1b — Header · audited 30 Jul 2026

Missed on the first pass; the owner caught it. Six parts.

| | Part | Status before | Owner's decision |
|---|---|---|---|
| 1 | Logo | hard-coded | make admin-managed |
| 2 | "Deliver to" zone picker | hard-coded 2 zones | see zone decision below |
| 3 | Announcement bar (zone-aware copy) | hard-coded, 2 variants | make admin-managed — build with banners |
| 4 | Category nav (8 labels) | hard-coded in `CategoryNav.tsx` | **already possible** — `Category.showOnNavbar` + `sortOrder` exist and are ignored. Connect, don't build |
| 5 | Account · Track · Wishlist · Cart | ✅ working | labels admin-managed |
| 6 | More panel (14 links, 3 groups) | hard-coded | make admin-managed |

⚠️ #4 is the live bug on this page: a new category **will not appear in the
menu**, because the storefront never reads the switch the admin already has.

**Owner's decision, 30 Jul: everything in the header is admin-managed.** Not
negotiable and not per-item — his reasoning: "Chittagong could be next, or
zones grow some other way; I am not touching code every time."

---

## Zone — locked shape, 30 Jul 2026

Raised while auditing the header; it is not a header problem. Today zone is
`enum ProductZone { DHAKA NATIONWIDE }` + `enum DeliveryZone { DHAKA BANGLADESH
COUNTER }` — 6 references in `schema.prisma`, 10 files in `apps/api/src`.

**The owner's instinct, and it is right: do this before launch, not after.**
Two zones and few products now; five zones and 500 products later.

### The split — the whole point

A dropdown of zone names with hard-coded logic behind it would *look* dynamic
and break silently the day a zone is added. That is worse than honest
hard-coding, because the breakage hides. So ownership is split:

**Zone owns (set once, per zone):** name · active · which delivery methods
exist there · fees · cutoff times · courier · slots.

**Product owns exactly one thing per zone:** "can this item survive the trip?"
— a tick, nothing else.

Rationale: when the courier raises the Chittagong rate, that is **one edit on
the zone**, not 500 product edits. Putting fees on the product page duplicates
a zone fact across every product — a One Data One Owner violation with a
500-row blast radius.

### Three safeguards — without these the design is a trap

1. **A newly added zone defaults every product to OFF.** If new zones defaulted
   to available, the day Chittagong is added a fresh cream cake silently claims
   it can travel there. The two error directions are not symmetric: an unticked
   product loses a sale; a wrongly-ticked one is a ruined cake, a refund and a
   lost customer. Choose the recoverable failure.

2. **Bulk ticking must exist, or safeguard 1 is fiction.** 500 products one at
   a time is work nobody does, including the owner. **But the owner rejected
   category-wide selection as the primary path, and he is right** — "Flowers"
   holds both a courier-safe dried bouquet and a fresh rose. So: **search and
   pick is the main path**, select-all-shown and by-category are buttons that
   exist and are never automatic. Stated as a rule: *a tick is always a human
   act.*

3. **Existing DHAKA / NATIONWIDE values migrate automatically.** This is the
   step most often forgotten in a change of this shape, and forgetting it means
   re-entering thousands of facts by hand.

⚠️ Zone touches Product, Delivery, POS and Pricing. Per the sync rule this is
recorded, **not implemented** — it needs a decision in the architecture project
first. Owner intent above is complete enough to lock against.

---

## Banner — locked shape, 30 Jul 2026

Covers the hero slider (#1), the promo strip (#6) and the announcement bar
(header #3). One builder, three placements.

**Fields per slide** (the current `HeroBanner` interface, made editable):
eyebrow · headline plain part · headline accent part (two fields — the design
colours only the second) · lead paragraph · CTA 1 label + href · CTA 2 label +
href · 3 proof chips · 2 floating cards (icon + title + sub each) · image ·
zone · sort order · live-from · live-to · active.

**Slider-level:** rotate interval (currently 6s, hard-coded), unlimited slides,
drag to reorder.

**Template is fixed, content is not** — agreed with the owner. He gets every
word, image, colour, link, date and ordering; he does not get to move elements
around the canvas. Reasoning he accepted: a free-form canvas breaks the
approved design in front of customers, and the failure is public. This is the
one place he agreed to a boundary after asking for "everything dynamic".

**There is no image today.** The hero "photo" is a CSS gradient plus a drawn
SVG shape (`visual: { gradient, art }`). The owner assumed an upload existed.
Real photography was always a launch dependency (noted in the component
comments).

### Image rules — raised by the owner, unprompted, and correct

| | Rule |
|---|---|
| Dimensions | shown on the upload box (e.g. 1200 × 900); wrong ratio crops or stretches |
| Max file size | enforced, not advisory |
| Oversize | auto-downscaled server-side — the owner should not have to think about it |

Why this is stricter than it looks: the hero is the **first** thing that
loads. A 4 MB hero image means a white screen, and nobody waits.

### Icon rules

The owner asked for **both** a built-in picker and custom upload. Granted — my
objection (uploaded icons arrive at random sizes and colours and wreck the row)
is answered by enforcing the spec rather than by refusing uploads.

| | Rule |
|---|---|
| Format | SVG preferred, PNG allowed |
| Dimensions | 96 × 96, square |
| Max file size | 50 KB |
| Background | must be transparent — a white background shows as a white box |

⚠️ **SVG vs PNG is not cosmetic.** The existing icons use `stroke-current`, so
they inherit the brand purple. A single-colour SVG can be tinted the same way
and will match the row. A PNG keeps whatever colour it was uploaded with. Tell
designers SVG.

Built-in set: ~40–50 icons, one size, one colour — bolt, heart, lock, truck,
gift, store, etc.

---

## Section headings — global rule, 30 Jul 2026

Raised by the owner with five annotated screenshots. Every section on the
storefront carries the same three-part head:

- **eyebrow** — small letter-spaced caps ("CURATED FOR EVERY MOMENT")
- **title** — "Shop by Category"
- **subtitle** — one line, optional ("Find the perfect gift by the moment")

**All three must be owner-editable, on every section, on every page.**

### Build it once, not thirteen times

The wrong reading of this request is "add three fields to each section". That
is 13 builds on the homepage alone and a fresh one every time a section is
added, and it guarantees some section gets forgotten.

Instead: **one shared section-heading store, keyed by page + section**, with an
admin screen that lists every heading on the storefront in one place. A new
section registers its key and appears in that list automatically — the same
pattern `RegistryService` already uses for access nodes (172 nodes, "0 new, 0
changed" on boot).

**Zone override, optional.** One text serves all zones by default; the owner can
override per zone where the claim differs (Dhaka "2 hours" vs nationwide "64
districts"). Default-shared matters — forcing a text per zone means editing the
same sentence 3 times and them drifting apart.

### Already dynamic — no work beyond connecting

The tab labels in those screenshots are not hard-coded strings needing a new
home: "By Occasion / By Relation" are `TagGroup.name`, and "All Products /
Flowers / Cakes" are `Category.name`. Both are already admin-editable and
already ignored by the storefront. Connect, don't build.

---

### Gaps carried forward from page 1

| | What | Where it lands |
|---|---|---|
| a | Banner — table + admin screen, date-scheduled | new; owner to be assigned when Ecommerce/Content is locked |
| b | Collection — price-rule *and* hand-picked, one route | new; same |
| c | Review — 3 sources, moderated, no mixed aggregate | new; same |
| d | Journal/FAQ/Content — module + controller + screen | `ContentPage` `JournalPost` `FaqEntry` already exist |
| e | Opening hours | `CompanySetting` |

⚠️ **a, b and c belong to Ecommerce/Content, which `build_status.md` lists as
NOT locked.** Per the sync rule they are recorded here, not designed here.
Owner intent is captured above so the architecture pass has something to lock
against — but no schema goes in until it does.

---

## Homepage — the work, in dependency order

Closed 30 Jul 2026. Twenty items.

### Phase 0 — a real image store · 1 item

`Tag.imageUrl` says it plainly: *"uploaded image (data URL interim; media/CDN
later)"*. There is no media store. Six of the items below upload images —
banner, icons, collection cards, review photos, payment badges, logo.

**Do this before Phase 2, not before Phase 1.** Phase 1 rides on the interim
path that already works; Phase 2 would have to be built twice.

### Phase 1 — connect only · 7 items · no new tables, no new decisions

| | Section | Reads |
|---|---|---|
| 1 | Category cards (8) | `Category` name · summary · imageUrl · isFeatured · sortOrder |
| 2 | Header category menu | `Category.showOnNavbar` + `sortOrder` — **live bug: a new category never reaches the menu** |
| 3 | Occasion / relation cards | `TagGroup` + `Tag` imageUrl · displayStyle · sortOrder |
| 4 | Best sellers + 6 tabs | `Product.isBestSeller` · `isPublished` · `zone`; tab names from `Category` |
| 5 | Delivery band + countdown | `DeliveryMethod.cutoffTime` · `etaLabel` · `feePaisa`; `Product.supportsExpress/SameDay/Midnight` |
| 6 | Gift finder | filters over 3 and the Phase 2 collections |
| 7 | Shop address + phone | `CompanySetting.operatingAddress` · `publicPhone` |

**Start here.** Highest visible change per hour of work, and it settles the
data-shape questions before anything new gets designed on top.

### Phase 2 — build · 11 items

| | Item | Note |
|---|---|---|
| 8 | Banner system | hero + promo strip + announcement bar — one builder, three placements |
| 9 | Section heading store | eyebrow/title/subtitle for every section, every page; optional zone override |
| 10 | Section on/off · reorder · add new | 8 block types; header/footer/H1 fixed |
| 11 | Trust strip | icon + title + sub, per zone |
| 12 | Icon set + custom upload | ~40–50 built-in; SVG 96×96 ≤50 KB transparent |
| 13 | Collections | price-rule (budget) **and** hand-picked (premium, seasonal); card image with gradient fallback |
| 14 | Shop hours | per-weekday open/close + dated closures (Eid) — **drives the live "Open now" pill** |
| 15 | Link lists | footer columns + More panel, one system, editable group titles |
| 16 | Social links | platform + URL, add/remove |
| 17 | Payment badges | image upload, ordered, on/off |
| 18 | Logo · map link · WhatsApp number · journal admin screen | journal data already exists |

### Phase 3 — reviews · 3 directions

Google pull (needs a verified Business Profile + API approval; **review count
per pull is capped — confirm the real limit at build time, do not guess**) ·
admin-entered with approve/delete · customer-submitted **deferred to checkout**
(it is a storefront write).

Stored with a `verified purchase` vs `added by shop` distinction. See the
banner/review section above for the fabricated-testimonial warning given to the
owner on 30 Jul.

### Phase 4 — zone

Separate sitting. Touches Product, Delivery, POS, Pricing. Locked shape
recorded above; implementation waits on the architecture project.

---

## Open questions for the owner

- Call number and WhatsApp number — same, or two fields?
- Four budget-card images, shot with the lower third clear for text.
- Dark-background versions of the bKash / Nagad / Rocket / VISA / Mastercard
  logos.

---

## First connection — done 30 Jul 2026

The owner's instruction was to build all the missing admin screens first and
connect afterwards. Agreed, with one exception he accepted: connect **one**
section first, because `apps/web` had never called the API and nobody knew
whether that path worked at all. Eleven admin screens built on an unproven
path would all have had to be reopened.

That half-day found the thing it was meant to find.

### What it found: the storefront could not read anything

`AuthModule` registers `AuthGuard` as `APP_GUARD` — every route in the API is
closed unless marked `@Public()`. The storefront has no login and never will
for browsing. So the answer to "does the path work" was **no**, and it had
nothing to do with the section being connected.

The obvious fix was wrong twice over:

1. `@Controller('categories')` carries POST / PATCH / DELETE on the same class.
   Opening it to read opens it to write.
2. Admin list endpoints return whole rows. Harmless on Category — but the
   moment Products follow that path it publishes `costPaisa`, the shop's own
   cost, to anyone's network tab.

### What was built

**`apps/api/src/shop/shop.ts`** — a separate, read-only, `@Public()` surface.
Every field is named in a `select`; nothing is spread, nothing inherited. If a
field is not written there it cannot reach a shopper. Rules for adding to it are
in the file header. Registered in `app.module.ts`.

**`apps/web/app/_data/shop.ts`** — the first API client in `apps/web`. Returns
`null` on failure instead of throwing, and every caller keeps its old
hard-coded list as the fallback it renders. A stale rail sells flowers; an error
boundary does not.

**`CategorySection.tsx`** — the 8 cards now read name, summary, image and sort
order from the admin. Card art falls back to an indexed gradient, never grey,
because real photography is still a launch dependency.

**`CategoryNav.tsx`** — the header menu bug is fixed. `showOnNavbar` decides
membership, `sortOrder` decides order. Both had been editable in the admin the
whole time; the storefront simply never asked.

### Two judgement calls worth flagging

**Counts come from a `groupBy`, not `_count`.** Prisma allows one filter per
relation in `_count` and two tallies of the same relation were needed. The
groupBy also rolls a child category's products up to its parent — `categoryId`
is a single FK, so a product filed under "Roses" would otherwise leave "Fresh
Flowers" showing zero while its own page was full.

**`dhakaOnly` is now derived, not listed.** The nav used to carry a hand-kept
slug list (Cakes, Balloons — fresh cream and inflated balloons do not survive a
courier). It now hides a category in the nationwide zone when
`nationwideCount === 0`. Same intent, no list to remember.

⚠️ **This fails toward hiding.** Products without a zone mean a short nationwide
menu. Deliberate, and consistent with the zone rollout safeguard — but if that
menu looks thin, the products need zones; it is not a fault in the nav.

### Still open on this connection

`apps/web/app/page.tsx` is `"use client"` (the zone store), so the whole
homepage renders in the browser and these two fetches run client-side.
Acceptable for a test connection, **not** acceptable at launch — slow phones and
Google both suffer. Server rendering the storefront is a real piece of work and
a pre-existing constraint, not something to change quietly inside this task.
Flagged, not fixed.

---

## Phase 0 — image storage · done 30 Jul 2026

Triggered when the owner tried to upload a category image and nothing happened.
Nothing was broken: `CategoryEditor.tsx` called `URL.createObjectURL()` and
`sendUrl()` stripped the `blob:` value before saving. The screen said so in its
own banner. It had never been built.

### Provider: ImageKit — chosen on cost *shape*, not features

Four were compared against this shop's actual profile (paid ads, so traffic
arrives in jumps), at roughly 100k page views/month:

| | Cost at that scale | How it charges |
|---|---|---|
| ImageKit | ~$14 | per GB delivered; $9 tier then $0.5/GB |
| Bunny.net | ~$11 | **flat $9.5** for optimisation + pennies of bandwidth |
| Cloudflare Images | ~$15–20 | per image delivered |
| Cloudinary | **$99** | free tier ends at a hard $99 step |

**Cloudinary was rejected for the step, not the price** — nothing exists
between free and $99, which is the worst possible shape for traffic that moves
in jumps. ImgBB was also raised and rejected: it does no resizing (the exact
problem being solved) and is a consumer sharing host with no guarantee behind a
shop's entire product catalogue.

**Bunny is the cheapest at scale and the likely destination** — its
optimisation fee does not grow with traffic at all. It has no free tier, so
paying for it before there is any traffic makes no sense. Start on ImageKit
free, move when the bill justifies it.

**The provider name appears in exactly one function** — `MediaService.putObject()`
in `apps/api/src/media/media.ts` — plus one env block. That is the whole point.
⚠️ Honest scope note given to the owner: swapping code is an hour; **re-uploading
existing images is not**, and that grows with the catalogue.

### What was built

`apps/api/src/media/media.ts` — `POST /media/upload`, admin-only.

- **No `@Public()`, deliberately.** An open upload route is a free file host for
  the internet, billed to the shop.
- Folder is an **allowlist**, not free text — it arrives from the browser.
- JPG / PNG / WebP / AVIF only, 10 MB, enforced server-side.
- **SVG is excluded even though the owner asked to upload custom icons.** SVG
  can carry script and these are served from a domain we control. Icons take
  the raster path or the built-in set. This one needs revisiting when the icon
  picker is built.
- `useUniqueFileName` — two products called `rose.jpg` must not overwrite each
  other.
- The provider's error message is passed through. "Invalid key" and "quota
  exceeded" need different actions from the owner; a generic 500 tells him
  neither.

`apps/admin/.../api.ts` — `uploadImage()`, deliberately **not** routed through
`call()`: that helper forces `content-type: application/json`, and a multipart
body must carry the browser's own boundary marker or the server receives one
unparseable blob.

`CategoryEditor.tsx` — instant local preview, then swap to the stored URL; on
failure the preview is **rolled back**. A blob preview left in a box that failed
to save is precisely the illusion this change removes. "Uploading…" is shown
because on a Bangladeshi mobile connection an empty box for several seconds
reads as failure and gets clicked again.

### Environment

`IMAGEKIT_PRIVATE_KEY` carries **no** `NEXT_PUBLIC_` prefix, and must never get
one — that prefix compiles a value into the browser bundle. The key was entered
by the owner directly into `.env`; it was never pasted into a chat.

---

## Found while finishing the category rail — 30 Jul 2026

**Fixed**

- Homepage rail now honours `isFeatured` (owner's choice: the rail is a chosen
  shortlist, not the catalogue). Nothing featured → **the whole section
  unmounts**, heading included. An empty rail under a heading reads as a fault;
  an absent section reads as intent.
- Carousel arrows were measured once, before the live list arrived, so a shop
  with three categories still offered a "scroll right" that did nothing. The
  effect now depends on `items`.
- `CategoryNav` returns `null` when nothing is visible. An empty `<nav>` keeps
  its padding and leaves a blank strip in the header — likely in the nationwide
  zone until products have zones.
- The "Category image" drop box was drawn 4:3 while the homepage card is
  **178×178 square**. Anything chosen there lost its sides with no warning.
  Boxes are now drawn in the shape they will be displayed in, and each states
  its size.

**⚠️ Open, and it belongs to the next page**

`/categories/[slug]` renders from `CATEGORY_SLUGS`, a hard-coded list built from
`CATEGORY_CONFIGS` in `_data/categories.ts`, and its products come from the mock
`PRODUCTS` array. So **a category created in the admin shows on the homepage and
404s when clicked.**

Deliberately not patched. A generic fallback page would have to draw its
products from the mock array — it would render a real category filled with
invented products. **A 404 is a visible failure; that would be an invisible
lie.** This is the category-page connection, and it is the next page in this
audit.

---

## Phase 2 · item 1 — Banners · built 30 Jul 2026

`Banner` + `StorefrontSetting`, migration `20260730220000_banners`, run via
`radian_banner_migrate.bat`.

**One table, three placements.** Hero slider, promo strip and announcement bar
were three hard-coded components with the same shape — a picture, some words, a
link, a season. Three tables would have meant writing the scheduling rule three
times and getting it subtly different by the third.

**Scheduling is enforced on read, not by a job.** `/shop/banners` compares
`liveFrom`/`liveTo` to now. A cron that flips `isActive` at midnight is a cron
that eventually does not run, and the failure mode is Valentine's still up in
March. Two date comparisons cannot drift.

**`zone` is a nullable String, not an enum** — zone is becoming an
admin-managed table, and this column becomes a FK to it. An enum would have to
be migrated twice. `null` means every zone.

**The migration seeds the existing banners.** The homepage looks identical the
moment it starts reading from the database; the owner edits what is already
there instead of facing a blank screen he must fill before the site looks right
again.

### Three deliberate differences between the placements

| | When nothing is live |
|---|---|
| Hero | keeps the last known-good slides — a homepage with no hero is not shippable |
| Announcement | keeps the standing line — it is part of the header's shape, and removing it makes the page jump on load |
| **Promo** | **disappears** — a seasonal interruption should be absent between seasons, not showing Valentine's in July |

### What stayed out of the owner's hands, and why

The hero's gradient and its drawn artwork have no column. Those are design, not
content: a colour picker on the hero backdrop is how a premium page becomes a
ransom note. An uploaded photo replaces the artwork; the arch silhouette and
shadow remain either way, so the page holds its shape whether or not the
photography has happened.

Rotation speed (2–30s, clamped) is a slider-level setting in
`StorefrontSetting`, not a per-slide field — it belongs to the slider. Below 2s
it is unreadable; above 30s most visitors never reach slide two, which quietly
wastes the banner.

New banners are created **switched off**. Nothing half-filled reaches the
homepage by being saved once.

### Admin

`/storefront/banners`, under a new **Storefront** sidebar group — the shop's own
front window, as against Marketing, which owns what gets *sent out*. Sections,
collections, reviews, content and the footer join that group as this audit
reaches them.

The editor shows different fields per placement: an announcement is one
sentence, a hero is fourteen fields. Showing all fourteen for an announcement
leaves eleven empty boxes and no clue which ones matter.

The list marks a banner "scheduled, not showing yet" by applying the same
window rule the API applies — otherwise the owner saves a future-dated banner,
sees no change on the site, and assumes it is broken.

---

## Phase 2 · item 2 — Trust strip + the icon system · built 30 Jul 2026

`TrustBadge`, migration `20260730234500_trust_badges`, seeded from the six
already on the site. Admin at `/storefront/trust`.

**This was a correction, not a feature.** The audit first filed the strip as
"leave as fixed text" and the owner overruled it. He was right: these are the
shop's largest claims, they differ by zone, and "bKash, Nagad and cards" stops
being true the day a payment method changes.

**`icon` and `iconUrl` are two columns, and the API clears one when the other
is set.** Left to the screen, picking from the set after uploading leaves both
filled and the renderer's tie-break silently decides — a rule nobody wrote and
nobody can predict.

**SVG upload is allowed, reversing my own earlier refusal.** The objection was
that SVG can carry script. It does not apply: script in an SVG runs only when
the file is loaded as a *document*, and these are referenced through `<img>`;
and they are served from `ik.imagekit.io`, not the shop's own origin. ⚠️ Point
two stops being true if images ever move to `images.radianbd.com`. Icons need
SVG — they inherit the brand purple through `currentColor`; a PNG arrives stuck
in whatever colour it was drawn.

The built-in set is **duplicated** in `apps/web/.../ui/ShopIcon.tsx` and
`apps/admin/.../ShopIconPreview.tsx`. `shared/` is empty, neither tsconfig maps
to it, and the containers mount only their own app — a workspace package for
twenty `<path>` strings costs more than the duplication. **Add an icon in one,
add it in the other.**

### Four UI passes, and what each one got wrong

Worth recording, because the same mistakes are available on every screen left
to build.

1. **Flex row with eight children.** Two inputs, a select and five buttons
   negotiated their own widths and collapsed into each other. Fixed with
   explicit `gridTemplateColumns`.
2. **No preview.** The screen edited six fragments of one row while the only
   question that matters — does the row look right — was unanswerable. A live
   preview now runs the same filter the public API runs.
3. **Dimming instead of filtering.** Rows outside the selected zone were greyed
   rather than hidden. A greyed row still asks to be read. The owner called it
   immediately.
4. **Zone-less badges shown under both zone tabs.** Correct behaviour, read as a
   duplicate — twice, after two different attempts to explain it in place. They
   now have their own tab and appear in exactly one list; the preview still
   shows the true combined result, with a link across.

**Also fixed: the reorder arrows.** The seed numbered each zone 0,1,2 — sensible
per zone, meaningless in one global list, so several rows shared a position and
swapping two identical values did nothing. The arrows looked broken and were
not; the data was ambiguous. Reordering now renumbers the whole list 0…n-1, and
swaps by **displayed** position, since a zone tab means the row above on screen
is not the row above in the data.

---

## Phase 2 · items 3–4 — Section headings, Collections · built 31 Jul 2026

### Section headings — `SectionText`

One store for every section's eyebrow / title / subtitle, **declared in code and
upserted on boot** (`SECTION_MANIFEST`), the pattern `RegistryService` already
uses. A new section names its key and appears in the admin list by itself.

- **`createMany({ skipDuplicates })`, never upsert.** An upsert would rewrite the
  owner's words with the manifest text on every restart.
- **Defaults are the live wording, not lorem.** Opening on placeholders would
  mean the first save silently rewrites the homepage.
- **`zone` is `""`, not NULL.** Two NULLs are never equal in Postgres, so
  `@@unique([key, zone])` on a nullable column would permit any number of
  "default" rows per key — the exact thing the constraint exists to stop.
- Storefront reads it **once per page** through a context provider; nine
  separate fetches would fill the page in visibly, line by line.
- Collapsed to an accordion on the owner's request — this screen will eventually
  hold every section of every page.

⚠️ **The boot crash worth remembering:** `SectionText` was created without
`deletedAt`. The soft-delete extension injects `deletedAt: null` into every
`findMany`, so Prisma threw *Unknown argument `deletedAt`* and the API would not
start at all. **Every new table needs the column, used or not.** Noted in the
schema so the next one does not repeat it.

### Collections — `Collection` + `CollectionProduct`

Two kinds in one table, because a shopper sees no difference — a titled page
reached from a card. Only membership differs: `PRICE_RANGE` maintains itself,
`MANUAL` is a list.

- **Price windows compare the price the customer PAYS, after discount** (owner's
  decision). Accepted consequence, stated on the admin screen: when a discount
  ends, the product leaves that shelf on its own and nobody is told.
- `accent` is a flag for the rose-gold tier, not a colour field — same boundary
  as the banners.
- Slug clashes append a number rather than failing with a database error the
  owner cannot read.

⚠️ **Membership is not resolved yet.** The rail needs the four cards, not their
contents, and the collection page does not exist. When it does, the price filter
must be raw SQL — the paid price is computed from `sellingPricePaisa` +
`discountType` + `discountValue`, so Prisma cannot filter on it.

### A bug found in three screens at once

`<label>` wrapping a picture drop passes a click on its caption to the file
input, so clicking the words "Card picture" — or the size hint under them —
opened the file dialog. The owner hit it on Collections; the same helper was
wrong in Banners (`L`) and Categories (`Field`). All three are now `<div>`. The
cost is losing click-caption-to-focus on text fields: a convenience traded for
removing a surprise.

---

## Phase 2 · item 5 — Visit the shop · built 31 Jul 2026

`ShopHour` (one row per weekday) + `ShopClosure` (dated) + three columns on
`CompanySetting` — `mapUrl`, `whatsappPhone`, `shopImageUrl`.

**Times are minutes since midnight.** Not `"09:00"`, not `DateTime`: no
timezone to get wrong, no parsing, and "is it open now" is one comparison.

**Open/closed is computed on the SERVER, in Bangladesh time.** Two failure modes
that both look fine in testing: the browser uses the *visitor's* clock (someone
in Toronto is told Dhanmondi is shut at lunchtime), and the container runs UTC
(the pill flips to Closed at 4 PM). Uses the same `BD_OFFSET_MS` as
`orders/promise.ts` and `finance-drift`.

**The readable line is generated, never typed** — so it cannot disagree with the
pill. Identical days collapse: "Open every day, 9 AM – 10 PM", or "Sat–Thu 9 AM
– 10 PM · Fri closed".

**`ShopClosure` is the important half.** Without it the site says Open on Eid
morning and somebody drives to Dhanmondi to find the shutters down.

**Both buttons pointed at `#`.** They looked live and did nothing. Each is now
rendered only once it has somewhere to go — a dead button costs more trust than
a missing one.

### One screen, on the owner's instruction

It shipped as "Opening hours", with address, phone, map link and photo left in
Settings → Company. He objected immediately and was right: one section of the
website should not need two screens.

The fields are still **stored** on `CompanySetting` and still written through
`CompanyService` — Administration owns that row. Two screens editing one row is
fine; two tables holding one fact is not.

⚠️ **`NO_SOFT_DELETE` — the REV-RTN-4 lesson, learned again.** `ShopHour`,
`ShopClosure`, `StorefrontSetting` and `CollectionProduct` carry no `deletedAt`,
so the auto-filter hit a column that does not exist and every call 500'd. The
fix is **adding the model to that Set**, not adding a pointless column —
`SectionText` got the column before the Set was noticed. That list already
carried this exact warning from the Returns module; I did not read it.

### The Save button, asked for three times

Three storefront screens save on blur — safer than a Save button, since nothing
is lost by closing a tab. The owner asked for a button three times and I argued
back twice. The argument was not wrong; it was beside the point. He could not
tell whether a change had landed, and a two-second green flash at the top of a
long page is not an answer.

`SaveBar` now sits pinned to the top of all four: **All changes saved** /
**Saving…** / **Not saved**. The button is not decoration — a field that still
has the cursor in it is not committed, and the button blurs it first, which is
exactly what someone means when they reach for Save.

---

## Phase 2 · items 6–8 — Footer, Reviews, Homepage layout · built 31 Jul 2026

### Footer & menus — `LinkGroup` / `NavLink` / `SocialLink` / `PaymentBadge`

One link table for the footer columns **and** the ☰ panel: several entries are
the same pages, and two lists mean correcting an address in one and leaving the
other pointing at a page that no longer exists.

- A social profile **with no URL is dropped by the API**, not rendered dead. The
  seeded rows are blank on purpose.
- The copyright **year is generated, never stored**. A footer still saying 2026
  in 2028 is the standard sign of an abandoned site.
- Payment badges stay under the owner's control rather than being derived from
  the Integrations table — he may want one live a day before the key lands — but
  the screen warns that a badge for a method he cannot take costs an order at
  the very end of the funnel.

### Reviews — `Review`

Three sources, deliberately redundant so Google going quiet does not leave the
homepage wordless.

**Nothing was seeded, and that is the only migration in this series where that
is true.** The four quotes on the page were invented when it was built; copying
them in would turn placeholder text into what reads as shop records, and nobody
later could tell them apart. The section hides itself until something real is
published.

Three things the API refuses regardless of the screen:

| | Why |
|---|---|
| `source` cannot be changed | "the shop wrote this" relabelled as "a customer wrote this" is the offence that costs an ad account |
| a GOOGLE review cannot be edited | those words belong to the person who left them |
| `verifiedPurchase` is never accepted from a request | a badge you can award yourself is worth nothing |

⚠️ **Correction to earlier advice.** I told the owner that pulling Google review
*text* needed a verified Business Profile. It does not — the Places API returns
reviews for any public place with only a Cloud API key. Verification is needed
for the Business Profile API (the full history, replying). Confirmed against
Google's Place Details docs: `reviews` is a field, on the Enterprise+Atmosphere
SKU, so the pull must be **cached daily** rather than called per page view.
Places returns only a handful (~5) and chooses which — the shop's own reviews
are still needed to fill the rail.

**A UI trap worth remembering:** the Google card's placeholders read `4.9` and
`127`. The owner filled in the URL, believed the numbers were saved, and
reported the card broken. Realistic placeholders are indistinguishable from
values at a glance. Now `e.g. 4.9`, plus a line stating whether the card is live.

**Also fixed:** the card was hidden whenever the review list was empty — so the
figures he had just entered vanished. They are independent; the section now
hides only when there is neither.

### Homepage layout — `PageSection`

Manifest-declared, upserted on boot, storing only the owner's decisions: on/off,
order, zone. The storefront renders `order.map()` over a key→component map.

⚠️ **`locked` lives in the code, not the database.** The hero carries the page's
only `<h1>`; reviews and the shop card sit in the design's fixed order with the
footer. As data, "locked" is one unreviewed UPDATE from being untrue. The server
rejects a locked move even though the screen disables the arrow — a rule that
exists only in the browser is not a rule.

Arrows **step over** locked rows to the nearest movable neighbour. Otherwise
pressing "up" against a locked section does nothing and reads as broken — the
same complaint the trust strip drew.

**Not built: adding a brand-new section.** The eight block types are each
effectively their own feature. Said on the screen so it is not hunted for.

---

## Homepage — second full sweep, 31 Jul 2026

Read top to bottom against the code, not from memory, after the connection work
was finished. **Seventeen things are live. Ten are not, and they divide into
three very different kinds.**

### 🔴 Wrong on the page right now

| | What | Why it matters |
|---|---|---|
| 1 | **`/recipients` does not exist** | "Every Occasion, Every Person" → *By Relation* → every card 404s. Pre-existing; the tab has always linked there. `/occasions` exists, its twin never did. |
| 2 | **The delivery countdown is fiction** | "Order within **3 hrs 24 min**" is a typed string. It never moves, and it is wrong from the second the page loads. The component's own comment admits it. `DeliveryMethod.cutoffTime` is in the admin and unread. |
| 3 | **"★ 4.9 Loved on Google" is typed twice** | Once on the shop card, once in every hero slide's proof row. The owner can now set the real rating on the Reviews screen — these two do not follow it. Change it to 4.7 and the site still says 4.9 in three places. |

⚠️ **All three are claims, not decoration.** A false countdown and a stale star
rating are the kind of detail a customer checks.

### 🟡 Admin has the data; the page is not reading it

| | What | Where the data already is |
|---|---|---|
| 4 | Delivery mode names and lines — "Same Day · Order by 6 PM" | `DeliveryMethod.label` / `etaLabel` / `cutoffTime` |
| 5 | "Nationwide, 1–3 Days" and "courier-safe to all 64 districts" | same |
| 6 | The shop card's floating chip — "Dhanmondi, Dhaka / Watch your gift arranged by hand" | nowhere yet; needs two fields, like the banner's floating cards |

### 🟠 An inconsistency worth fixing before more pages are built

**Section headings only load on the homepage.** `SectionTextProvider` wraps
`app/page.tsx` and nothing else — but **Reviews** and **Visit the shop** render
on *every* page. So editing "Why Dhaka Loves Radian" changes it on the homepage
and leaves the old wording on `/journal`, `/about`, `/faq`…

The fix is to move the provider into the layout. Left for now because it should
be done once, when the next page is connected, rather than twice.

### ⛔ Known, and assigned elsewhere

| | What |
|---|---|
| 7–9 | **Products** — Best Sellers, the delivery band's four cards, and an added product row. All three read `_data/products.ts`. |
| 10 | **The storefront renders in the browser.** `app/page.tsx` is `"use client"` for the zone store, so the whole homepage assembles client-side. On a slow phone that is a real cost, and Google sees an empty shell first. Pre-existing, not caused by this work, and a bigger job than any single section. |

### Fixed during this sweep

`EmployeeViews` staff photo used the base64 data-URL path — the same fault as
Tags, with a **1.5 MB limit bolted on** to hide it. The limit was the symptom: a
normal phone photograph never fit, so the owner had to shrink files by hand.
Now uploads to ImageKit, and the server's 10 MB limit applies.

⚠️ **Employee *documents* still use data URLs.** Left deliberately: they are
PDFs, not images, and the media endpoint takes images only. A document store is
its own piece of work.

---

## The picture bug — the whole sweep (31 Jul 2026)

The owner asked for it to be found *everywhere*, not just where it had been
reported. It was in eight more screens, in two different shapes.

**Shape one — base64 data URL.** The file was read in the browser and the
resulting string was saved into an ordinary text column. It looked like it
worked, because the preview came from the browser and never from the server.
Two failures followed. base64 is about a third larger than the file it encodes
and it travelled inside the JSON body, so anything but a small file pushed the
request past the limit and the save failed silently — picture on screen, gone on
refresh. And when it did fit, the photograph now lived inside the row, so every
list request that touched that table dragged it along.

**Shape two — `URL.createObjectURL(file)`, and worse.** That address is a handle
to a file in *this tab's memory*. It is not a web address. It stops working when
the tab closes and it never meant anything to anyone else's browser. Two places
were writing it to the database.

| Screen | Was | Now | Folder |
|---|---|---|---|
| Product editor · Photos | base64, up to 6 per product | uploaded, multi-select, one at a time so a bad file names itself | `products` |
| Variant attributes · option photo | `blob:` URL saved to the row | uploaded, stored as `url(…)` | `products` |
| Add-ons · tile photo | `blob:` URL saved to the row | uploaded, stored as `url(…)` | `products` |
| Items (raw material) · photo, both pickers | base64, force-shrunk to 256px | uploaded full size | `items` |
| Suppliers / vendors · photo | base64 | uploaded | `suppliers` |
| Purchases · receipt photo | base64 at 900px | uploaded at 1200px | `purchases` |
| Delivery · proof photos | base64 at 900px, several per order | uploaded at 1400px | `delivery` |
| Brands · logo | base64, with a 4 MB guard that hid the fault | uploaded; SVG passes through untouched | `brand` |

**One helper, not eight fixes.** `fileToItemImage` — which four of these shared —
is now `uploadItemImage(file, folder, maxPx)`. It uploads and returns the URL.
The canvas shrink survives but only as a courtesy: files over 3 MB are reduced
so the server's 10 MB limit turns a confusing rejection into a successful
upload. Anything under it is sent untouched, because ImageKit resizes on
delivery and there was never a reason to throw detail away here.

**Every one of these now shows the preview only after the upload returns.** What
is on screen is what is in the database. That is the whole point.

Four new folders on the server allowlist: `items`, `suppliers`, `purchases`,
`delivery`. SVG, previously accepted for `icons` only, is now accepted for
`brand` too — a manufacturer hands over a vector logo far more often than a PNG,
the screen has always said so, and the logo is rendered through `<img>` exactly
as icons are, so the reasoning in `media.ts` covers it unchanged.

⚠️ **Rows saved before today still hold base64.** They keep displaying, because
a browser will render either. They are not cleaned up. If the catalogue is small
enough, re-picking those photographs is worth doing; if not, they can be left,
and they will fall away as products are edited.

⚠️ **Employee documents are still data URLs** and are the one remaining case.
Deliberate: they are PDFs, not images, and the media endpoint takes images only.
A document store is its own piece of work.

---

## What is INSIDE each section (3 Aug 2026)

The owner, looking at three screenshots of his own homepage:

> "amder jotogula section ache sob section amra ata control krte parsi na …
>  ami catagory ata home page show krabo or krabo na ata control krte parsi na.
>  abr samevabe occasion and person o same vabe … abr need section o same."

He was right, and I had shipped the half that is easier to notice. `PageSection`
answers **does this section appear, and where**. Nothing answered **what is in
it**. Three sections were each choosing their own contents by reading a column
written for a different purpose:

| Section | Chose its contents by | Why that was wrong |
|---|---|---|
| Shop by Category | `Category.isFeatured` | The column existed and worked — but it lived three clicks inside one category's editor. There was no screen that showed the rail *as a rail*, so there was no way to look at the homepage and change it. |
| Every Occasion, Every Person | `TagGroup.displayStyle == CARD` | `displayStyle` says **how** a group draws — chips or cards. Borrowing it meant a tab could only be removed by changing how that group renders on every other page. |
| Need It Today | `DeliveryMethod.isActive` | `isActive` says whether the shop **sells** that delivery. The only way to take "Schedule It" off the front page was to stop accepting scheduled orders. |

**One column name across the whole schema.** `isFeatured` was already the
codebase's word for "on the homepage" — Brand, Collection, Review and Category
all used it. It is now on `TagGroup`, `Tag` and `DeliveryMethod` too, so there
is one name with one meaning rather than three near-synonyms.

**The defaults differ on purpose, and each one has a reason:**

- `TagGroup` → **false**. A new tag group is usually a filter ("Colour"), and
  one that promoted itself to a homepage tab on creation would be a surprise.
- `Tag` → **true**. Adding "Eid" to the Occasions tab should put a card there.
  That is what "add it in the admin and it appears" was always supposed to mean.
- `DeliveryMethod` → **true**. Four cards exist today and all four must survive
  the migration untouched.
- `Category` → **false**, unchanged. The rail is a chosen shortlist; a catalogue
  has dozens of categories and cannot all be on the front page.

**The migration backfills before it changes anything.** `UPDATE "TagGroup" SET
"isFeatured" = ("displayStyle" = 'CARD')` runs the old rule once and writes its
answer into the new column, so the homepage on the morning after is identical to
the homepage the night before. That is the same seed-from-current-content rule
every migration in this project has followed.

**New: `storefront/home-content.ts`, and it owns no table.** It is a view over
Category, TagGroup, Tag and DeliveryMethod, and every write lands back on the
owning table through the columns those tables' own screens already use. One Data
One Owner is intact. What is new is a place to stand where a whole section can
be seen at once. It exists as one endpoint rather than four because reordering
must renumber the **whole** list server-side — the "arrows are broken" round
came from rows that shared a `sortOrder`, and that logic belongs in one place.

**New tab: Storefront → Homepage → Contents**, sitting immediately after Layout.
Sections appear in the order they appear on the site, because he navigates by
what he can see. Three things it deliberately does not do, each learnt here:

1. It never hides an unticked row. A list showing only what is *on* the homepage
   cannot be used to put something back.
2. It never swaps two positions — every arrow sends the full list.
3. A tick that the server refuses is rolled back and explained, rather than left
   sitting there meaning nothing.

⚠️ **Order is shared with the top menu** for categories. One list, on purpose: a
shopper who sees Flowers first on the homepage should not find it third in the
menu. The screen says so above the list rather than leaving it to be discovered.

⚠️ **Found while reading the delivery band:** "Schedule It" and "Same Day" show
the identical line *"Order by 6 PM, delivered tonight"*. That is data, not code —
"Schedule It" has no `etaLabel`, so it falls through to the design's wording for
the same-day card. Filling in its ETA under Delivery fixes it.

---

## Pages still to audit

Display: category · product (PDP) · collection · occasion · search · journal ·
FAQ · policy pages · about · contact · delivery info

Money (questions, not fields): cart · checkout · order success · account
(profile, orders, addresses, wishlist) · track
