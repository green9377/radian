# Category page — audit + connection plan

**তারিখ:** 31 Jul 2026
**পদ্ধতি:** `RADIAN_STOREFRONT_AUDIT.md`-এর নিয়ম — schema + API-র সাথে মেলানো,
admin screen-এর সাথে নয়। প্রতিটা gap-এর উত্তর `HAVE` / `BUILD` / `DROP`।
**পূর্বসূরি:** Page 1 (Homepage) done · এটা Page 2।

---

## ০. যে দুটো জিনিস এই page-কে বাকি সবের থেকে আলাদা করে

**ক. `/shop/products` endpoint নেই।**
আজ পর্যন্ত `apps/web` একটাও product API থেকে পড়েনি — সব `_data/products.ts`-এর
mock array। Homepage-এ bestseller rail-ও mock। Category page মানেই product grid,
তাই এই page-এর কাজের সিংহভাগ ওই একটা endpoint। এবং এটা একবার বানালে PDP,
collection, occasion, search — চারটে page-ই এর উপর দাঁড়াবে। তাই এটা category
page-এর কাজ নয়, **storefront-এর কাজ যেটা এখানে এসে পড়েছে**।

**খ. Homepage audit-এর flag করা bug এই page-এরই।**
`/categories/[slug]` render হয় `CATEGORY_SLUGS` থেকে — `_data/categories.ts`-এ
hard-coded ৮টা slug। Admin-এ নতুন category বানালে homepage rail-এ দেখায়,
click করলে **404**। ইচ্ছে করে patch করা হয়নি: generic fallback page বানালে
সেটা mock array থেকে product টেনে সত্যিকারের category-তে বানানো product
দেখাত। 404 দৃশ্যমান ব্যর্থতা; ওটা হত অদৃশ্য মিথ্যা।

---

## ১. ১৪টা section — section by section

| # | Section | উত্তর | বিস্তারিত |
|---|---|---|---|
| 1 | Banner (h1, lead, count) | ✅ HAVE | `Category` — `name` `description` `summary` `bannerUrl` `metaTitle` `metaDescription`। "১২০+ arrangements" গোনা হবে, রাখা হবে না |
| 2 | Sub-category rail | ✅ HAVE | `Category.children` — `/shop/categories`-এ already যাচ্ছে |
| 3 | Bestsellers rail | ✅ data · 🔨 API | `Product.isBestSeller` + `categoryId` + `zone` |
| 4 | Attribute grid (Shop by style) | 🔨 BUILD | `TagGroup`/`Tag` আছে; **কোন category-তে কোন tile** সেই mapping নেই |
| 5 | Occasion grid | 🔨 BUILD | Tag-এ `imageUrl` `summary` আছে — একই mapping gap |
| 6 | Ready today rail | ✅ HAVE | `supportsExpress` `supportsSameDay` `supportsMidnight` |
| 7 | Colour grid | ⛔ BLOCKED | নিচে §২ |
| 8 | Budget rail | ✅ HAVE | `Collection` (PRICE_RANGE) — category-scoped link লাগবে |
| 9 | Full product grid | 🔨 BUILD | pagination + sort + filter |
| 10 | Combo rail | 🔨 BUILD | §১-এর একই tile mapping দিয়েই চলবে |
| 11 | Delivery band | ✅ HAVE | `DeliveryMethod` — `label` `cutoffTime` `etaLabel` `feePaisa` `zone` |
| 12 | Cross-sell rail | ✅ HAVE | `Category` |
| 13 | Gift finder | ✅ HAVE | নিজের table লাগে না — #4/#7-এর উপর filter |
| 14 | FAQ | 🔨 BUILD | `ProductFaq` আছে, category FAQ নেই |

---

## ২. ⛔ Blocker — Colour master-এর সাথে Product-এর সংযোগ নেই

**মালিকের সিদ্ধান্ত (31 Jul):** colour আসবে Product module-এর Variant & Option
sub-module থেকে। সঠিক সিদ্ধান্ত — নতুন colour master বানালে দুই জায়গায় দুই রঙের
তালিকা থাকত (One Data One Owner ভাঙত)।

**কিন্তু আজকের schema-তে সেটা সম্ভব নয়:**

```prisma
model VariantAttribute { name "Colour"  displayMode SWATCH  values VariantValue[] }
model VariantValue     { attributeId  label "Red"  swatch "#c0392b" }

model Product {
  variantLabel   String?   // "Red"        ← শুধু string
  variantSwatch  String?   // "#c0392b"    ← শুধু string
  // variantValueId FK নেই
}
```

দুটো সমস্যা, দুটোই colour grid-কে অসম্ভব করে দেয়:

1. **Filter করা যায় না।** Product-এ "Red" একটা free text। `"Red"` আর `"red "`
   দুটো আলাদা রঙ হয়ে বসে থাকবে, আর master-এ Red-এর নাম বদলালে product-গুলো
   পুরনো নামেই থেকে যাবে।
2. **Sibling ছাড়া product-এর রঙ বসানোর জায়গা নেই।** `variantLabel` variant
   group-এর জন্য লেখা। যে গোলাপের কোনো colour sibling নেই, সে "Red" ঘরে কখনো
   আসবে না — অথচ সে লালই।

**প্রস্তাব:** `Product.variantValueId` → `VariantValue` FK, variant group থাকুক
বা না থাকুক। `variantLabel`/`variantSwatch` তখন FK থেকে আসবে; দুটো column
deprecated হয়ে পরে বাদ যাবে (`sku` → `Item.sku`-র মতো একই ধারা)।

⚠️ এটা Product module-এর schema change। মালিকের অনুমোদন ছাড়া করা হবে না —
architecture project-এ ঠিক হয়ে development context skill আপডেট হওয়ার কথা।

### §২ক · মালিকের সিদ্ধান্ত, 31 Jul — colour-এর পূর্ণ নিয়ম

**রঙ তৈরি হয় শুধু Variant & Option-এ।** Product form-এ হাতে রঙ লেখার ঘর
থাকবে না — শুধু বাছাই। দরকার হলে ওখান থেকে variant master-এ গিয়ে নতুন রঙ
বানিয়ে ফেরত আসা যাবে। (এটাই FK-র আচরণ, মালিকের নিজের ভাষায় বলা।)

**রঙ ঐচ্ছিক।** চকলেটে রঙ না বসালে সে কোনো রঙের ঘরেই গোনা হবে না।

**এক product = ঠিক এক রঙ।** একাধিক রঙের product-কে **Mixed** বসানো হবে —
Mixed নিজেই colour master-এর একটা value (multi-colour swatch সহ), হাতে বাছাই।
তাই single FK-ই যথেষ্ট, join table লাগছে না।

⚠️ **এর ফল, মালিককে জানানো হয়েছে এবং তিনি এটাই চেয়েছেন:** লাল-সাদা তোড়া
Red-এ click করলে **আসবে না**, শুধু Mixed-এ থাকবে। "Red মানে ঠিক Red" —
তাঁর ভাষায়। পরে "আমার লাল তোড়াটা Red-এ নেই কেন" প্রশ্ন উঠলে এটাই উত্তর,
bug নয়।

