# Homepage admin-control audit — 4 Sep 2026

Read-only audit. Code inspected: `apps/web` (homepage `app/page.tsx` + section components), `apps/api/src/shop/*` and `apps/api/src/storefront/*`, `apps/admin/app/storefront/*` + `_components/*View.tsx`, at `inv-rev-4-opening-guard @ 6a2f423` (same homepage code as DEV `debd3b8`). Live behaviour confirmed on https://development.radianbd.com.

## How the homepage is assembled

`app/page.tsx` asks `GET /shop/layout?zone=` and renders the returned blocks in order. Built-in blocks (`hero, trust, categories, occasions, bestsellers, promo, delivery, budget, giftfinder, reviews, blog, store`) render their own component; admin-added blocks (`PRODUCT_ROW`, `COLLECTION_ROW`, `BANNER_STRIP`) render `CustomSection`. Section headings (eyebrow / title / subtitle) come from `GET /shop/section-text` (`SectionText` table, zone override) through `SectionHead`.

Admin home: **Storefront → Homepage** (`/storefront/layout`) with six tabs: Layout · Contents · Banners · Trust strip · Budget cards · Wording. Other homepage feeders live elsewhere: Products → Badge rules, Catalog → Categories / Tags, Delivery → methods, Storefront → Reviews / Journal / Visit the shop / Footer & menus.

## Section-by-section

### 1. Header (logo, menu, announcement bar, icons, search)
- Logo: admin (Setup → brand logo, `/shop/brand`).
- Announcement bar: admin banner with placement ANNOUNCEMENT (Banners tab); when none is live, the bar is generated from delivery masters (fastest method). Fallback sentences hardcoded.
- Category menu: admin (Category `showOnNavbar`, order, icon). Hidden automatically when a category has 0 published products (rule in code).
- Icons (Log in / Track Order / Wishlist / Cart / More) and search placeholder "Search flowers, cakes and gifts": hardcoded.
- "More" panel: admin (Footer & menus groups); fallback list hardcoded.

### 2. Hero slider
- Admin (Banners tab, placement HERO): eyebrow, headline plain + coloured part, description, button 1/2 text + link, three trust lines, two floating cards (icon from a fixed set of 4 names + title + sub), picture, zone, live from/until, order, on/off, rotate seconds.
- Hardcoded: section background gradient; the arch shape; per-slide backdrop gradient + drawn artwork when no picture; floating-card icon set (bolt/heart/truck/gift only); **the picture is not rendered on mobile at all** (`hidden lg:block`); four fallback slides (shown until the API answers or when every slide is off); cannot be hidden or moved (locked in code, carries the H1).
- Partially dynamic: yes — the picture is a background of a fixed arch; no per-slide background colour; no mobile image.

### 3. Trust strip
- Admin (Trust strip tab): title, subtitle, icon (built-in set or uploaded), zone, order, on/off.
- Hardcoded: four fallback items per zone (shown until API answers / when none configured); layout only.
- Fully admin controlled for content.

### 4. Shop by Category
- Admin: Contents tab (tick = `Category.isFeatured`, order, zone) + Categories screen (name, image, summary line).
- Wording: Wording tab (`home.categories`).
- Hardcoded: card sub-line rule when no summary ("120+ products", hidden under 10); tint gradients when no image; fallback list of 8 legacy categories (Cakes, Plants… — slugs that no longer exist) until the API answers.
- No admin control of: number of cards, card shape, the "View all" (none exists).

