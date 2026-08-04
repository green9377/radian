# Radian Frontend — Handover Handbook

**সর্বশেষ আপডেট:** 15 July 2026 (Track Order + Occasions index session)
**পরের কাজ:** নিচে §১৩গ দেখো (Track Order + Occasions index এখন DONE, loose end বন্ধ)
**নতুন chat শুরু করার আগে এটা পুরোটা পড়ো।**

---

## ১. প্রজেক্ট পরিচয়

**Radian Flower & Gift Shop** — Bangladesh-এর premium eCommerce platform।

| | |
|---|---|
| **Location** | `D:\radian` (Windows, Docker monorepo) |
| **Stack (locked)** | Next.js **16.2.10** + TypeScript + Tailwind **v4** (web), NestJS (api), PostgreSQL + Prisma (db) |
| **Fonts** | Fraunces (display) + Jost (ui) — `next/font/google`, CSS var `--font-display` / `--font-ui` |
| **State** | Zustand (global), React Context শুধু Theme/Config-এ |
| **Money** | সবসময় **integer paisa** (`pricePaisa`), display-এ `formatTaka()` |

⚠️ **`apps/web/AGENTS.md` পড়ো** — Next.js 16-এ breaking change আছে। `params` এখন **Promise**, `await` করতে হয়। Doc: `node_modules/next/dist/docs/`

```powershell
cd D:\radian
docker compose up            # postgres + api + web
docker compose up --build    # নতুন package বা Dockerfile বদলালে
```
Web `localhost:3000` · API `localhost:4000`

---

## ২. এখন পর্যন্ত কী তৈরি — Build Status

### ✅ Homepage — DONE

Header (zone-aware, LocationGate) · Hero · TrustStrip · CategorySection · OccasionSection · BestSellers · PromoBanner · DeliverySection · BudgetSection · GiftFinder · Blog · **GBE** · SupportPanel

### ✅ Category Page — DONE

**একটাই dynamic template — ৮টা category চলে, শূন্য নতুন component।**

`/categories/fresh-flowers` · `cakes` · `flower-combos` · `chocolates` · `plants` · `personalised` · `balloon-bouquets` · `gift-boxes`

### ✅ PDP — DONE (এই session-এ)

`/products/[slug]` — **৭১টা product-ই কাজ করে, শূন্য 404।**
Category template + per-product override। বিস্তারিত §৭-এ।

### ✅ Cart — DONE (এই session-এ)

`/cart` — cart store + resolver + page। PDP-র Add to Cart এখন সত্যিই cart-এ যায়,
Header badge real। বিস্তারিত §৮-এ।

### ✅ Checkout + Order Success — DONE (এই session-এ)

`/checkout` — ৪ step accordion (Details · Receiver+Gift · Where&When · Payment) +
sticky summary। `/order-success` — 7-stage tracker + রসিদ। বিস্তারিত §১৩-এ।

### ✅ Sub-category + Occasions — DONE (এই session-এ)

`/categories/[slug]/[sub]` — **৪৪টা sub-page**। **Lean:** শুধু product grid + GBE
(banner/breadcrumb/সব discovery rail OFF — D42, D43)। Rose-এ click = শুধু rose product।
`/occasions/[slug]` — **৮টা data-ওয়ালা occasion**, cross-category (occ tag filter,
cat নয়)। alias map পুরনো link বাঁচায় (love-romance→love)। বিস্তারিত §১৩খ-তে।

### ✅ Track Order — DONE (এই session-এ)

`/track` — track number দিলে **শুধু delivery timeline** দেখায় (receipt/দাম/order-content
নয় — receiver-এর হাতে number থাকলে surprise/দাম ফাঁস হবে না)। `DeliveryTimeline`
reuse (D31)। Lookup: backend নেই তাই শুধু **শেষ order** (`useOrderStore`) মেলে, না মিললে
সৎ empty-state। Stage: online-paid→placed+confirmed, COD→শুধু placed। order-success +
header icon + footer সব `/track`-এ যায় (আগে `/track-order` → 404)। বিস্তারিত §১৩গ।

### ✅ Occasions index — DONE (এই session-এ)

`/occasions` — ৮টা canonical occasion-এর arch-card grid (product count সহ) + GBE।
data `OCCASION_LIST` (⇄ SWAP HERE)। Footer/Hero/category "All Occasions" আর 404 নয়।
Homepage **mothers-day** card `/occasions`-এ repoint (def/tag নেই বলে — Marketing
occasion+tag দিলে `/occasions/mothers-day`-এ ফেরাও, এক লাইন)।

### ❌ এখনো বানানো হয়নি

| Page | কেন জরুরি |
|---|---|
| Auth (WhatsApp OTP) · Account pages | Board আছে, code নেই। Checkout এখন **guest-only**। Auth এলে Track Order-এর lookup সত্যিকারের order history পাবে |
| Wishlist · Search · Policy pages | Board আছে, code নেই |
| **Payment gateway** | bKash/Nagad/Card — Place Order এখন সরাসরি success-এ যায়, gateway redirect নেই |

**সব ২৯টা design board** project files-এ আছে (`radian-*.html`)।
**PDP-র নতুন board:** `radian-product-details-v4.html` (v1 outdated — v4-ই final)।

---

## ৩. Folder Structure (current)