**Filter সবসময় category-scoped।** Rose-এ Red, balloon-এ Red, chocolate-এ
Red — তিনটে আলাদা। Fresh Flowers page-এ Red = শুধু লাল ফুল। Link বহন করবে
`category + colour`, শুধু colour নয়।

**Parent page-এ child roll up।** Fresh Flowers খুললে rose · lily · gerbera
সব একসাথে, তার উপর রঙের filter। Product count যেভাবে parent-এ ওঠে (30 Jul,
groupBy), রঙও সেভাবেই।

**রঙের ঘর AUTO** (D-CAT-02-এর অধীনেই)। Category-র নিজের product-গুলোতে যে
রঙ আছে সেগুলোই ঘর — chocolate-এ লাল কিছু না থাকলে সেখানে Red-এর ঘর নেই।
কোনো তালিকা কাউকে রাখতে হয় না।

---

## ৩. Locked সিদ্ধান্ত — 31 Jul, মালিক

**D-CAT-01 · Colour → Variant & Option master।** নতুন colour table নেই।
§২-এর FK-টা এর পূর্বশর্ত।

**D-CAT-02 · Tile নির্বাচনে দুই mode।** প্রতিটা tile section (attribute,
occasion, combo, cross-sell) `AUTO` অথবা `MANUAL`:

| Mode | কী হয় |
|---|---|
| `AUTO` | এই category-র product-গুলোতে যে tag আছে, সেগুলোই tile — product গোনা অনুযায়ী সাজানো। কেউ কিছু না করলেও page ভরা থাকে |
| `MANUAL` | মালিকের বাছাই করা list, নিজের order-এ |

`Collection`-এর `PRICE_RANGE` / `MANUAL`-এর হুবহু একই প্যাটার্ন — নতুন ধারণা
শেখার দরকার নেই। **Default `AUTO`**, কারণ নতুন category বানানোর দিনই যেন
page খালি না দেখায়।

**D-CAT-06 · তিন সারিতেও দুই mode** (2 Aug) — Shop by type · Most ordered ·
Ready to send now। বিস্তারিত §১০ট।

**D-CAT-03 · Category-wise FAQ।** প্রতি category-র নিজের FAQ, নিজের admin
screen। Global FAQ-তে tag করা নয়।

**D-CAT-04 · Section-এর order code-এ locked থাকবে।** এটা নতুন কিছু নয় —
`_data/categories.ts`-এর D2 আর PDP contract-এর একই নিয়ম। Admin section
**on/off** আর **লেখা** বদলাবে, **ক্রম নয়**।

**D-CAT-05 · Server rendering এই page-এই ধরা হবে** (আমার সিদ্ধান্ত, মালিক
"তোমার যা ভালো মনে হয়" বলেছেন)। কারণ:

- মানুষ Google-এ "ঢাকায় ফুল ডেলিভারি" লেখে — homepage নয়, **category page**-ই
  সেই ফলাফল। এই page client-side render হলে Google খালি HTML পায়।
- এই page-এ ৭০+ product-এর দাম-ছবি; slow phone-এ browser থেকে fetch = সাদা
  পর্দা।
- একই zone-cookie প্যাটার্ন PDP, collection, occasion — চারটে page reuse করবে।
  পরে করলে চারটেই আবার খুলতে হবে।

Homepage `"use client"` (zone store) থেকেই এই সমস্যা। Category page-এর zone
cookie-তে যাবে, page server component হবে, শুধু interactive অংশ (gift finder
modal, carousel) client থাকবে।

---

## ৪. নতুন যা লাগবে — database

```prisma
model CategoryFaq {          // D-CAT-03
  id String @id @default(cuid())
  categoryId String
  category   Category @relation(...)
  question   String
  answer     String @db.Text
  sortOrder  Int     @default(0)
  isActive   Boolean @default(true)
  // createdAt / updatedAt / deletedAt — বাধ্যতামূলক
}

model Product {
  variantValueId String?      // D-CAT-01 · §২ — মালিকের অনুমোদন সাপেক্ষে
}
```

**Tile mapping (D-CAT-02) নতুন table ছাড়াই।** `PageSection` already আছে
(`@@unique([page, key])`, `config Json`, `isActive`, `sortOrder`, `zone`)।
Category page হবে `page = "category.fresh-flowers"`। `config`-এ
`{ mode: "AUTO" | "MANUAL", tagGroupId, tagIds[] }`। Heading তিন লাইন
`SectionText`-এ, key `category.<slot>` — per-category override হলে
`category.<slug>.<slot>`, না থাকলে global-টা।

**কেন নতুন `CategoryPageConfig` table নয়:** section on/off + order + zone +
heading — চারটেই এই দুটো table গত সপ্তাহে homepage-এর জন্য শিখেছে। তৃতীয় একটা
table মানে দুই জায়গায় দুই রকম নিয়ম, আর একটা ভুলে যাওয়ার নিশ্চয়তা।

---

## ৫. নতুন যা লাগবে — API

**`/shop/products`** — `shop.ts`-এর ভেতরে, `@Public()`, read-only।

```
GET /shop/products
  ?category=fresh-flowers      // parent দিলে child-এর product-ও আসবে
  &sub=roses
  &occasion=birthday &tag=... &colour=red
  &min=0 &max=200000           // paisa
  &speed=express|same_day|midnight
  &sort=popular|price_asc|price_desc|new
  &zone=DHAKA|NATIONWIDE
  &page=1 &limit=24
```

⚠️ **`select`-এ প্রতিটা field নাম ধরে লিখতে হবে, spread নয়।**
`costPaisa` কখনো নয় — একবার spread করলে দোকানের নিজের খরচ যে কারো network
tab-এ। `shop.ts`-এর header-এ নিয়মটা লেখা আছে।

**`/shop/categories/:slug`** — এক category-র পূর্ণ config: banner, SEO, children,
section list (PageSection + SectionText resolved), tile (AUTO হলে গোনা, MANUAL
হলে list), FAQ। এক request-এ পুরো page — dozen fetch নয়।

---

## ৬. Admin-এ যা লাগবে

1. **Category editor → নতুন FAQ tab** (D-CAT-03)
2. **Category editor → Page sections tab** — on/off, heading তিন লাইন,
   প্রতি tile section-এ AUTO/MANUAL toggle + MANUAL হলে বাছাই
3. **Variant screen** — colour value-তে product bind করার জায়গা (§২ পাশ হলে)
4. Banner image box already ঠিক shape-এ আঁকা হয়েছে — category banner-এর জন্য
   মাপ লিখে দিতে হবে

---

## ৭. কাজের ক্রম