### 5. Every Occasion, Every Person
- Admin: Contents tab (tabs = tag groups `isFeatured`, cards = tags `isFeatured`, order) + Tags screen (name, summary, image).
- Wording: Wording tab (`home.occasions`).
- Hardcoded: fallback tabs/cards (Mother's Day links to `/occasions` index because no tag existed); card link rule (`/occasions/<tag>` only for the occasions group, everything else `/products?group=tag`); tints.

### 6. Best Sellers — see the deep-dive below
- Admin: only the heading (Wording tab) and the badge rule (Products → Badge rules) + per-product Auto/Always/Never.
- Hardcoded: the category tabs; the selection query; 8-card limit; 24-card pool; "View All Products" button text + link; the "Nothing here yet" empty state.

### 7. Promo strip
- Admin (Banners tab, placement PROMO): eyebrow, headline, description, button 1 text/link, picture, zone, schedule, on/off. Disappears when no promo banner is live (correct).
- Hardcoded: gradient + scrim; button 2 and trust lines are ignored for this placement.

### 8. Delivery band ("Need It Today?")
- Admin: Contents tab (which delivery methods appear = `DeliveryMethod.isFeatured`, order); Delivery module (names, ETA label, cutoff → live countdown). Wording tab (`home.delivery`, zone override).
- Products under the tabs: **automatic rule** — `GET /shop/products?speed=express|same_day|midnight&sort=popular&limit=4` (products flagged with that speed, sorted by popularity). Not admin-selectable.
- Hardcoded: the icon per tab (matched by keyword in the method's name: "midnight" / "express|2|two" / else same-day); nationwide card text "Nationwide, 1–3 Days / Courier-safe gifts to all 64 districts"; "View All Products" button; fallback mode list; 4-card limit.

### 9. Gifts for Every Budget
- Admin (Budget cards tab = Collections): name, small line above, line underneath, picture, rose-gold accent, "put on homepage" (`isFeatured`), zone, order, price range or manual product list.
- Wording: Wording tab (`home.budget`).
- Hardcoded: tints when no picture; link always `/collections/<slug>`.
- Fully admin controlled for content.

### 10. Gift Finder
- Admin: options come from the two SYSTEM tag groups (Tags screen: names, images, order) and from Collections (budget step). No dedicated screen.
- Wording: Wording tab (`home.giftfinder`) for the heading only.
- Hardcoded: the three question sentences (`QUESTIONS` map overrides the admin group name), button labels ("Next →", "Show My Gift 🌸", "See the gifts →"), result behaviour (link to `/products?…`), step order (groups then budget), fallback steps.
- Partially dynamic.

### 11. Reviews
- Admin (Storefront → Reviews): reviews (approve/publish, source), Google rating/count/url. Hidden when nothing is set (correct). Locked: cannot be hidden or moved (in code).
- Wording: Wording tab (`home.reviews`).
- Hardcoded: "See all reviews" / "Read them on Google" / "Write a review" labels; card layout; the four invented fallback stories exist in code but are NOT rendered.

### 12. Latest Articles (blog)
- Admin (Storefront → Journal): posts. Hidden when none published.
- Hardcoded: always the 3 newest (no pick, no count); "min read" line; fallback posts exist in code but are NOT rendered.

### 13. Visit the shop
- Admin (Storefront → Visit the shop): address, city line, phone, WhatsApp, map link, photo, chip title/sub, weekday hours + closures (open-now pill computed server-side). Wording tab (`home.store`). Locked position (in code).
- Hardcoded: "Get directions" / "Call the studio" labels; "Loved on Google" chip text; fallback lines ("House 12, Road 5, Dhanmondi", "+880 1X XXX XXXXX") shown until the API answers.

### 14. Footer
- Admin (Footer & menus): link groups, social profiles, payment badges, tagline, legal line.
- Hardcoded: fallback groups; fallback payment list (bKash, Nagad, Rocket, VISA, Mastercard, COD) when none configured.

### 15. Admin-added blocks (Layout tab → "Add a section")
- COLLECTION_ROW: admin picks collections — works from live data.
- BANNER_STRIP: admin picks a banner — works from live data.
- **PRODUCT_ROW: BROKEN** — the admin picks a rule (best sellers / new / express / midnight) and a count, but `CustomSection.tsx` still filters the **mock product array** (`_data/products.ts`, 72 invented products). An owner-added product row on the homepage shows fake products and prices.

### 16. Section text fallbacks
Every section keeps its original wording in code as the fallback until `/shop/section-text` answers (by design). Keys covered: categories, occasions, bestsellers, delivery, budget, giftfinder, reviews, blog, store. Not covered (no wording key): trust strip heading (none), promo (has its own banner text), hero (banner text).

### 17. Product card (used by Best Sellers, Delivery band, custom rows)
- Data: live (name, price, MRP, image, badges from product flags, stars from published reviews, "X sold" from `salesCount`).
- Hardcoded labels: express pill **"Today, 2 hrs"** (the admin's fastest method is 3-hour express — contradiction), "Midnight ready", "🚚 1–3 days, nationwide", "Best seller", "New".

## Best Selling section — deep-dive

**How the tabs are generated.** Hardcoded in `BestSellers.tsx`:
`All Products · Flowers (flowers) · Cakes (cakes) · Balloon Bouquets (balloons) · Chocolate Bouquets (chocolates) · Gift Boxes (giftboxes)`. These are the slugs of the mock catalogue from July. A tab is shown only if at least one product in the fetched pool has `cat === that slug`. The API returns `cat` = the product's **top-level category slug** (`fresh-flower`, `money-bouquet`, `teddy` on DEV). None match, so DEV shows only "All Products". Tabs never follow the admin's categories.

**How products are selected.** One fetch: `GET /shop/products?sort=popular&limit=24&zone=…`. That is a **sort, not a filter**: `ORDER BY isBestSeller DESC, salesCount DESC, createdAt DESC`. The section takes the first 24 and shows 8 per tab (client-side filter by `cat`).

**Why unrelated products appear.** Three reasons, all in the query:
1. Nothing filters on `isBestSeller = true`. When fewer than 8 (per tab) or 24 (overall) products carry the badge, the rest of the slots are filled by the next products in the sort — first by `salesCount`, then by **newest created**. On a small catalogue that means new/test products appear under "Best Sellers".
2. `salesCount` is not a clean sales figure: it is incremented on delivery **and** is a typed field on the product form (`salesCount` / `salesSeed*`, DEC-PRD-025). A typed "500 sold" outranks a real 12 sold.
3. Per-tab filtering is by category only, so a tab (when it matches) shows *any* product of that category that reached the 24-card pool, not that category's best sellers.

**Is the "All" tab correct?** Partly. The first cards are the badge holders (Badge rules: top X% per top-level category over the last N days, min sales, floor; product override Always/Never wins). After those, it is padding. On DEV today all 8 shown carry `best: true` — but four of them earned it through "Always" overrides on test products, and the order among badge holders is by `salesCount` (editable), not by delivered sales in the window.

**Is the ranking admin-controlled?** The *badge* rule is admin-controlled (Products → Badge rules: days, percent, min count, min sales, per-product Auto/Always/Never, "Recalculate" button). The *section* query (sort keys, pool of 24, 8 per tab, padding with non-best-sellers, tab list) is hardcoded and has no admin surface.

**Extra:** custom PRODUCT_ROW blocks with rule "bestseller" use the mock list, so they do not even read `isBestSeller`.

## Summary table

| Homepage section | Fully admin controlled? | Partially controlled? | Hardcoded? | Current admin location | What is missing | Recommended fix |
|---|---|---|---|---|---|---|
| Announcement bar | ✔ text (banner) | ✔ generated line when no banner | fallback sentences | Homepage → Banners (Announcement) | on/off of the bar, link | Add link + hide switch to the banner row |
| Header menu / icons / search | menu ✔ | — | icon labels, search placeholder, "Log in/Track Order" | Catalog → Categories (Show on navbar), Footer & menus (More panel) | none critical | Optional: search placeholder in Storefront settings |
| Hero slider | ✔ all copy, image, CTAs, schedule, zone, order, rotate | ✔ visuals (arch, gradients, icon set) | 4 fallback slides; no mobile image; locked | Homepage → Banners (Hero) | mobile image, backdrop choice, float-card icon upload | Add mobile image field (or show the same image), optional background style, uploaded icon for float cards; keep locked |
| Trust strip | ✔ | — | fallback items | Homepage → Trust strip | link per badge (optional) | Add optional link |
| Shop by Category | ✔ items, order, zone, image, summary | ✔ sub-line rule, card count | fallback list, tints | Homepage → Contents; Catalog → Categories | "View all" link, card count/limit | Add section settings: max cards, view-all link |
| Every Occasion, Every Person | ✔ tabs, cards, order, images | ✔ card link rule | fallback lists, tints | Homepage → Contents; Catalog → Tags | per-card custom link | Add optional link on tag |
| **Best Sellers** | ✘ | heading ✔, badge rule ✔ | **tabs, selection query, limits, button** | Wording tab; Products → Badge rules | tab control, product source (rule vs manual pick), limit, button text/link, empty-state | See "Best Sellers fix" below |
| Promo strip | ✔ | — | gradient, button 2 ignored | Homepage → Banners (Promo) | second button (optional) | none required |
| Delivery band | ✔ tabs (methods), wording, countdown | ✔ products by automatic speed rule | icons by name-matching, nationwide card text, button, 4-card limit | Homepage → Contents; Delivery → methods; Wording | choose products or rule per tab, nationwide card wording, icon | Add per-method icon field, "products under this tab" rule/manual pick, count, button text/link; move nationwide card text to a banner/section text |
| Gifts for Every Budget | ✔ | — | tints | Homepage → Budget cards | none | none required |
| Gift Finder | options ✔ (tags, collections) | ✔ | question texts, buttons, result behaviour, step order | Wording tab; Catalog → Tags; Budget cards | its own editor | Add Gift Finder settings: question per step, step order/on-off, button labels, result target |
| Reviews | ✔ reviews + Google card | — | button labels; locked position | Storefront → Reviews; Wording | hide switch (locked by design) | keep; optionally make position movable |
| Latest Articles | posts ✔ | — | count 3, newest only | Storefront → Journal; Wording | pick posts / count | Add "featured on homepage" + count |
| Visit the shop | ✔ | — | labels, fallback lines; locked | Storefront → Visit the shop; Wording | none critical | keep |
| Footer | ✔ | — | fallback groups/payments | Storefront → Footer & menus | none | none required |
| Layout (order / on-off / zone) | ✔ for movable sections | — | hero, reviews, store locked | Homepage → Layout | — | keep |
| Added block: Product row | ✘ **renders mock products** | admin picks rule + count | data source | Homepage → Layout → Add a section | live data | Point `CustomSection.ProductRow` at `/shop/products` (rule → sort/speed filter); or replace with the same picker as Best Sellers |
| Added block: Collection row | ✔ | — | — | Homepage → Layout | — | none |
| Added block: Banner strip | ✔ | — | — | Homepage → Layout | — | none |
| Product card labels | — | — | "Today, 2 hrs", "1–3 days, nationwide" | — | speed wording from delivery masters | Read the express/courier wording from the delivery methods (already exposed by `/shop/delivery-modes`) |

## Best Sellers — recommended fix (for approval, not implemented)

1. **Selection rule, admin-chosen per section**: `Automatic (badge holders)` — only products with `isBestSeller = true`, ordered by delivered sales in the badge window (not `salesCount`); `Manual` — a picked, ordered list; `Automatic + fill` (current behaviour, made explicit). Add `best=true` support to `/shop/products`.
2. **Tabs from the admin**: default = the featured top-level categories (same list as Shop by Category), each tab filtering the badge holders of that category; "All" = badge holders across categories. Allow untick/reorder per tab and a per-tab manual pick.
3. **Section settings**: cards per tab, pool size, show/hide "View all" + its text and link, empty-state text.
4. **Ranking hygiene**: stop the typed `salesCount` from influencing homepage ranking (use the badge window figure or a separate `displaySold`), so a display number can never reorder the shelf.
5. Reuse the same block for admin-added product rows so there is one definition of "best seller".

_No code, data, migrations or deployments were changed for this audit._

---

## Fixed on 4 Sep 2026 — branch `inv-rev-4-opening-guard`, commits `46103af` + `02df35f` (not yet deployed)

| Audit item | Now |
|---|---|
| Best Sellers tabs hardcoded | Tabs = the admin's top-level categories in his order (Homepage → Layout → ⚙ on Best Sellers); until chosen, the featured ones |
| Best Sellers selection padded by `salesCount` | AUTO = earned badge only, ranked by `Product.bestSellerSales` (delivered website qty in the badge window, written at recompute); MANUAL = his list; AUTO_FILL = badge first, then real sales, then newest |
| Per-tab products from a global pool | Each tab is its own query on that category; "All" spans the tab categories |
| Count / View all / empty state hardcoded | Cards per tab, All label, View all show/text/link, empty title/text |
| Added "row of products" block on mock data | Reads `/shop/products` with the same rule (`best=1&sort=best`) — homepage and category pages |
| Product card "Today, 2 hrs" / "1–3 days" | `/shop/card-wording` from the delivery masters; a product with no speed the shop names gets no pill |
| Announcement bar link / on-off | Banner "Goes to" makes the line a link; Banners → Announcement: "When no announcement is live: describe the service / show nothing" |
| Shop by Category count | ⚙ → max cards (0 = all featured) |
| Latest Articles count / picks | ⚙ → how many, which |
| Gift Finder questions / buttons | ⚙ → question per step, three button labels |
| Delivery band count / button / nationwide card | ⚙ → cards per tab, button; nationwide card reads the nationwide method's own name + ETA |
| `popular` sort anywhere | badge → real window sales → newest; `salesCount` no longer sorts anything |

Not done (needs schema work in other modules; listed in the audit as optional): trust badge link, occasion card link, per-method icon on the delivery band, hero mobile image / backdrop / float-card icon upload, reviews & store position (locked by design).