```
D:\radian\apps\web\app\
├── _components\
│   ├── Header\   Hero\  TrustStrip\  Categories\  Occasions\  BestSellers\
│   ├── Promo\  Delivery\  Budget\  Blog\  GiftFinder\  Support\
│   ├── Product\ProductCard.tsx      ← সব page-এ reuse
│   ├── GBE\  Reviews.tsx  VisitStore.tsx  Footer.tsx
│   ├── ui\Carousel.tsx
│   ├── Category\                    ← Category page (১৪ ফাইল)
│   │   └── CategorySections.tsx     ← ★ renderer
│   ├── Pdp\                         ← ★ PDP (৬ ফাইল)
│   │   ├── PdpView.tsx              ← gallery + buy panel (client)
│   │   ├── PdpVariants.tsx          ← VariantRow · SizeRow · BundleCards
│   │   ├── PdpBuyBar.tsx            ← CtaRow · StickyBar · OutOfZone · BlkTitle
│   │   ├── SpecFaq.tsx              ← "Before You Order" + spec table
│   │   ├── RelatedRail.tsx          ← stagger reveal
│   │   └── PdpIcons.tsx             ← Icon set — Cart-ও এটাই reuse করে
│   ├── Cart\                        ← ★ Cart (৪ ফাইল)
│   │   ├── CartView.tsx             ← orchestrator (client)
│   │   ├── CartLine.tsx             ← line card + qty + add-on chip + held flag
│   │   ├── CartSummary.tsx          ← progress bar · coupon · total · CTA → /checkout
│   │   └── CartExtras.tsx           ← ConflictBar · UndoBar · MissingLines
│   │                                   · CrossSell · EmptyCart · CartSticky
│   └── Checkout\                    ← ★ Checkout (৭ ফাইল)
│       ├── CheckoutView.tsx         ← orchestrator + guard + zone block + placeOrder
│       ├── CheckoutFields.tsx       ← StepBar · QCard · Field(*) · PhoneInput · Toggle · Seg
│       ├── CheckoutSteps.tsx        ← Q1 Details (country code) · Q2 Receiving + gift
│       ├── CheckoutDelivery.tsx     ← Q3 Where (zone · address) · Q4 When (method · date · slot)
│       ├── CheckoutPayment.tsx      ← Q5 Payment — SSLCommerz + COD gating
│       ├── CheckoutSummary.tsx      ← summary · promo code · held notice · trust · sticky bar
│       ├── DeliveryTimeline.tsx     ← ★ 7-stage — শুধু order-success-এ (D38)
│       └── OrderSuccessView.tsx     ← রসিদ + tracker (client)
├── _data\
│   ├── products.ts                  ← ৭১টা mock product + Product type (+ prepaidOnly)
│   ├── categories.ts                ← ৮টা category config ⇄ SWAP HERE
│   ├── productDetails.ts            ← ★ PDP config ⇄ SWAP HERE
│   ├── promo.ts                     ← ★ PROMO + COUPONS (Marketing) ⇄ SWAP HERE
│   ├── delivery.ts                  ← ★ METHODS · SLOTS + capacity · cutoff (Operations) ⇄ SWAP HERE
│   ├── payment.ts                   ← ★ SSLCommerz + COD rule (Finance) ⇄ SWAP HERE
│   ├── countries.ts                 ← ★ dial code — প্রবাসী customer-এর ফোন
│   ├── cart.ts                      ← ★ resolveCart() — pure, দাম এখানে হিসাব হয়
│   └── order.ts                     ← ★ checkoutTotals() · buildOrder() · etaText()
├── _store\
│   ├── useZoneStore.ts              ← zone: "dhaka" | "bangladesh" | null
│   ├── useCartStore.ts              ← ★ items + couponCode, persist ("radian-cart")
│   ├── useCheckoutStore.ts          ← ★ form state, persist ("radian-checkout")
│   ├── useOrderStore.ts             ← ★ শেষ order, persist ("radian-last-order")
│   └── useGiftFinderStore.ts
├── categories\[slug]\page.tsx
├── products\[slug]\page.tsx         ← ★ PDP route (server component)
├── cart\page.tsx                    ← ★ Cart route (server shell + GBE)
├── checkout\page.tsx                ← ★ Checkout route (server shell + GBE)
├── order-success\page.tsx           ← ★ Order Success route
├── globals.css                      ← @theme token + PDP shine/glow keyframe
└── layout.tsx                       ← Header + children + Footer + SupportPanel
```

**দাম কে হিসাব করে (একটাই শিকল):**
`useCartStore` (config) → `resolveCart()` (catalog দাম) → `checkoutTotals()`
(coupon + delivery) → summary · sticky bar · Place Order — **সবাই একই function**।
কোনো component নিজে যোগ করে না।

---

## ৪. Design Tokens (`globals.css` → `@theme`)

```
--color-purple: #470066          --color-orchid: #cf43ea
--color-purple-deep: #320049     --color-orchid-soft: #f9e9fd
--color-ink: #2e0442             --color-orchid-mid: #e9a8f5
--color-lavender: #f7f1fb        --color-lavender-deep: #efe4f7
--color-rosegold: #b76e79        --color-rosegold-light: #e8c9ce
--color-body: #3a2547            --color-body-soft: #7a6689
--radius-lg:28px  --radius-md:18px  --radius-sm:12px
--shadow-soft  --shadow-lift
```

**PDP-তে যোগ হওয়া রঙ (Tailwind arbitrary):** সবুজ `#0E7A3D`/`#E8F9EE`/`#C4EED4` (fresh, guarantee) · অ্যাম্বার `#8A5A00`/`#FFF7E8`/`#F2D9A8` (urgency, out-of-zone) · নীল `#3A4B8A`/`#EEF1FB` (artificial) · কমলা `#E39400` (% off)

**PDP page background:** `#F6F4FA`, content সাদা rounded card-এ (FlowerAura pattern — content zone আর খালি জায়গা আলাদা দেখায়)।

---

## ৫. Zone System — সবচেয়ে গুরুত্বপূর্ণ business rule

```ts
type Zone = "dhaka" | "bangladesh" | null   // null = এখনো select করেনি
```