| ধাপ | কাজ | কেন এই জায়গায় |
|---|---|---|
| 0 | §২-এর FK-তে মালিকের হ্যাঁ/না | পুরো colour section এর উপর দাঁড়িয়ে |
| 1 | `CategoryFaq` migration + `Product.variantValueId` | Schema আগে — নিয়ম |
| 2 | `/shop/products` + `/shop/categories/:slug` | সব frontend কাজের ভিত্তি |
| 3 | Admin: FAQ tab + Page sections tab | Backend ছাড়া screen বানানো যায় না |
| 4 | Route fix — slug API থেকে, 404 বন্ধ | সবচেয়ে বড় দৃশ্যমান bug |
| 5 | Server component + zone cookie | Connect করার আগে, নাহলে দুবার লিখতে হবে |
| 6 | Section connect — banner → sub-cat → rail → grid | উপর থেকে নিচে |
| 7 | Filter + sort + pagination | Grid দাঁড়ানোর পরে |
| 8 | Sub-category page (৪৪টা) | একই API, lean shape (D42/D43) |

---

## ৮. Fallback নিয়ম — একটা ব্যতিক্রম সহ

`_data/shop.ts`-এর নিয়ম: getter fail করলে `null`, caller পুরনো hard-coded
list দেখায়। Tile, heading, FAQ-তে এটাই চলবে।

⚠️ **Product-এ চলবে না।** Product fail করলে mock product দেখানো মানে
দোকানে নেই এমন জিনিস দামসহ বিক্রি করা। Product fail = সৎ empty state।
Homepage audit-এ যে যুক্তিতে generic category page বানানো হয়নি, একই যুক্তি।

---

## ৯. মালিকের উত্তর — 31 Jul, সব বন্ধ

1. **`Product.variantValueId`** — হ্যাঁ। বিস্তারিত §২ক।
2. **AUTO mode-এ tile সংখ্যা** — শীর্ষ **৮**, বাকিরা "সব দেখুন"-এর পিছনে।
3. **Product ছাড়া sub-category** — **লুকাবে**। তবে এখন development-এ demo
   item বসিয়ে সব দেখা হবে, যাতে খালি page-এ কাজ যাচাই করা না লাগে।
4. **Zone-এর বাইরের category** — page **খুলবে**, 404 নয়। উপরে সৎ message:
   ঢাকার বাইরে এই ধরনের product পাঠানো যায় না।

**আর কোনো খোলা প্রশ্ন নেই। §৭-এর ধাপ ১ থেকে শুরু করা যায়।**

---

## ১০. যা তৈরি হলো — 31 Jul 2026

### চালু করার আগে (একবার)

```
D:\radian\radian_category_migrate.bat
```

Migration + Prisma client + API restart — তিনটাই এক ক্লিকে। **এটা না চালালে API
উঠবে না**, কারণ code এমন table/column ব্যবহার করছে যা এখনো database-এ নেই।

### Database

| | |
|---|---|
| `CategoryFaq` | নতুন table — প্রতি category-র নিজের প্রশ্ন (D-CAT-03) |
| `Product.variantValueId` | FK → `VariantValue`, `ON DELETE SET NULL` (D-CAT-01) |
| `VariantValue.imageUrl` | PHOTO mode-এ ছবি রাখার জায়গা ছিল না — এখন আছে |

### API

| Endpoint | কী দেয় |
|---|---|
| `GET /shop/products` | category · sub · tag · occasion · colour · min/max · speed · sort · zone · page — সব filter সহ grid |
| `GET /shop/category/:slug` | পুরো page এক request-এ: banner, SEO, section list, সব tile, colour, FAQ, দুটো rail |
| `GET/PATCH/DELETE /page-sections/category` | কোন section on/off — default + per-category override |
| `/categories/:id/faqs` (+ PATCH/DELETE) | FAQ CRUD |

`costPaisa` কোথাও নেই — প্রতিটা field `CARD_SELECT`-এ নাম ধরে লেখা, একটাও spread নয়।

### Admin

- Category editor-এ **Questions (FAQ)** — সাথে সাথে save, উপরের Save-এর অপেক্ষা নেই
- Category editor-এ **Page sections** — ১৪টা block on/off, "just this category" badge, "Follow default"
- Product editor-এ colour এখন **id দিয়ে** বসে (আগে শুধু নাম copy হতো)

### Storefront

- `/categories/[slug]` — **server component**, zone cookie থেকে (D-CAT-05)
- **404 bug শেষ** — slug API থেকে আসে, admin-এ বানানো category এখন খোলে
- `/categories/[slug]/[sub]` — একই API, lean shape; ভুল parent দিলে 404
- Load More এখন API-র পরের page আনে, filter সহ
- `ZoneSync` — zone store → cookie → `router.refresh()`

### ⚠️ একটা বিপদ ধরা পড়েছে ও ঠিক করা হয়েছে

`setValues()` (Variant & Option-এর save) আগে পুরো value list **মুছে আবার লিখত**।
FK যোগ হওয়ার পর ওটা চললে প্রতিটা product-এর রঙ নিঃশব্দে মুছে যেত — কোনো error
ছাড়াই, শুধু colour grid খালি হয়ে যেত। এখন label মিলিয়ে update হয়, আর যে value
কোনো product ব্যবহার করছে সেটা **delete না করে বন্ধ** করা হয়।

### যা যাচাই করা হয়েছে

- `apps/web` — typecheck পরিষ্কার
- `apps/admin` — typecheck পরিষ্কার
- `apps/api` — **এখানে যাচাই করা যায়নি**। Prisma client পুরনো (নতুন table/column
  চেনে না), আর sandbox থেকে `prisma generate` চালানো যায় না। `.bat` চালালে
  generate + build হবে — কোনো ভুল থাকলে ওখানেই ধরা পড়বে।

### ১০ক · ব্যানার — মালিকের তিনটে প্রশ্ন, 31 Jul

**১. ছবি পুরো প্যানেল ঢেকে দিচ্ছিল কেন।** আমার ভুল ম্যাপিং — আপলোড করা ছবি
`bannerBg` করে দিয়েছিলাম, তাই h1/lead/delivery লাইন ছবির উপরে বসে যাচ্ছিল।
ডিজাইন সবসময় যা ছিল এখন তাই: **প্যানেল = নরম রঙ, ছবি = ডানের খিলানে**।
প্রতিটা নতুন আপলোডে লেখার পাঠযোগ্যতা বদলাবে না।

**২. Admin-এর মাপ (1600×500) পেজের সাথে মিলছিল না।** ঠিক — ওই hint লেখা
হয়েছিল যখন ব্যানার একটা চওড়া strip ছিল। খিলানটা **3:2**, তাই চওড়া strip-এর
মাঝখান কেটে যেত। Drop box এখন 3:2-তে আঁকা, hint **1200 × 800**। (30 Jul-এ
homepage card box-এ ঠিক একই ভুল ধরা পড়েছিল।)

**৩. ব্যানারের বড় লেখাটা admin-এ কোথায় ছিল — কোথাও ছিল না।**
পেজ দেখাচ্ছিল `metaTitle || name`। `metaTitle` Google-এর জন্য লেখা লাইন,
`name` সব মেনুর label। একটাও ব্যানারের বাক্য নয়। **নতুন field:
`Category.bannerHeading`** (Content সেকশনে "Banner heading")। খালি রাখলে
category-র নাম বসে, তাই কখনো ফাঁকা থাকে না।

**৪. চারটে chip (2-Hour Delivery ইত্যাদি) কোথা থেকে আসত — code থেকে।**
`CategoryBanner.tsx`-এ দুই zone-এর জন্য আটটা string হাতে লেখা ছিল। এখন
**Trust badges** থেকে আসে — homepage-এর trust strip যে সারিগুলো পড়ে, ঠিক
সেগুলোই, zone সহ। Midnight delivery বন্ধ করলে এক জায়গায় বদলালেই পুরো সাইটে
বদলাবে। কিছু সেট করা না থাকলে আগের চারটেই থাকে।

⚠️ এর জন্য নতুন migration আছে — **`radian_category_migrate.bat` আবার চালাতে
হবে** (আগেরগুলো এড়িয়ে শুধু নতুনটা প্রয়োগ করবে)।

### ১০খ · এক পেজ, এক স্ক্রিন — 31 Jul

মালিকের কথা: *"homepage একদম top to bottom section by section পরিষ্কার,
category page এলোমেলো লাগছে।"* ঠিক ছিল — switch ছিল category editor-এ,
wording তৃতীয় স্ক্রিনে, tile কোথাও না।

**নতুন স্ক্রিন: Storefront → Category pages** (`/storefront/category-page`),
হুবহু Homepage layout-এর গঠনে। উপরে category chooser: **All categories**
(সবার জন্য default) অথবা যেকোনো একটা। প্রতিটা সারিতে —

| | |
|---|---|
| নম্বর + নাম | পেজের ক্রম অনুযায়ী, ১ থেকে ১৪ |
| কোথা থেকে আসে | "Products → Best seller", "Tags → Style" — মালিকের ভাষায় |
| Wording | eyebrow · heading · subtitle, খুললেই |
| Tiles | AUTO / "I'll choose" + কোন tag group |
| On/off | locked হলে তালা, সাথে কারণ |
| just this one | override হলে badge + "Follow the default again" |

**Drag নেই** — homepage-এ আছে, এখানে নেই, আর কারণটা উপরে একবার লেখা (D-CAT-04)।

`SECTION_MANIFEST`-এ ১২টা `category.*` key যোগ হয়েছে, তাই wording-এর ঘরগুলো
boot-এ নিজে থেকেই তৈরি হয় — homepage-এর মতোই, হাতে seed করার কিছু নেই।
Category editor-এর Page sections box এখন শুধু **signpost**; এক কাজের দুটো
জায়গা রাখা হয়নি।

### ১০গ · প্রতিটা section customizable + নতুন section — 31 Jul

**প্রতিটা section-এ যা বদলানো যায়**

| | কোথায় |
|---|---|
| তিন লাইন লেখা (eyebrow · heading · subtitle) | Category pages → Wording |
| Icon (২০টা built-in) | একই জায়গায় |
| পেছনের ছবি | একই জায়গায়, upload |
| On / off | সারির ডানে |
| Tile: AUTO না MANUAL, কোন tag group | tile section-এ |

**নতুন section যোগ করা যায়** — homepage-এর হুবহু তিনটে shape:
`PRODUCT_ROW` · `COLLECTION_ROW` · `BANNER_STRIP`।

- **কোথায় বসবে** বলতে হয় ("Put it after") — কারণ ১৪টার ক্রম বদলানো যায় না
  (D-CAT-04), আর জায়গা না বললে block পেজের শেষে গিয়ে পড়ত।
- **বন্ধ অবস্থায় জন্মায়** — সাজানো শেষ না হওয়া পর্যন্ত সাইটে দেখাবে না।
- All categories-এ যোগ করলে **সব** category পেজে, একটাতে যোগ করলে **শুধু ওটায়**।
- `PRODUCT_ROW` সবসময় **ওই category-র ভেতর থেকেই** — ফুলের পেজে চকলেটের সারি
  কেউ চায়নি (Gift Finder-এর একই নিয়ম)।
- API block-টা **ভরে দিয়ে পাঠায়** (product বাছা, collection দেখা, banner-এর
  তারিখ যাচাই) — প্রতি block-এ আলাদা request হলে পেজ চোখের সামনে একটু একটু
  করে তৈরি হতো।

⚠️ **যা ইচ্ছে করেই দেওয়া হয়নি: section-এ tile-এর ছবি।** Tag-এর কার্ডের ছবি
Tag-এ, category-র tile-এর ছবি Category-তে, product-এর ছবি Product-এ। Section-এ
দ্বিতীয় একটা ছবি রাখলে একই কার্ডের দুটো উৎস হতো, আর একদিন দুটো আলাদা হয়ে যেত।
Section নিজের icon আর background পায় — ওটা section-এরই জিনিস।

### ১০ঘ · দুই স্ক্রিনের সীমানা + অ্যাডমিনের প্রস্থ — 31 Jul

**মালিকের নির্দেশ:** *"Categories-এ এগুলো দরকার নেই। সব Storefront-এর category
page-এ থাকবে। Banner section-এ banner-এর লেখা আর ছবি — সব ওখানেই। আর আগের
জায়গায় শুধু category বানানো।"*

**সীমানা (এখন থেকে এটাই নিয়ম):**

| Categories স্ক্রিন | Storefront → Category pages |
|---|---|
| category **কী** আর **কোথায় দেখায়** | category-র **পেজ কী বলে** |
| নাম · slug · parent · ক্রম · active | banner heading · paragraph · banner ছবি |
| navbar-এ দেখাবে কিনা · featured | Google-এর title/snippet |
| Card art (মেনু + homepage-এর ছবি ও icon) | ১৪টা section: on/off · লেখা · icon · background |
| Bundles | প্রশ্নোত্তর (FAQ) |
| | নতুন section যোগ করা |

**একটা লুকানো বিপদ ধরা পড়েছে ও বন্ধ করা হয়েছে।** Field গুলো সরানোর পরেও
CategoryEditor সেগুলো **পাঠাতেই থাকত** — form খোলার সময় যা পড়েছিল সেটাই।
ফলে Category pages-এ banner লিখে, তারপর Categories-এ যেকোনো কিছু save করলে
পুরনো লেখা নিঃশব্দে ফিরে আসত। এখন ওই field গুলো এই form আর পাঠায় না। **দুই
স্ক্রিন এক row-তে লিখতে পারে, কিন্তু এক field-এর মালিক একজনই।**

**অ্যাডমিনের প্রস্থ ঠিক হয়েছে।** ১০টা storefront স্ক্রিন `max-w-[860px]` থেকে
`max-w-[1100px]`-এ আটকানো ছিল — বড় মনিটরে বাঁ পাশে চেপে বসে থাকত, অথচ
Products/Categories পুরো স্ক্রিন জুড়ে। সবগুলো এখন বাকি অ্যাডমিনের একই frame
ব্যবহার করে (`px-6 md:px-8 xl:px-10 2xl:px-12 w-full`)। এক অ্যাডমিন, এক frame।

### ১০ঙ · Storefront = এক module, বাকিরা sub-module — 31 Jul