| | Inside Dhaka | All Bangladesh |
|---|---|---|
| Delivery | 2-hour · same day · midnight | courier 1–3 days |
| Product | সব | শুধু `zone: "both"` (courier-safe) |
| Nav-এ লুকায় | — | **Cakes, Balloons** |

`zoneFilter(product, zone)` — **প্রতিটা product list-এ লাগাতে হবে।**

**PDP-তে zone:** Dhaka-only product + All Bangladesh zone = **Out-of-zone panel** (Add to Cart লুকায়, "Switch to Dhaka" + nationwide বিকল্পের rail)। Cart-এও এই rule লাগবে — zone বদলালে cart-এ থাকা Dhaka-only item কী হবে? **→ Open Question #5**

---

## ৬. Product Data Model (`_data/products.ts`)

```ts
interface Product {
  slug, name, pricePaisa, cat, sub?, zone: "dhaka"|"both",
  badge, stars, meta, bg, best?, exp?, sd?, mn?, neu?, occ?[], rec?[]
}
```

---

## ৭. PDP — কীভাবে কাজ করে

### ★ তিন স্তরের Variant Model (locked)

PDP-তে তিনটা আলাদা প্রশ্ন, তিনটা আলাদা UI:

| স্তর | কী বদলায় | UI | কেন |
|---|---|---|---|
| **Variant** | পুরো product | colour = গোল swatch · flavour = ছবির pill | নিজস্ব **ছবি + stock + SEO page**। Click = sibling PDP |
| **Size** | শুধু দাম | ছোট pill row | ছবি বদলায় না, card লাগে না |
| **Bundle** | নতুন product যোগ হয় | Photo card | নতুন জিনিস দেখাতে হয় |

**দাম = size.price + bundle.addPaisa + Σ add-on** — সব integer paisa।

**Colour আর Flavour একই জিনিস** — `VARIANT_GROUPS` এ `kind: "colour" | "flavour"`। এক table, এক admin screen।

### Locked section order (PDP)

```
breadcrumb → [gallery(sticky, thumb বাঁয়ে) | buy panel] → Before You Order (spec table
+ craft strip + FAQ) → Related rail → [GBE: Reviews → VisitStore → Footer]
```

**Buy panel-এর ভেতরের order:**
```
chips → title → rating(4.9/5) → price(% off + টাকা save) → ─── →
variant → size → bundle → OFFERS dropdown → add-on tabs →
personalisation → COUNTDOWN → CTA(Buy Now primary) → WhatsApp custom band
```

### নতুন product যোগ করতে

`_data/products.ts`-এ একটা entry — **শূন্য নতুন component**। Category template থেকে spec/FAQ/craft/trust/size/bundle সব পেয়ে যাবে। Flagship-এর custom copy লাগলে `DETAIL_OVERRIDES[slug]`।

### ⇄ SWAP HERE

`getProductDetail(slug)` — Ecommerce module lock হলে ভেতরটা `fetch()` হবে, component-এ একটা লাইনও বদলাবে না।

**📄 `PDP_DATA_CONTRACT.md` পড়ো** — frontend যা যা field চায়, প্রস্তাবিত Prisma schema, আর schema lock করার আগে যে ৭টা business সিদ্ধান্ত বাকি।

---

## ৮. Cart — কীভাবে কাজ করে

### ★ Store-এ দাম নেই (locked)

`useCartStore` শুধু **config** রাখে:

```ts
CartItem { lineId, slug, sizeId, bundleId, addonKeys[], persoText?, persoImage?, qty, addedAt }
```

**`variantSlug` নেই** — D16 অনুযায়ী variant = আলাদা product, তাই `slug`-ই variant।

**দাম কেন store করা হয় না:** admin কাল দাম বদলালে cart-এ পুরনো দাম বসে থাকবে,
checkout-এ হঠাৎ অন্য সংখ্যা। তাই `_data/cart.ts` → `resolveCart(items, zone)`
প্রতি render-এ catalog থেকে দাম জোড়া লাগায়।

**lineId** = `slug | sizeId | bundleId | sorted(addons) | persoText | persoImage`
একই key = `qty++`। আলাদা perso text = **আলাদা line** (দুই mug-এ দুই নাম merge হলে
একজনের উপহারে আরেকজনের নাম যাবে)।

### resolveCart() যা ফেরত দেয়

```ts
{ lines[], held[], missing[], totals, promo, isEmpty }
```
- `held` — zone conflict। cart-এ আছে, subtotal-এ নেই
- `missing` — slug আর catalog-এ নেই। **চুপচাপ মুছি না**, "no longer available" দেখাই

### Cart-এ যা edit করা যায় (locked)

qty · remove line · **remove add-on** · **size upgrade nudge** · cross-sell add।
Size/bundle/variant পুরো বদলাতে হলে **"Edit" → PDP**। কারণ cart-এ পুরো configurator
বসালে PDP-র নকল হয়, আর cart হালকা রাখার নিয়ম ভাঙে।

### Cart-এ যা **নেই** (locked)

❌ WhatsApp-order button · ❌ delivery slot (D13) · ❌ gift message (D14) · ❌ "Need Help" (D19)

### ⇄ SWAP HERE

`_data/promo.ts` — `FREE_DELIVERY_PROMO` · `COUPONS` · `DELIVERY_FROM_PAISA`
Marketing/Operations module lock হলে ভেতরটা `fetch()`।
**⚠️ threshold-এর সংখ্যা component-এ কখনো লিখো না** — PDP-র OFFERS-ও এখান থেকেই
পড়ে, নইলে দুই page দুই সংখ্যা দেখাবে (board-এ ঠিক এটাই হয়েছিল: PDP ৳3,000, cart ৳8,000)।

---

## ৯. Gift Finder — filter engine

Filter toolbar **ইচ্ছে করে বাদ**। Gift Finder-ই filter, dropdown-এর বদলে মানুষের ভাষায়।
CTA → modal · ৩ ধাপ (কার জন্য → কী উপলক্ষ → বাজেট) · ৩ ধাপে fallback (exact → relaxed → **sitewide**)।

---

## ৯. Locked Decisions

| # | সিদ্ধান্ত | যুক্তি |
|---|---|---|
| **D1** | Category = **এক dynamic template**, config-driven | নতুন category = ২০ লাইন config |
| **D2** | Section **order code-এ fixed**, admin শুধু on/off + content | অগণিত combination = QA অসম্ভব; খারাপ order = conversion শেষ |
| **D3** | Config আপাতত **static TS file**, DB নয় | Ecommerce module locked নয় |
| **D4** | Filter toolbar **বাদ**, Gift Finder-ই filter | Differentiator |
| **D5** | Gift Finder = **modal** | Page ছাড়লে drop-off |
| **D6** | Gift Finder-এ **sitewide fallback** | খালি page = হারানো বিক্রি |
| **D7** | All Products grid = **৮টা** + Load More | ৩ লাইন ভারী |
| **D8** | Delivery band-এ **কোনো product নেই** | Clean |
| **D9** | FAQ **Reviews-এর আগে** | browse → decide → doubt clear → trust |
| **D10** | Nav-এ Flowers/Plants/Combos **লুকাই না** All Bangladesh-এ | ওদের courier-safe product আছে |
| **D11** | "How To Choose" section **বাদ** | Page ভারী করছিল |
| **D12** | PDP = **Category template + per-product override** | ৭১টা product-ই সাথে সাথে কাজ করে, শূন্য 404 |
| **D13** | **Delivery slot PDP-তে নয়, Checkout-এ** | Slot order-এর property, item-এর নয়। Cart-এ ২টা item = ২টা slot conflict; আবার checkout-এ জিজ্ঞেস = double entry |
| **D14** | **Gift message + anonymous gift → Checkout** | Order-level, item-level নয় |
| **D15** | Variant = **তিন স্তর** (variant / size / bundle), সব card করা হয়নি | ৩ colour × ৩ size × ৩ bundle = ২৭ card = page অচল |
| **D16** | Colour আর Flavour = **একই মেকানিজম**, আলাদা product | নিজস্ব ছবি + stock। সাদা শেষ হলে লাল বিক্রি থামা উচিত নয় |
| **D17** | PDP-তে **Buy Now = primary**, Add to Cart = secondary | Buy Now বেশি রাজস্ব আনে |
| **D18** | Specification **আলাদা section নয়**, "Before You Order" dropdown-এর ভেতরে | Page হালকা থাকে, যে জানতে চায় সে খোলে |
| **D19** | **"Need Help" section চিরতরে বাদ** — SupportPanel-ই একমাত্র support channel | Constitution |
| **D20** | **Cart-এ দাম store হয় না** — শুধু config, দাম `resolveCart()` হিসাব করে | দাম বদলালে cart stale হয়ে checkout-এ অন্য সংখ্যা দেখাত |
| **D21** | **Zone conflict-এ Checkout BLOCK করা হয় না** — held item "Saved for later"-এ নামে, subtotal থেকে বাদ, কিন্তু deliverable item নিয়ে order চলে | Cart page-এর একমাত্র কাজ checkout-এ পাঠানো। ৩টার ১টা Dhaka-only হলে বাকি ২টার বিক্রিও হারানো বোকামি। কিছু auto-delete হয় না |
| **D22** | **Cart-এ পুরো configurator নেই** — qty/remove/add-on/size-upgrade ছাড়া বাকি edit → PDP | নইলে PDP-র নকল, cart ভারী |
| **D23** | **Promo/coupon সংখ্যা একটাই জায়গায়** (`_data/promo.ts`), PDP + Cart দুটোই সেখান থেকে পড়ে | Board-এ PDP বলত ৳3,000, cart বলত ৳8,000 — একই offer দুই সংখ্যা = trust শেষ |
| **D24** | **Delivery config আলাদা ফাইল** (`_data/delivery.ts`), promo-র সাথে মেশানো নয়। Cart-এর "From ৳60" METHODS থেকে **derive** হয় | Delivery = Operations, promo = Marketing। Board-এ fee HTML-এ hardcoded ছিল — D23-এর ভুলের পুনরাবৃত্তি হতো |
| **D25** | **Free-midnight promo = Midnight method-এর fee + surcharge দুটোই মাফ** (৳60+৳200 → FREE)। অন্য method-এ কিছু মাফ নয় | Offer-এর কথাই "free **midnight** delivery"। সব method free করলে ৳3,000-এর অর্ডারে Express-এর ৳150 margin চুপচাপ চলে যেত |
| **D26** | **COD: gift order-এ কখনো নয়** · **`prepaidOnly` product থাকলে নয়** (self হোক বা gift) · self order-এ চলে। Card **লুকাই না**, ধূসর করে কারণ লিখি | Gift-এ COD মানে রাইডার সারপ্রাইজের দরজায় প্রাপকের কাছে বিল চাইবে। Made-to-order জিনিস বাতিল হলে ক্ষতি পুরোটা দোকানের |
| **D27** | **Address = একটাই free-text ঘর** — কোনো district/thana/area dropdown নেই। শুধু zone (Inside Dhaka / All Bangladesh) ঠিকানার **আগে** | প্রতিটা dropdown = extra decision + সময়। Bangladesh-এ মানুষ ঠিকানা এক টানে লেখে। Order ratio-ই আসল |
| **D28** | **Coupon-এর CODE cart store-এ persist হয়, discount নয়** | D20-এর একই যুক্তি — সংখ্যা কখনো store নয়। কোড থাকায় cart → checkout-এ আবার লিখতে হয় না |
| **D29** | **Order = snapshot (দাম store হয়)**, cart = config (দাম হয় না) | Order হলো চুক্তি — যে দামে কিনেছে সেই দামই রসিদে চিরকাল। কাল দাম বাড়লে পুরনো রসিদ বদলে যাওয়া = জালিয়াতি |
| **D30** | **Order Success আলাদা route** (`/order-success`), board-এর inline success নয় | Refresh দিলে খালি checkout ফিরে আসত, আর order-এর নিজের URL থাকত না (Track Order-এর সাথে মিলত না) |
| **D31** | **Tracker 7-stage** — দুটো photo আলাদা ধাপ। `photoUpdates` off করলে ৫ ধাপ | প্রতিটা ছবি customer-এর কাছে আলাদা মুহূর্ত (আলাদা notification)। Toggle off করে রাখলে যে ছবি আসবেই না, সেটা tracker-এ দেখানো মিথ্যা প্রতিশ্রুতি |
| **D32** | **Checkout ৫ step** — Where আর When **আলাদা** | ঠিকানা লেখা আর সময় বাছা দুটো আলাদা মাথার কাজ। একসাথে রাখলে card লম্বা, আর মানুষ slot না বেছেই নিচে নেমে যায় |
| **D33** | **Delivery method চারটা** (Dhaka): 2-Hour Express (১০টা–৫টা order window) · Same Day (slot) · Midnight (আজকের জন্য সন্ধ্যা ৬টা পর্যন্ত) · Schedule It (date + slot)। All Bangladesh = Courier | Delivery-ই Radian-এর প্রধান বিক্রির কারণ — সেটা একটা dropdown-এ লুকিয়ে রাখা যায় না |
| **D34** | **Slot = capacity-driven** — slot শুরুর **আগ পর্যন্ত** order নেওয়া যায় (lead time নেই)। বন্ধ হয় শুধু (১) সময় পেরোলে (২) capacity ভরলে। Capacity admin panel-এ | Studio-র আসল সীমা slot-এর ক্ষমতা, ঘড়ি নয়। ভরা slot-এ "Fully booked" লেখা সত্যি urgency — বানানো "3 left" নয় |
| **D35** | **Payment = SSLCommerz** — checkout-এ শুধু "Online Payment" + "COD"। bKash/Nagad/Card-এর আলাদা card নেই | Wallet বাছাই SSLCommerz-এর page-এই হয়। এখানে দেখালে একই সিদ্ধান্ত দুবার, আর gateway নতুন wallet যোগ করলে আমাদের UI মিথ্যা বলবে |
| **D36** | **Sender-এর ফোনে country code বাধ্যতামূলক + WhatsApp হতেই হবে**। Receiver-এর ফোনে country code নেই (BD-only), WhatsApp বাধ্যতামূলকও নয় | প্রবাসী customer ঢাকায় উপহার পাঠান — তাঁর নম্বর +880 নয়। সব update (confirmation → prep photo → delivery photo) WhatsApp-এ যায়। প্রাপককে রাইডার ফোন করে |
| **D37** | **Zone conflict-এ checkout /cart-এ redirect করে না** — এই page-এই বলে, ফেরার button দেয় | আগে All Bangladesh বাছলে Dhaka-only cart খালি হয়ে checkout ছুঁড়ে ফেলত — customer বুঝতই না কী হলো |
| **D38** | **Delivery timeline checkout-এ নেই** — শুধু `/order-success`-এ | যে জিনিস এখনো ঘটেনি তার timeline দেখানো = ফাঁকা প্রতিশ্রুতি। Order confirm হলেই সেটা সত্যি হয় |
| **D39** | **Promo code Order Summary-তে, total-এর ঠিক উপরে** — Payment step-এ নয় | ছাড় যেখানে সংখ্যায় দেখা যায়, কোডও সেখানেই বসা উচিত |
| **D40** | **StepBar sticky** — scroll করলেও উপরে আটকে থাকে | Checkout লম্বা। নিচে নেমে "কোন ধাপে আছি, আর কয়টা বাকি" ভুলে যাওয়াই সবচেয়ে বড় drop-off |
| **D41** | **"Review order" → One Last Look card** — পাঁচ step বন্ধ হয়ে সব তথ্য এক পাতায়, প্রতিটা block-এ Edit (সেই card-এ scroll করে ফেরত) | শেষ মুহূর্তে ভুল ঠিকানা/নাম ধরা পড়লে পুরো form আবার হাঁটতে হয় না। Gift message-টাও মানুষ এখানেই শেষবার পড়ে |
| **D42** | **Sub-category = lean page** — শুধু `productGrid` (+ GBE)। banner/breadcrumb/সব discovery rail (sibling, occasion, colour, budget, bestseller, combo, cross-sell, gift finder, faq) **OFF** | Rose-এ click করে মানুষ rose product দেখতে চায়, parent-এর নকল আরেকটা browse page নয়। Grid-এর নিজের header ("All Roses" + count) title-এর কাজ করে |
| **D43** | **Occasion = cross-category, `occ` tag filter** (cat নয়)। শুধু data-ওয়ালা ৮টা occasion। slug≠tag mismatch **alias map**-এ resolve হয় (love-romance→love, get-well-soon→get-well), তাই পুরনো link কখনো 404 নয়। কোনো product নেই এমন occasion (mothers-day) page পায় না | এক config = এক canonical occasion; alias দিয়ে homepage/category-র বিক্ষিপ্ত slug বাঁচে। খালি occasion page = মিথ্যা প্রতিশ্রুতি |