**মালিক:** *"Storefront-এ অনেক module হয়ে গেছে। Storefront main module হবে,
বাকি সব sub-module হিসেবে তার ভেতরে থাকবে।"*

আগে ছিল **১০টা সমান-সমান entry**, আর প্রতিটা পেজ connect হলে আরেকটা করে বাড়ত।
এখন Marketing-এর মতোই তিন স্তর:

```
Storefront
├── Overview            ← নতুন hub পেজ (/storefront)
├── Pages               পেজ কীভাবে সাজানো
│   ├── Homepage
│   └── Category pages
├── Blocks              পেজে যা বসানো হয়
│   ├── Banners
│   ├── Collections
│   └── Trust strip
├── Words               দোকান যা বলে, ক্রেতা যা বলে
│   ├── Section headings
│   ├── Reviews
│   └── Journal
└── Shop details        ব্যবসার তথ্য, সব পেজে
    ├── Visit the shop
    └── Footer & menus
```

**ভাগটা table অনুযায়ী নয়, কাজ অনুযায়ী।** "ফুলের পেজের banner কোথায় বদলাব"
— এটা Pages-এর প্রশ্ন, যদিও banner একটা Block। মালিক যেখানে খুঁজবেন, সেখানেই।

Overview পেজে প্রতিটা sub-module-এর কার্ড, সাথে একটা করে সংখ্যা (কয়টা banner
live, কয়টা review অপেক্ষায়)। সংখ্যাগুলো **পড়া হয়, রাখা হয় না** — hub নিজের
হিসাব রাখলে অন্য স্ক্রিনে কিছু বদলানোর সাথে সাথেই ভুল হয়ে যেত।

### ১০চ · Storefront overview — দ্বিতীয় পাস, 31 Jul

**প্রস্থের আসল কারণ।** পেজটা পুরো প্রস্থই নিচ্ছিল — কিন্তু grid ছিল ৪ কলামের,
আর বেশিরভাগ সারিতে ২-৩টা কার্ড। ডান কলাম খালি পড়ে থাকায় full-width পেজ
half-width দেখাচ্ছিল। আরেকটা `max-w` বদলানো এর সমাধান নয়।

**সমাধান: দুই কলামে চারটে panel।** Group-এ যতগুলোই screen থাকুক, সারি কখনো
অর্ধেক খালি থাকে না।

**রং ও গ্রাফ:**

- উপরে brand gradient-এর band + "Open the shop" বোতাম
- চারটে KPI টাইল — প্রতি group-এর একটা করে সংখ্যা
- প্রতিটা screen-এর সারিতে **progress bar**, কিন্তু শুধু যেখানে ভগ্নাংশটার
  মানে আছে: কয়টা category-তে banner লেখা হয়েছে, কয়টা banner live, কয়টা
  heading লেখা, কয়টা post published। যেখানে মানে নেই সেখানে bar নেই —
  কিছু না মাপা bar-এর চেয়ে bar না থাকা ভালো।
- Review অপেক্ষায় থাকলে "needs you" badge

### ১০ছ · সরল করা হলো — 31 Jul, মালিকের আপত্তির পর

**মালিক:** *"সুন্দর হয়েছে, কিন্তু পুরো ব্যাপারটা অনেক বেশি জটিল আর confusing
হচ্ছে। আমি UI/UX এত জটিল চাইনি — চেয়েছি সবাই যেন সহজে সব করতে পারে।"*

সঠিক আপত্তি। তিনটে জিনিস ফিরিয়ে সরল করা হয়েছে:

**১. Sidebar আবার এক স্তরে।** Pages / Blocks / Words / Shop details — এই মাঝের
ভাগটা তুলে দেওয়া হয়েছে। Banners-এ যেতে ৩ ক্লিক লাগত, আর প্রতিটা ক্লিকে একটা
প্রশ্ন ছিল: "banner কি Block না Page?" — যার উত্তর শুধু যে ভাগটা বানিয়েছে সে
জানে। এখন Storefront খুললেই ১১টা নাম, প্রতিটা এক ক্লিক।

ভাগটা **Overview পেজে থেকে গেছে**, যেখানে চারটেই একসাথে চোখের সামনে —
ওখানে ওটা সাহায্য করে, লুকায় না। *গোছানো যদি ক্লিক বাড়ায়, সেটা গোছানো নয়।*

**২. Section খুললে এখন শুধু লেখার তিনটে ঘর।** আগে একসাথে খুলত: তিনটে text box,
২০টা icon, ছবি upload, tile mode — যার জন্য মানুষ খোলে (heading) সেটা পর্দার
পাঁচ ভাগের এক ভাগ ছিল। বাকিগুলো এখন **"More options"**-এর পিছনে, এক ক্লিক দূরে।

**৩. সারি থেকে একটা কলাম বাদ।** "কোথা থেকে আসে" এখন নামের নিচের লাইনেই
জোড়া (`Roses, lilies… · from Categories → sub-categories`) — আলাদা কলাম নয়।

### ১০জ · এক পেজ, এক স্ক্রিন — সত্যিকারের নিয়ম, 31 Jul

**মালিক:** *"Homepage-এ ঢুকলে শুধু layout বদলানো যায়, section-এর title বদলাতে
আরেক জায়গায়, banner আরেক জায়গায়। এত ঘোরাঘুরি করলে যে কেউ হারিয়ে যাবে।"*

ভুলটা ছিল **জিনিস কী** সেই অনুযায়ী সাজানো (banner-এর সাথে banner, লেখার সাথে
লেখা) — **কোথায় দেখায়** সেই অনুযায়ী নয়।

**নিয়ম এখন থেকে:** একটা section-এর রোজকার কাজ ওই section-এর ভেতরেই।

Homepage-এ যেকোনো সারিতে **Edit** চাপলে খুলবে —

| Section | ভেতরে যা পাবে |
|---|---|
| যেকোনো section | তিন লাইন লেখা (eyebrow · heading · subtitle) |
| Hero / Promo | কোন banner গুলো চলবে — on/off, সাথে "লিখতে যাও" লিংক |
| Trust strip | প্রতিটা প্রতিশ্রুতি — on/off |
| Budget | কোন price card গুলো দেখাচ্ছে |
| Categories · Occasions · Best sellers · Journal · Reviews · Store · Delivery · Gift finder | এক লাইনে লেখা কোথা থেকে আসে — কারণ product row মানে product-এর তালিকা, কোনো setting নয় |

**আলাদা স্ক্রিনগুলো থেকে যাচ্ছে।** নতুন banner বানানো — তারিখ, দুটো CTA,
ভাসমান কার্ড — ওটা সত্যিকারের editor, list-এর সারিতে ঢোকানো যায় না।
**রোজকার কাজ এখানে, গভীর কাজ ওখানে**, আর মাঝে একটা লিংক যাতে "ওখানে" কোথায়
সেটা মনে রাখতে না হয়।

⚠️ ডেটা দুই জায়গায় যায়নি। Homepage-এ heading লিখলে সেটা **একই SectionText
row**, যেটা Section headings স্ক্রিনও লেখে। এক ঘর, দুটো দরজা।