---

## ১০. ⚠️ Open Questions — সিদ্ধান্ত বাকি

1. **Per-variant stock** — লাল আছে, সাদা নেই — দোকান কি এভাবে গোনে? (variant model এর উপর দাঁড়িয়ে)
2. **Per-size SKU + stock** — "24 stems শেষ, 12 আছে" — track হবে?
3. **Bundle-এর দাম** — component-এর যোগফল, নাকি আলাদা discounted price?
4. **Offer engine** — bKash cashback, NEW15, free-midnight threshold → **Marketing module**, locked নয়। এখন `_data/promo.ts`-এ static, **সংখ্যা admin generate করবে** (সোবুজ, 14 July)।
5. ~~**Cart-এ zone বদলালে কী হবে?**~~ — **RESOLVED → D21**
6. **was-price (কাটা দাম)** — এখন `price ÷ 0.81`, display-only। আসল MRP field লাগবে?
7. **Review rating** — সব product-এ hardcoded 4.9/412। Per-product review table?
8. **Ecommerce module lock** — কবে? (D3 + PDP_DATA_CONTRACT-এর debt শোধ করতে লাগবে)
9. Valentine's / Corporate / Same Day — page বানাবে, নাকি বাদই থাক?
10. ~~**Slot capacity**~~ — **RESOLVED → D34**। Capacity admin panel-এ, `booked` এখন mock।
11. ~~**Express cut-off**~~ — **RESOLVED → D33** (১০টা–৫টা)। Midnight cut-off সন্ধ্যা ৬টা।
12. **Midnight + COD একসাথে** — এখন self order-এ allowed (D26)। রাত ১২টায় রাইডারের
    হাতে ক্যাশ — Operations ঝুঁকি মানছে তো?
13. ~~**Payment gateway**~~ — **RESOLVED → D35** (SSLCommerz)। Integration বাকি।
14. **Slot capacity কি per-zone / per-method?** এখন একটাই global list। "Same Day"-এর
    3 PM slot আর "Schedule It"-এর 3 PM slot **একই capacity ভাগ করে** — ঠিক আছে তো?

---

## ১১. Pending Retro-Fixes (Board vs Code)

- [x] ~~Checkout-এ Anonymous Gift + Preparation/Delivery Photos toggle~~ — done (Q2-তে)
- [x] ~~Checkout-এ gift message + delivery slot picker (D13, D14)~~ — done
- [x] ~~Order tracker 5-stage → 7-stage~~ — done (`DeliveryTimeline.tsx`, D31)
- [x] ~~Order Success থেকে set-password CTA সরাও~~ — done (CTA বসানোই হয়নি)
- [x] ~~Checkout board-এর "Need Help" section~~ — board-এ ছিল, code-এ **নেই** (D19)
- [ ] **Payment gateway** — Place Order এখন সরাসরি `/order-success`-এ যায়। bKash/Nagad/Card
      lock হলে `CheckoutView.onPlaceOrder()`-এ redirect + callback বসবে
- [x] ~~**Track Order page**~~ — done। `/track`, order-success-এ "Track this order" button, header/footer link ঠিক (§১৩গ)
- [ ] **eslint: ২টা পুরনো error** — `Header.tsx:94` (zone hydration) আর `HeroSection.tsx:190`,
      দুটোই `react-hooks/set-state-in-effect`। Fix = `useSyncExternalStore`
      (`useCartStore.ts`-এ ঠিক এভাবেই করা আছে, copy করলেই হবে)
- [x] ~~Cart থেকে WhatsApp-order button সরাও~~ — done
- [x] ~~Cart line থেকে gift message সরাও (D14)~~ — done
- [x] ~~Collection page-এ full GBE~~ — done
- [x] ~~PDP~~ — done
- [x] ~~Cart~~ — done

---

## ১২. Constitution Rules (কখনো ভাঙবে না)

- **Money = integer paisa**, float নয়
- **Real photos = hard launch dependency** — এখন সব `bg` gradient
- **Floating Support Panel = একমাত্র support channel**
- **GBE order locked:** Reviews → Visit Radian Shop → Footer
- **"All Bangladesh"** — canonical term
- Phone → `+8801XXXXXXXXX` · Timestamp UTC, display Asia/Dhaka · Order `RAD-XXXXX`
- **One Data One Owner** — add-on/bundle catalog product-এর slug reference করে, duplicate করে না
- **Soft delete only** · **Audit everywhere**
- Build order: **Schema → API → Frontend** (PDP-তে উল্টো হয়েছে — `PDP_DATA_CONTRACT.md` সেই debt শোধ করে)

---

## ১৩. Checkout — কীভাবে কাজ করে

### Step order (locked — D32)

```
StepBar → Q1 Your Details (country code + WhatsApp) → Q2 Who's Receiving
(+ gift message · anonymous · photos) → Q3 Where (zone → address) → Q4 When
(method → date → slot) → Q5 Payment | sticky Order Summary (+ promo code)
→ [GBE: Reviews → VisitStore → Footer]
```

একসাথে **একটাই accordion খোলা**। "Continue"-তে validate হয় (`validateStep()`),
পাশ করলে পরেরটা খোলে। Place Order-এ ১–৪ আবার validate হয় — accordion লাফিয়ে পার
হওয়া যায় বলে। বাধ্যতামূলক ঘরে লাল `*`।

### Delivery module (D33 · D34)

| Method | Zone | Slot | Date | Fee | নিয়ম |
|---|---|---|---|---|---|
| 2-Hour Express | Dhaka | ❌ | ❌ | ৳150 | সকাল ১০টা – বিকেল ৫টার মধ্যে order |
| Same Day | Dhaka | ✅ | আজ | ৳60 | আজকের slot খোলা থাকলে |
| Midnight | Dhaka | ❌ | ✅ | ৳60 + ৳200 | আজ রাতের জন্য সন্ধ্যা ৬টা পর্যন্ত |
| Schedule It | Dhaka | ✅ | ✅ | ৳60 | যেকোনো দিন |
| Nationwide Courier | All BD | ❌ | ❌ | ৳120 | 1–3 দিন |