### ১০ঝ · Homepage-এর সব কিছু Homepage-এর ভেতরে — 31 Jul

**মালিক:** *"Banner, collection, trust strip, section heading — এগুলো সব
homepage-এর ভেতরে যাবে। আর journal, review, shop, footer — এগুলো universal,
সব পেজে থাকে, তাই আলাদা থাকুক।"*

সীমারেখাটা তাঁর, আর সেটাই সঠিক সীমারেখা: **এটা কি একটা পেজের জিনিস, নাকি সব
পেজের?**

**Homepage-এর ভেতরে ঢুকল** (সারিতে Edit চাপলেই পুরো editor):

| Section | ভেতরে |
|---|---|
| Big banner | পুরো banner editor — লেখা, ছবি, CTA, তারিখ, নতুন banner |
| Promo strip | একই editor, promo placement-এ |
| Trust strip | পুরো trust editor — zone tab, icon, নতুন promise |
| Gifts for Every Budget | পুরো collections editor |
| যেকোনো section | তিন লাইন লেখা |

⚠️ **কাটছাঁট করা copy নয় — একই component।** `embedded` prop দিলে শুধু পেজের
সাজসজ্জা (h1, padding, tab bar) বন্ধ হয়, editor একই থাকে। আলাদা একটা সহজ
banner editor বানানো সহজ ছিল, কিন্তু ভুল — এক banner-এর দুই editor মানে একটা
field ভুলে যাওয়ার দুটো জায়গা।

**আলাদা থাকল** (সব পেজে দেখায়): Reviews · Journal · Visit the shop ·
Footer & menus।

Sidebar এখন **৭টা সারি**: Overview · Homepage · Category pages · Reviews ·
Journal · Visit the shop · Footer। Banners/Collections/Trust strip/Section
headings-এর পুরনো ঠিকানা কাজ করে (bookmark ভাঙেনি), শুধু আর মনে রাখতে হয় না।

### ১০ঞ · Homepage = পাঁচটা tab — 31 Jul

**মালিক:** *"তুমি Edit-এর মধ্যেই সব ঢুকিয়ে দিলে। বিরক্তিকর। উপরে tab tab করে
সুন্দর করে সাজিয়ে দাও।"*

সঠিক। accordion-এর ভেতরে form, তার ভেতরে আরেকটা accordion — ওটা সরলীকরণ নয়,
একই জটিলতা খারাপ navigation সহ।

**`/storefront/layout` এখন পাঁচটা tab:**

| Tab | কী |
|---|---|
| Layout | কোন section দেখাবে, কোন ক্রমে (drag) |
| Banners | উপরের বড় ছবি + promo strip — পুরো editor |
| Trust strip | প্রতিশ্রুতির সারি — পুরো editor |
| Budget cards | Gifts for Every Budget — পুরো editor |
| Wording | প্রতিটা section-এর তিন লাইন (শুধু homepage-এর) |

প্রতিটা tab-এ **আসল component**, কাটছাঁট নকল নয় — `embedded` prop শুধু পেজের
শিরোনাম আর padding লুকায়। Wording tab-এ `only="home"` দিয়ে শুধু homepage-এর
key গুলো দেখায়।

**পরের ধাপ:** Category pages স্ক্রিনটাও একই ছাঁচে — Layout · Banner ·
Questions · Wording। এখনো accordion-এ আছে।

### ১০ট · তিনটে সারি — Automatic নাকি নিজের বাছাই, 2 Aug

**মালিক:** *"Shop by type, Most ordered আর Ready to send now — এই তিনটেতেও
Automatic / Select দুটো mode চাই, Select-এ নিজে বেছে দেব আর ক্রমও ঠিক করব।"*

D-CAT-02 এতদিন শুধু **tag tile**-এ দুটো mode দিয়েছিল। এই তিনটেতে কোনো mode
ছিল না — দোকানের নিজের ডেটা নিজের ক্রমে আসত, আর স্ক্রিন ভদ্রভাবে সেটা জানিয়ে
কিছুই দিত না। আপত্তিটা সঠিক: **এই সপ্তাহে কোন জিনিস ক্রেতার সামনে যাবে সেটা
একটা সিদ্ধান্ত, বিক্রির কাউন্টার সবসময় সেটা নিতে পারে না।**

**D-CAT-06 · তিন সারিতেও AUTO / MANUAL** (D-CAT-02-এর সম্প্রসারণ)

| সারি | MANUAL-এ যা বাছাই হয় | সর্বোচ্চ |
|---|---|---|
| Shop by type | এই category-র sub-category | ১২ |
| Most ordered | এই category-র product | ৮ |
| Ready to send now | এই category-র **2-hour / same-day** product | ৪ |

**মালিকের চারটে সিদ্ধান্ত, 2 Aug:**

**১. বাছাই শুধু এক category-তে।** "All categories"-এ শুধু Automatic। Product
আর sub-category একটা category-রই জিনিস — সবার জন্য বাছাই করা তালিকা বাকি
তেরোটা পেজে অর্থহীন হত। স্ক্রিন কারণটা ওই জায়গাতেই লেখে, control লুকায় না।

**২. বাদ যাবে, ভরাট হবে না।** বাছাই করা product পরে unpublish হলে, category
বদলালে বা zone-এর বাইরে গেলে সে সারি থেকে চলে যায় — **তার জায়গায় AUTO থেকে
কিছু বসে না**। বসালে পেজ দেখে কেউ — মালিক নিজেও — বলতে পারতেন না কোনটা তাঁর
বাছাই আর কোনটা আপনা-আপনি এলো। সব বাদ গেলে সারি নিজেই লুকায়।

⚠️ ব্যতিক্রম একটাই: **তালিকা একদম খালি** থাকলে AUTO চলে। ওটা "বাছাই শেষ হয়নি"
অবস্থা, আর শিরোনামের নিচে শূন্য কার্ড ওই অবস্থার চেহারা হওয়া উচিত নয়।

**৩. Ready-তে শুধু আজ যেতে পারে এমন জিনিস।** Picker-এ 2-hour/same-day ছাড়া
কিছু আসেই না, **আর API পড়ার সময়ও আবার যাচাই করে** — বাছাইয়ের ছয় মাস পরে
product-এর express বন্ধ হতে পারে, আর তখন শিরোনামটা এমন প্রতিশ্রুতি দিত যেটা
দোকান রাখতে পারে না।

**৪. ক্রম ↑ ↓ তীরে, drag নয়** — উপরের section তালিকার মতোই (D-CAT-04-এর
ধারা)। দুটো item অদলবদল একমাত্র reorder যেটা মাঝপথে ভুল হতে পারে না।

**নতুন table নেই, নতুন endpoint নেই।** তালিকা `PageSection.config`-এ `mode`-এর
পাশে — tag tile যেখানে লেখে ঠিক সেখানেই (`slugs` category-র জন্য, `products`
product-এর জন্য)। Admin যে তালিকা থেকে বাছে সেটা **`/shop/products`** —
অর্থাৎ ক্রেতা যা দেখে ঠিক তাই। Admin-এর নিজের `/products` ব্যবহার করলে
published/category/zone — তিনটে filter দ্বিতীয়বার লিখতে হত, আর যেদিন দুটো আলাদা
হয়ে যেত সেদিন মালিক এমন product বাছতেন যেটা পেজ আঁকতে রাজি হত না।
(এই কারণে `/shop/products`-এ একটা `search` param যোগ হয়েছে — search page-ও
পরে এটাই ব্যবহার করবে।)

**⚠️ পথে একটা পুরনো bug ধরা পড়েছে ও ঠিক হয়েছে।** `ProductRail` server-এর
বাছাই **আবার ছাঁকত**। Server পুরো catalogue থেকে "Most ordered" বেছে পাঠাত,
আর component সেগুলো আবার `best` flag দিয়ে filter করত — ফলে যে product প্রচুর
বিক্রি হয় কিন্তু কেউ কখনো "Best seller" টিক দেয়নি, সে নিঃশব্দে বাদ পড়ত। হাতে
বাছাই চালু হলে **মালিকের নিজের বাছাইও** একইভাবে বাদ পড়ত। এখন `preselected`
prop — server যা পাঠিয়েছে সারি তাই দেখায়। এক সিদ্ধান্ত, এক জায়গায়।

**যাচাই:** `apps/web` typecheck পরিষ্কার। `apps/admin`-এ এই কাজের কোনো error
নেই — একটাই error আছে, `ZonesAvailability.tsx:358` (`kind` field), যেটা এই
কাজের আগে থেকেই ছিল এবং অন্য স্ক্রিনের। `apps/api` আগের মতোই এখানে যাচাই করা
যায়নি (পুরনো Prisma client); `catalog.ts`-এর নতুন অংশে কোনো error নেই, বাকি
সবগুলো সেই একই "client নতুন column চেনে না" ধরনের।

### ১০ঠ · পূর্ণ পরীক্ষা — ৪টে bug ধরা পড়ল ও ঠিক হলো, 2 Aug

মালিকের নির্দেশে পুরো category page আরেকবার পড়া হয়েছে — ১৪টা section, API,
admin, দুটো route। যা পাওয়া গেল:

**১. "Shop by style"-এর প্রতিটা টাইল কিছুই করত না।** ⛔ সবচেয়ে বড়টা।
API link বানাত `?style=bouquet` — group-এর নাম দিয়ে। কিন্তু পেজ পড়ে মাত্র
সাতটা নাম: `colour · occasions · tag · min · max · speed · sort`। `style`
তার মধ্যে নেই, তাই click করলে **ঠিক আগের পেজটাই** আবার আসত, filter ছাড়া।
আটটা টাইল দেখতে বোতামের মতো, কাজ শূন্য। এখন occasion ছাড়া বাকি সব group
`?tag=` পাঠায়। পুরনো `?style=` link (bookmark, ad) যাতে না ভাঙে, পেজ দুটো
বানানই মানে।

**২. Delivery band-এর ছয়টা কার্ডও একই রকম মরা ছিল** — `?delivery=express`,
যে নামটা পেজ কখনো পড়েনি। এখন `?speed=`। Nationwide-এর তিনটে কার্ড
(courier · scheduled · packing) delivery **speed** নয়, তাই ওগুলো grid-এ
নামিয়ে দেয় — যে filter API-তে নেই সেটার ভান করে না।

**৩. "Order within 3h 42m for delivery today" — লেখা ছিল, গোনা হত না।**
রাত ২টায়ও ৩ ঘণ্টা ৪২ মিনিট, দোকান বন্ধ থাকলেও তাই। এটা ক্রেতাকে দেওয়া
cut-off-এর প্রতিশ্রুতি, আর সেটা কাকতালীয়ভাবে ছাড়া কখনো সত্যি ছিল না —
তাই **সরানো হয়েছে**। সত্যি সংখ্যাটার জন্য `DeliveryMethod.cutoffTime`
এই component পর্যন্ত পৌঁছাতে হবে (নিচের §"এখনো খোলা" ২)। *সত্যি বলার কিছু
না থাকলে চুপ থাকা* — product card-এর "214 orders this month" যে যুক্তিতে
বাদ গিয়েছিল, একই যুক্তি।

**৪. "I'll choose" বোতাম বাছার কোনো উপায় দিত না।** attributeGrid আর
occasionGrid-এ D-CAT-02-এর MANUAL mode ছিল অর্ধেক তৈরি: mode বদলাত, তালিকা
খালি থাকত, পেজ চুপচাপ AUTO-তেই চলত। এখন ওই দুটোও নতুন picker ব্যবহার করে
(tag group বাছা + ↑↓✕)। Tag category-র সম্পত্তি নয়, তাই এই দুটো **All
categories-এও** বাছাই করা যায় — product/sub-category-র মতো নয়।

**৫. Admin build হচ্ছিল না।** `ZonesAvailability.tsx`-এর একটা form reset
পুরনো আকারে লেখা ছিল (`kind: "SAME_DAY"`, যে ঘরটা আর নেই)। TypeScript
আটকে ছিল, অর্থাৎ `apps/admin` compile হত না। এখন `blankType`-ই ব্যবহার হয়।

**সাথে দুটো ছোট জিনিস:** Delivery band-এর eyebrow component-এ হাতে লেখা ছিল
(admin-এর তিনটে ঘর কিছুই বদলাত না) — এখন SectionText থেকে, আর
`category.deliveryBand` key যোগ হয়েছে। Admin-এর search box খোলার সময়
পরিষ্কার হয় — আগের সারির খোঁজা শব্দ পরেরটাকে সরু করে দিত।

**যা পরীক্ষা করে ঠিক পাওয়া গেছে:** ১৪টা section-ই render হয় · custom block
নির্দিষ্ট section-এর পরে বসে · lean sub-category page · zone cookie ও
server render · Load More filter ধরে রাখে · Gift Finder এখন **API-তে**
জিজ্ঞেস করে (নিচের পুরনো খোলা প্রশ্ন ১ আর প্রযোজ্য নয়) · product fail করলে
সৎ empty state, mock নয় · `costPaisa` কোথাও যায় না।

### ১০ড · বাকি তিনটে কাজ শেষ — 2 Aug

**১. Grid-এর উপরে filter ও sort bar** (`CategoryFilterBar.tsx`)

চালু প্রতিটা filter এখন একটা করে chip — **Red**, **Bouquet**, **Birthday**,
**৳১,৫০০ – ৳৩,০০০**, **2-hour delivery** — প্রতিটায় ✕, একের বেশি হলে
"Clear all"। ডান পাশে sort: Most popular · Price low→high · Price high→low ·
Newest। `sort` পেজ প্রথম দিন থেকেই পড়ত, কিন্তু কেউ **বসাতে** পারত না।

দুটো সিদ্ধান্ত রাখার মতো:

- **এটা navigate করে, browser-এ ছাঁকে না।** Chip চাপলে URL বদলায়, server
  উত্তর আঁকে। Browser-এ ছাঁকলে লেখা সহজ হত আর এই পেজের জন্য ভুল হত:
  filter করা দৃশ্যেরও নিজের ঠিকানা লাগে (D-CAT-05), আর Load More তো
  আগে থেকেই filter নিয়ে API-তে যায়।