**Slot:** শুরুর আগ পর্যন্ত খোলা। `capacity − booked = 0` হলে "Fully booked",
৫-এর কম থাকলে "Only N left" (সত্যি সংখ্যা, বানানো urgency নয়)।
বন্ধ method **লুকাই না** — ধূসর করে কারণ লিখি।

### দাম — একটাই শিকল

`resolveCart(items, zone)` → `checkoutTotals({cart, zone, method, couponCode})`
→ summary · sticky bar · Place Order · order snapshot। **কোনো component নিজে যোগ করে না।**

- শুধু `cart.lines` order-এ যায়। `held` cart-এ থেকে যায় (D21) — Q3-এ হলুদ notice + summary-তে লাইন
- সব item held হলে **redirect নয়** — checkout-এই block card + "Deliver inside Dhaka" button (D37)
- `quoteDelivery()` fee + midnight surcharge + promo waiver (D25) হিসাব করে
- Coupon = `useCartStore.couponCode` (code persist, discount নয় — D28), UI summary-তে total-এর উপরে (D39)

### Payment (D35)

SSLCommerz — checkout-এ দুটো card: **Online Payment** (redirect হবে) আর **COD**।
COD বন্ধ হয় দুই কারণে: gift order · cart-এ `prepaidOnly` product (D26)।

### Guest checkout

Auth নেই — **phone + name-ই identity**। `useCheckoutStore` persist করে নাম/ফোন/ঠিকানা
(পরের order-এ আবার লিখতে হবে না), কিন্তু **payment persist হয় না** (গতকালের bKash intent
আজ বসে থাকা উচিত নয়)। Order হয়ে গেলে `resetAfterOrder()` — gift message + slot মুছে যায়,
ঠিকানা থাকে।

### Order

`buildOrder()` → `RAD-XXXXX` + **দামসহ snapshot** (D29) → `useOrderStore` →
`/order-success`। Payment gateway এখনো নেই — Place Order সরাসরি success-এ যায়।

### Board থেকে যা ইচ্ছাকৃতভাবে বাদ

❌ "Need Help Choosing" section (D19) · ❌ district/thana dropdown (D27) ·
❌ inline success state (D30) · ❌ set-password CTA (§11) · ❌ slot-এ "3 left"
capacity badge — Operations-এ slot capacity data নেই, মিথ্যা urgency দেখাব না

---

## ১৩খ. Sub-category + Occasions — কীভাবে কাজ করে

সবটাই `_data/categories.ts`-এ, **শূন্য নতুন component** — category template-এর উপরই দাঁড়ানো।

**Sub-category** (`/categories/[slug]/[sub]`, ৪৪টা):
- `subCategoryConfig(parent, subKey, label)` — parent config থেকে **auto-derive**।
  Sub-তালিকা parent-এর `subCategories` tile থেকেই আসে (নতুন data লাগে না)।
- `categoryProducts()` আগে থেকেই `config.sub` দিয়ে filter করত — শুধু ওটাই কাজে লাগে।
- **Lean (D42):** `makeSections`-এ শুধু `productGrid` on, বাকি সব `false`। banner-ও off।

**Occasions** (`/occasions/[slug]`, ৮টা):
- `OCCASION_DEFS` array (birthday…just-because) + `occasionConfig(def)`।
- `categoryProducts()`-এ নতুন branch: `config.occ` থাকলে সব category জুড়ে `p.occ` filter (D43)।
- `OCCASION_ALIASES` — পুরনো slug → canonical (love-romance→love ইত্যাদি)।
- Section: banner + "Shop by category" rail + bestsellers + other-occasions + budget + grid + delivery + gift finder + faq। attribute/colour/combo/crossSell **OFF** (cross-category-তে অর্থহীন)।

**Getter (⇄ SWAP HERE):** `getSubCategoryConfig(slug, sub)` · `getOccasionConfig(slug)`
· static params: `SUBCATEGORY_PARAMS` · `OCCASION_PARAMS`। Ecommerce lock হলে ভেতরটা `fetch()`।

## ১৩গ. Track Order + Occasions index — কীভাবে কাজ করে

দুটোই এই session-এ DONE, দুই loose end বন্ধ।

**Track Order** (`/track`):
- `_components/Checkout/TrackOrderView.tsx` (client) — track number input, `?id=` থাকলে
  prefill+auto-submit। **শুধু delivery timeline** দেখায় — receipt/দাম/order-content নয়
  (locked, সোবুজ: track number receiver-এর হাতেও থাকতে পারে, surprise/দাম ফাঁস করা যাবে না)।
- `DeliveryTimeline` reuse (D31), নতুন tracker নয়। Stage: online-paid→2 (placed+confirmed),
  COD→1 (payment verify হয়নি বলে সৎ)।
- **Lookup:** backend নেই, তাই শুধু `useOrderStore.last` (শেষ order) মেলে। অন্য RAD-XXXXX
  দিলে সৎ "খুঁজে পাইনি" state — নকল order-list বানাই না (Constitution: no false promise)।
  ⇄ SWAP HERE — Ecommerce lock হলে `matchLastOrder` → `GET /orders/:id`।
- `app/track/page.tsx` — server shell + `Suspense` (useSearchParams-এর জন্য) + GBE, noindex।
- order-success-এ "Track this order" (`/track?id=…`) primary button; header icon + footer
  link এখন `/track` (আগে `/track-order` → 404)।

**Occasions index** (`/occasions`):
- `app/occasions/page.tsx` — server, arch-card grid (৮টা occasion + product count) + GBE।
- data `OCCASION_LIST` (`_data/categories.ts`, ⇄ SWAP HERE) — `OCCASION_DEFS` থেকে derive।
- Homepage `OccasionSection.tsx`-এর mothers-day card `/occasions`-এ repoint (def/tag নেই)।

## ১৩ঘ. পরের কাজ

বাকি page: Auth (WhatsApp OTP) + Account · **Search** · Wishlist · Policy pages
· Payment gateway (SSLCommerz integration)। §২-এর তালিকা দেখো।

**সুপারিশ: পরের page = Search।** কারণ (১) সম্পূর্ণ frontend, backend/module lock লাগে না
— শুধু `_data/products.ts` + `zoneFilter`; (২) discovery-তে high value; (৩) Gift Finder-এর
পরিপূরক (D4: filter toolbar বাদ, কিন্তু সরাসরি খোঁজা আলাদা দরকার)। Wishlist দ্বিতীয় পছন্দ
(cart-এর মতো store, self-contained)। Auth/Payment বড় — module/keys/integration লাগে।

### শুরু করার prompt (নতুন chat-এ) — Search

> Radian-এ **Search** page + header search বানাবো (`/search?q=`)।
> `D:\radian` folder access দাও। `RADIAN_FRONTEND_HANDOVER.md` পুরোটা পড়ো —
> §৫ (Zone system — `zoneFilter` প্রতিটা list-এ লাগে), §৬ (Product model), §৯ (D4:
> filter toolbar বাদ, Gift Finder-ই filter — Search সেটার সাথে কীভাবে বসবে ভাবো),
> §২ (build status)। আগে দেখো: `_data/products.ts` (৭১ product + type), `_components/
> Product/ProductCard.tsx` (**reuse করো**), `_store/useZoneStore.ts`, homepage/category-তে
> ProductCard কীভাবে grid-এ বসে। **এক template, ProductCard reuse, GBE locked
> (Reviews→VisitStore→Footer), "Need Help" কখনো নয় (D19)।**
> বাংলায় কথা বলো, ছোট ধাপ, code লেখার আগে strategy আলোচনা করো,
> প্রতিটা বড় change-এর পর `npx tsc --noEmit`।
>
> খোলা প্রশ্ন (নতুন chat-এ resolve): (১) search কি শুধু name, নাকি name+category+occ+
> tag? (২) খালি ফলাফলে কী — Gift Finder fallback (D6-এর মতো), নাকি "কিছু পাইনি" +
> suggestion? (৩) header search box সব page-এ, নাকি নিজস্ব `/search` page-এই?

⚠️ **Tooling note (Track Order session-এও একই সমস্যা, আরও তীব্র):** sandbox file-mount
**in-place edit করা প্রতিটা file-এর truncated/stale copy** serve করে — tsc তখন ভুতুড়ে
error দেখায় ("no closing tag", "Invalid character", অর্ধেক-কাটা file)। আসল `D:\radian`
file **সবসময় ঠিক ছিল** (host Read tool দিয়ে verify করা)। নতুন file (নতুন path-এ Write)
ঠিকই sync হয়; সমস্যা শুধু in-place edit-এ।

করণীয়:
- edit-এর পর tsc-তে ghost error এলে **host Read tool** দিয়ে আসল file যাচাই করো (tag
  balanced কিনা, শেষ লাইন ঠিক কিনা) — সেটাই ground truth।
- 🚫 **কখনো sandbox থেকে host-এ file copy/cp করো না** cache bust করার জন্য — sandbox-এর
  truncated version আসল file-টাই নষ্ট করে দেয় (এই session-এ একবার হয়েছিল, সাথে সাথে
  পুরো content আবার Write করে ঠিক করা হয়)। শুধু Read/Write/Edit host tool ব্যবহার করো।
- সত্যিকারের tsc pass দেখতে হলে dev server/docker restart করে mount fresh করাও, তারপর
  `apps/web`-এ `npx tsc --noEmit`।

---

## ১৪. Working Style

- সোবুজ **বাংলায়** কথা বলেন, ছোট ছোট ধাপে কাজ করতে পছন্দ করেন
- **Strategy → approval → implementation** — প্রতি ধাপে approval gate
- প্রতিটা বড় change-এর পর: `npx tsc --noEmit` + `npx eslint` চালাও
- **Claude কখনো শুধু সম্মতি দেবে না** — ভালো বিকল্প থাকলে যুক্তি দিয়ে বলবে
- Business rule নিজে থেকে বানাবে না — architecture project-এ resolve করাতে বলবে

---

## ১৫. Reference

| | |
|---|---|
| Design boards | ২৯টা `radian-*.html` — project files |
| PDP board (final) | `radian-product-details-v4.html` |
| Cart board | `radian-cart.html` — ⚠️ WhatsApp button · line-এর gift message · "Need Help" section board-এ আছে, **code-এ ইচ্ছাকৃতভাবে নেই** (D14, D19, §11) |
| Checkout board | `radian-checkout.html` — ⚠️ board-এর "Need Help" section · district dropdown · inline success · 4-stage tracker · hardcoded fee — **কোনোটাই code-এ নেই** (D19, D24–D31) |
| Order Success board | `radian-order-success-design.html` — ⚠️ set-password CTA board-এ আছে, code-এ নেই |
| PDP schema spec | **`PDP_DATA_CONTRACT.md`** |
| Constitution | `RadianDevelopmentConstitutionv1_0.pdf` (25 chapters) |
| Skills | `radian-business-context`, `radian-development-context`, `architecture-review`, `business-rules-writing`, `module-design-template`, `decision-log-writing` |
| Locked modules | Master Data (12/12) · Operations (4/4) · Commerce (4/8) |
| **NOT locked** | **Ecommerce**, Finance, Marketing, Referral, Corporate Orders |