- **Chip-এর নাম টাইলের নাম** — slug সাজিয়ে নয়। পেজ তো ওই শব্দগুলো ধরেই
  আছে, তাই chip-এ "Baby Pink" লেখে, `baby-pink` নয়। হাতে লেখা link-এর
  জন্য slug সাজানোটা শুধু শেষ ভরসা।
- Gift Finder-এর উত্তর চললে bar লুকায় — ওটার নিজের banner আর নিজের
  "Start over" আছে; পাশাপাশি দুটো "সব মুছুন" পেজটাকে form বানিয়ে ফেলত।

**২. Delivery band এখন Delivery module থেকে**

ছয়টা কার্ডের নাম, লাইন আর countdown — সব `CategoryDelivery.tsx`-এ টাইপ করা
ছিল। এখন homepage-এর band যে `/shop/delivery-modes` পড়ে, ঠিক সেটাই। **দুই
band, এক সেট প্রতিশ্রুতি** — midnight delivery বন্ধ করলে দুই জায়গা থেকেই
এক edit-এ চলে যায়।

Countdown-এর তিনটে সৎ অবস্থা: আজকের জন্য কত সময় আছে · আজকের সময় পেরিয়ে
গেছে ("এখন order করলে কাল যাবে") · এই ধরনের কোনো cut-off নেই (কিছুই
আঁকা হয় না — "1–3 days by courier"-এর countdown হয় না)। সংখ্যাটা server-এ
ঢাকার সময়ে গোনা, কারণ browser-এর ঘড়ি ক্রেতার, দোকানের নয়।

API না পেলে আগের ছয়টা কার্ডই fallback — §৮-এর নিয়ম (product ছাড়া বাকি সব
fallback পায়)।

**৩. Sub-category page-এও filter কাজ করে** —
`/categories/fresh-flowers/roses?colour=red` এখন সত্যিই লাল গোলাপ দেখায়,
আর গোনাটাও filter করা গোনা। Lean মানে **কম section** (D42/D43), নিজের
URL-এর সাথে দ্বিমত করা grid নয়।

### ১০ঢ · রঙের backfill — মালিকের সিদ্ধান্ত, 2 Aug

**মালিক:** *"আগে backfill, পরে বাদ।"* — সঠিক ক্রম। আগে column ফেলে দিলে যে
product-এ এখনো FK বসেনি, তার রঙ চিরতরে চলে যেত।

```
radian_colour_backfill.bat          ← কী হবে শুধু দেখায়, কিছু লেখে না
radian_colour_backfill.bat apply    ← সত্যিই বসায়
```

**যা করে:** যে product-এ পুরনো `variantLabel` আছে কিন্তু FK নেই, তার নাম
colour master-এর সাথে মেলায় (ফাঁকা জায়গা আর ছোট-বড় হাতের অক্ষর উপেক্ষা করে)
এবং `variantValueId` বসায়।

**যা ইচ্ছে করেই করে না:**

- **নতুন রঙ বানায় না।** Product-এ "Rose Gold" লেখা আছে অথচ master-এ নেই —
  সেটা দোকানের রঙের তালিকা নিয়ে সিদ্ধান্ত, script-এর কাজ নয়। **রিপোর্ট করে,
  আন্দাজ করে না।**
- **যার FK আছে তাকে ছোঁয় না।** Master-এ যা আছে সেটাই জেতে, মাস ছয়েক আগে
  টাইপ করা শব্দ নয়।
- **দুটো মিললে বাছে না** — দুই attribute-এ "Red" থাকলে জানিয়ে দেয়।

⚠️ **Column দুটো বাদ যাবে তখনই, যখন রিপোর্টে unmatched শূন্য।** তার আগের
migration লিখলে সেটা ডেটা মোছার migration হয়ে যেত।

### ১০ণ · Filter bar-এর একটা পার্শ্বপ্রতিক্রিয়া, ধরা পড়েছে ও বন্ধ — 2 Aug

Filter bar আসার আগে query string বদলানোর একমাত্র উপায় ছিল পেজ ছেড়ে যাওয়া,
তাই grid-এর "এ পর্যন্ত যা load হয়েছে" নিরাপদে প্রথম পাতার state ছিল।

এখন chip চাপলে URL বদলায় **কিন্তু component mount হয়েই থাকে** — আর তার
`extra` array-তে **আগের filter-এর** পাতাগুলো বসে থাকত। Load More চাপলে
"Yellow"-এর নিচে লাল গোলাপ উঠে আসত: এমন ভুল যেটা দেখে মনে হয় দোকান নিজের
stock নিয়ে মিথ্যা বলছে।

এখন load হওয়া স্তূপটা server যে filter-এর উত্তর দিয়েছে তার সাথে বাঁধা, আর
উত্তর বদলালেই আবার শূন্য থেকে শুরু।

### যাচাই — 2 Aug

- `apps/web` — typecheck **পরিষ্কার**
- `apps/admin` — typecheck **পরিষ্কার**
- `apps/api` — এখানে যাচাই করা যায় না (পুরনো Prisma client); `catalog.ts` আর
  `sections.ts`-এর নতুন অংশে একটাও নতুন error নেই, বাকি সবগুলো সেই একই
  "client নতুন column চেনে না"
- **কোনো migration লাগছে না** — আজকের সব বদল code-এ। শুধু API restart, আর
  `category.deliveryBand` সারিটা boot-এ নিজেই তৈরি হবে।

```
radian_api_restart.bat        ← আগে
radian_category_verify.bat    ← তারপর: নতুন সব কিছু সত্যিই live কিনা
```

⚠️ পথে **cart-এর একটা লাইনও ঠিক করতে হয়েছে** (`bundleIds: [] as string[]`)।
DEC-PRD-013-এর কাজ চলাকালীন খালি array-টা `never[]` ধরে নিচ্ছিল, আর তাতে
পুরো `apps/web` compile হচ্ছিল না। আচরণে কোনো বদল নেই — শুধু নামটা।

### এখনো খোলা

1. **Discount + budget filter** — দাম filter কাজ করে **discount-এর পরের দামে**,
   তাই price filter দিলে ওই query in-memory হয়। **মালিকের সিদ্ধান্ত 2 Aug:
   এখন নয়** — আজকের catalogue-এ ঠিক আছে। বড় হলে
   `Product.effectivePricePaisa` column (write path + backfill)।
2. **`variantLabel`/`variantSwatch` drop করার migration** — উপরের backfill
   পরিষ্কার হওয়ার পরে, এক ধাপে।
3. **মালিকের চোখে দেখা** — এখনো হয়নি। §৯-এর নিয়ম: অনুমোদনের আগে কিছুই শেষ নয়।

**ডেটার অপেক্ষা, code-এর নয়:** `attributeGrid` `style` নামের TagGroup খোঁজে —
না থাকলে section নিজেই লুকায়। Style tag বানালেই ভরে উঠবে।
