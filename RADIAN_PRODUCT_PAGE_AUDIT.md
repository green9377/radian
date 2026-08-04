# Product page (PDP) — audit + connection plan

**তারিখ:** 31 Jul 2026
**পদ্ধতি:** `RADIAN_STOREFRONT_AUDIT.md`-এর নিয়ম — schema + API-র সাথে মেলানো,
admin screen-এর সাথে নয়। প্রতিটা gap-এর উত্তর `HAVE` / `BUILD` / `DROP`।
**পূর্বসূরি:** Page 1 (Homepage) done · Page 2 (Category) চলছে · এটা **Page 3**।
**পুরনো spec:** `PDP_DATA_CONTRACT.md` (14 Jul) — frontend যা চায় তার তালিকা।
এই ফাইল সেটাকে **আজকের schema-র সাথে** মিলিয়ে দেখে, কোনটা এসেছে কোনটা আসেনি।

---

## ০. এই page-এর তিনটে আলাদা বৈশিষ্ট্য

**ক. Contract আগেই লেখা আছে।** Homepage আর Category page-এ frontend কী চায় তা
পড়ে বের করতে হয়েছে। PDP-র জন্য `PDP_DATA_CONTRACT.md` ১৪ জুলাইয়েই লেখা —
`getProductDetail(slug)` একটাই swap point, component-এ একটা লাইনও বদলাবে না।
কাজ তাই কম, কিন্তু ওই contract-এর ৪টে জিনিস **এখনো schema-তে নেই**।

**খ. Category page-এর `/shop/products` এই page-এর ভিত্তি নয়** — PDP-র দরকার
`/shop/products/:slug`, আলাদা endpoint, আলাদা (অনেক বড়) shape। কিন্তু **`select`
field-এর তালিকা একই হতে হবে**, নাহলে grid-এ এক দাম আর PDP-তে আরেক দাম।
⚠️ এটাই coworker-এর সাথে একমাত্র সত্যিকারের সংঘর্ষের জায়গা — §৮ দেখুন।

**গ. এই page-এর শেষ বোতামটা একটা write।** Add to Cart এখন `useCartStore`
(browser memory)। Ecommerce module locked নয় — তাই cart/checkout এই pass-এ
ধরা হবে না, audit-এর ৪ নম্বর নিয়ম অনুযায়ী। PDP display পর্যন্ত connect হবে,
বোতাম আগের মতোই local থাকবে।

---

## ১. Contract-এর ২১টা field — একটা একটা করে

`ProductDetail` (`_data/productDetails.ts`) — frontend যা চায়:

| # | Field | উত্তর | কোথায় আছে / কী নেই |
|---|---|---|---|
| 1 | `product` | ✅ HAVE | `Product` — নাম, slug, দাম, zone, flags সব আছে |
| 2 | `crumb` | ✅ HAVE | `Category` + `parent` |
| 3 | `nature` | ✅ HAVE | `natureType` `natureLabel` |
| 4 | `deliveryChip` | ✅ HAVE | `DeliveryMethod` + `supportsExpress/SameDay/Midnight` |
| 5 | `gallery[]` | ✅ HAVE | `ProductImage` — Media store ৩০ জুলাই হয়ে গেছে |
| 6 | `videoId` | ✅ HAVE | `Product.videoId` |
| 7 | `trust[]` | ✅ HAVE | `ProductTrustBadge` — তবে category default নেই (§৩গ) |
| 8 | `variant` | ✅ HAVE\* | `VariantGroup` + `VariantValue`; \*`variantLabel`/`variantSwatch` deprecated — FK থেকে পড়তে হবে |
| 9 | `sizes[]` | ✅ HAVE | `ProductSize` |
| 10 | `sizeLabel` | 🔨 BUILD | "Stem Count" / "Weight" / "Box Size" — কোথাও নেই। ছোট, কিন্তু ছাড়া size row-এর মাথা খালি |
| 11 | `bundles[]` + `bundleHint` | ⛔ **নেই** | `Bundle` table কখনো বানানো হয়নি। §২ |
| 12 | `addonTabs[]` | ✅ HAVE | `AddOnGroup` + `AddOnRule` + `manualAddOnGroups` — resolver API লাগবে |
| 13 | `perso` | ⛔ **নেই** | Personalisation (নাম/ছবি) — কোনো column নেই। §৩ক |
| 14 | `spec[]` | ✅ HAVE | `ProductSpec` |
| 15 | `craft[]` | 🔨 BUILD | "কেন আমাদের থেকে" ৩টে কার্ড — কোথাও নেই। §৩খ |
| 16 | `faqs[]` | ✅ HAVE | `ProductFaq` (+ `CategoryFaq` এইমাত্র যোগ হয়েছে) |
| 17 | `custom` | ✅ HAVE | `CompanySetting.whatsappPhone`; লেখা `SectionText`-এ |
| 18 | `crossSlugs[]` | 🔨 BUILD | কোনো relation নেই — AUTO না MANUAL, §৩ঘ |
| 19 | `ozReason` | ✅ HAVE | `Product.nationwideMsg` |
| 20 | `reviews` | ✅ data · 🔨 API | `Review.productId` আছে; aggregate endpoint নেই। এখন **সব product-এ hardcoded 4.9 / 412** |
| 21 | `OFFERS` (component-এ hardcoded) | ✅ data · 🔨 API | `Offer` + `OfferRedemption` আছে (DEC-OFR); PDP-তে resolve হয় না |

এর বাইরে দুটো জিনিস component-এ **বানানো** আছে, data নয়:

- **কাটা দাম (was-price)** — `price ÷ 0.81` করে ১৯% ছাড় দেখানো হয়। কিন্তু
  `sellingPricePaisa` + `discountType` + `discountValue` schema-তে আছেই।
  ⚠️ এটা কল্পিত ছাড় দেখানো — connect করার সময় **প্রথমেই** সরাতে হবে।
- **6 PM countdown** — `DeliveryMethod.cutoffTime` আছে, component ঘড়ি নিজে গোনে।

---

## ২. ⛔ Bundle — সিদ্ধান্ত লাগবে, code নয়

PDP-তে "+ Chocolates ৳450" ধরনের photo card। `PDP_DATA_CONTRACT.md` §৪-এ
`Bundle` model প্রস্তাব করা ছিল; Product module lock হওয়ার সময় সেটা **ঢোকেনি**।
এর বদলে schema-তে দুটো কাছাকাছি জিনিস আছে:

| | কী | PDP-তে কীভাবে দেখায় |
|---|---|---|
| `Product.upgradeOf` | বড় version — নিজের পূর্ণ দাম | option, নিজের page-এ যায় না |
| `AddOn` | ছোট জিনিস — card, wrap | সবসময় যোগ হয় (৳500 + ৳50) |
| **Bundle** | **অন্য একটা product যোগ হয়** | **কিছুই নেই** |

তিনটে আলাদা প্রশ্ন। Bundle-কে AddOn বানালে One Data One Owner ভাঙে — চকলেট
catalog-এ product হিসেবেও আছে, add-on হিসেবেও থাকবে, দুই জায়গায় দুই দাম।

**তিনটে পথ, মালিকের বাছাই:**

1. **BUILD** — `Bundle` table, `addsProductId` FK দিয়ে catalog product reference।
   Contract-এ যা লেখা ছিল, তাই।
2. **DROP** — bundle card উঠে যাবে। PDP ছোট হবে, তবে গড় order value-ও কমবে।
3. **পরে** — এখন লুকিয়ে রাখা, Ecommerce lock-এর সাথে ফেরত আসা।

⚠️ এটা Product module-এর schema change। architecture project-এ পাশ না হলে
হাত দেওয়া হবে না — sync rule।

---

## ৩. চারটে ছোট gap

**ক. Personalisation (`perso`)** — নাম লেখা, ছবি আপলোড। কোথাও column নেই।
দুই ভাগ: (i) product-এ কী কী ঘর দেখাবে — Product-owned config, (ii) গ্রাহকের
লেখা/ছবি — **OrderLine-এর জিনিস, PDP-র নয়**। (ii) Ecommerce-এর, তাই আটকানো।
(i)-ও অর্থহীন যতক্ষণ (ii) নেই। **প্রস্তাব: এই pass-এ DROP**, Ecommerce-এর সাথে।

**খ. Craft points (`craft`)** — "Hand-tied by our florists" ধরনের ৩টে কার্ড।
৭১টা product-এ হাতে লেখা অসম্ভব। **প্রস্তাব: category template**, product-এ
override। এটাই `ProductTrustBadge`-এরও সমস্যা (নিচে গ), তাই এক সমাধান দুটোতে।

**গ. Category template** — contract §৪-এ `CategoryDetailTemplate` প্রস্তাবিত
ছিল, আসেনি। এখন frontend-এ `TEMPLATES` + `DETAIL_OVERRIDES` হিসেবে চলছে।
Trust badge, craft, FAQ, spec — চারটেই per-product হলে নতুন product যোগ করা
আধা ঘণ্টার কাজ হয়ে যাবে, আর কেউ করবে না ⇒ page খালি।
**প্রস্তাব: `CategoryFaq`-এর প্যাটার্ন বাড়িয়ে দেওয়া** — Category-তে
trust/craft-এর default, Product-এ শুধু override। নতুন table কম, নিয়ম এক।

**ঘ. Cross-sell (`crossSlugs`)** — D-CAT-02-এর হুবহু একই প্রশ্ন, যার উত্তর
category page-এ ইতিমধ্যে দেওয়া হয়েছে: **AUTO default, MANUAL override**।
AUTO = একই category + অন্তত একটা মিল tag, `salesCount` অনুযায়ী সাজানো।
নতুন ধারণা লাগছে না — শুধু `PageSection.config` PDP-তে ব্যবহার করা।

---

## ৪. Route-এর দুটো bug, আজই সত্যি

**ক. `generateStaticParams()` `PRODUCT_SLUGS` থেকে।** Admin-এ নতুন product
বানালে সে page **404**। Category page-এর ঠিক একই bug (audit §০খ), একই কারণ।
Fix: static params বাদ, dynamic route + `notFound()`, পরে ISR।

**খ. `detail.sizes[0].id` — খালি array-তে crash।** `useState(detail.sizes[0].id)`
আর `bundles[0].id` দুটোই ধরে নিয়েছে অন্তত একটা row আছে। Mock data-তে সবসময়
ছিল; database-এ size ছাড়া product **প্রথম দিনেই** থাকবে। এটা white screen,
missing section নয়।

---

## ৫. API — একটা endpoint, একটা request

**`GET /shop/products/:slug`** — `shop.ts`-এর ভেতরে, `@Public()`, read-only।
পুরো page এক request-এ: product + images + sizes + variant siblings + spec +
faq (product ⊕ category) + trust + craft + add-on group (rule resolve করা) +
offer + review aggregate + cross-sell + delivery chip।

⚠️ **`costPaisa` কখনো নয়।** `shop.ts`-এর header-এ নিয়মটা লেখা আছে — প্রতিটা
field নাম ধরে `select`, spread নয়। PDP-তে ঝুঁকি সবচেয়ে বেশি, কারণ এখানে
Product-এর প্রায় সব column-ই দরকার। `advanceRequired`/`advanceType` যায়,
`costPaisa` `stockQty`(showStock false হলে) `sku` যায় না।

**Aggregate rating আলাদা করে গোনা হবে**, Google-এর সাথে **মেশানো হবে না** —
Homepage audit §Phase 3-এর একই সতর্কতা, দুটো আলাদা population।

---

## ৬. Admin-এ যা লাগবে

`ProductEditor.tsx` (2160 লাইন) ইতিমধ্যে ২৩টা Card ধরে — basics, pricing,
payment rule, stock, lead time, photos, video, zone, delivery speed, variant,
sizes, upgrades, add-ons, occasions, recipients, nature line, sales signal,
trust badges, what's inside, FAQ, nationwide message, SEO, share card।
**PDP-র বেশির ভাগ ঘর আগে থেকেই আছে** — এটাই এই page-এর সবচেয়ে ভালো খবর।

যা নেই:

1. **Size label** (§১ #10) — sizes card-এ একটা ঘর
2. **Craft points** — category template + product override (§৩খ পাশ হলে)
3. **Bundle** — পুরো নতুন card (§২ পাশ হলে)
4. **Cross-sell** — AUTO/MANUAL toggle (§৩ঘ)
5. **Category editor-এ Trust + Craft default tab** — §৩গ

---

## ৭. কাজের ক্রম

| ধাপ | কাজ | কেন এই জায়গায় |
|---|---|---|
| 0 | §২ + §৩-এ মালিকের হ্যাঁ/না | schema আগে — নিয়ম |
| 1 | Route fix (§৪ক) + খালি array crash (§৪খ) | দৃশ্যমান bug, কোনো সিদ্ধান্তের উপর দাঁড়িয়ে নেই |
| 2 | Schema: `sizeLabel`, craft/trust template, Bundle (পাশ হলে) | |
| 3 | `/shop/products/:slug` | coworker-এর `select` তালিকা এলে |
| 4 | Admin: বাকি ৫টা card | backend ছাড়া screen নয় |
| 5 | Server render + zone cookie | **coworker-এর সাথে ভাগাভাগি** — §৮ |
| 6 | Connect: gallery → buy panel → variant/size → add-on → offer → countdown | উপর থেকে নিচে, contract-এর locked order |
| 7 | Spec / craft / FAQ / cross-sell / review | নিচের অর্ধেক |
| 8 | কাটা দামের হিসাব সরানো | ⚠️ ধাপ ৬-এর আগে হলেও চলে, দেরি নয় |

**Add to Cart ধাপের তালিকায় নেই** — সেটা write, Ecommerce lock-এর জন্য অপেক্ষা।

---

## ৮. ⚠️ Coworker-এর সাথে ভাগ করা চারটে জিনিস

Category page আর product page একই সপ্তাহে চলছে। এই চারটে **দুবার লেখা যাবে না**:

| | জিনিস | কার | নিয়ম |
|---|---|---|---|
| 1 | `/shop/products`-এর `select` field তালিকা | Category | PDP সেটাই বাড়িয়ে নেবে, নতুন করে লিখবে না |
| 2 | Zone cookie + server component প্যাটার্ন (D-CAT-05) | Category | PDP reuse করবে, নিজের বানাবে না |
| 3 | `Product.variantValueId` FK (D-CAT-01) | Category | PDP-র variant row-ও এখান থেকেই পড়বে |
| 4 | `PageSection` / `SectionText`-এ `page = "product"` | PDP | homepage-এর একই প্যাটার্ন, তৃতীয় নিয়ম নয় |

---

## ৯. মালিকের জন্য খোলা প্রশ্ন

1. **Bundle** — build / drop / পরে? (§২)
2. **Personalisation** — এই pass-এ drop করে Ecommerce-এর সাথে, ঠিক আছে?
3. **Craft + trust** — category default + product override, ঠিক আছে?
4. **Cross-sell** — AUTO default (category page-এর মতো), না হাতে বাছাই?
5. **Size-এর নিজস্ব stock** — "24 stems শেষ, 12 আছে" আলাদা গোনা হবে?
   (`PDP_DATA_CONTRACT.md` §৬-এর ২ নম্বর, এখনো খোলা)
6. **কাটা দাম** — আসল discount field থেকে আসবে, কল্পিত ১৯% বাদ — নিশ্চিত?
7. **Per-product rating** — নিজের review থেকে গোনা হবে, না রেটিং লাইনটাই
   product page থেকে উঠে যাবে যতক্ষণ review নেই?

**এই ৭টার উত্তর পেলে §৭-এর ধাপ ১ থেকে শুরু করা যায়** — ধাপ ১ কোনো উত্তরের
উপর দাঁড়িয়ে নেই, তাই সেটা এখনই শুরু করা সম্ভব।

---

## ১০. যা হয়ে গেছে

### ধাপ ১ক · সাদা পর্দার bug — 31 Jul

`getProductDetail()`-এ দুটো invariant, component-এ নয়।

Admin-এ Sizes ঘর খালি রেখে save করলে ওই product-এর page **সম্পূর্ণ সাদা** হত।
`PdpView` খোলে `useState(detail.sizes[0].id)` দিয়ে, `cart.ts` লেখে
`size.pricePaisa` — দুটোই ধরে নিয়েছিল অন্তত একটা row আছে। Mock template-এ
সবসময় ছিল, তাই কখনো ধরা পড়েনি।

**Component-এ `?.` বসানো হয়নি, ইচ্ছাকৃত।** সেটা করলে `ResolvedLine.size`-কে
nullable করতে হত আর সেটা cart-এর প্রতিটা component-এ ছড়াত — money page,
এই pass-এর বাইরে। Seam-ই এর জায়গা: আজ mock, কাল fetch, নিয়ম এক।

সাথে তিনটে presentation guard — একটামাত্র size/bundle থাকলে সারিটা লুকায়,
add-on tab না থাকলে "Make It Extra Special" শিরোনামটাই ওঠে। খালি শিরোনাম
ভাঙা page-এর মতো দেখায় — homepage rail-এ (৩০ জুলাই) নেওয়া একই সিদ্ধান্ত।

⚠️ **404 ইচ্ছে করে ছোঁয়া হয়নি।** নতুন product-এ 404 হচ্ছে কারণ storefront
এখনো mock তালিকা পড়ে। `generateStaticParams` সরালে "ঠিক হয়েছে" দেখাত,
হত না। ধাপ ৩-এর সাথে এক লাইনে যাবে — category page-এ 404 patch না করার
হুবহু একই যুক্তি।

### ধাপ ৩ · `GET /shop/products/:slug` — 31 Jul

`apps/api/src/shop/product-detail.ts`, নতুন ফাইল, `app.module.ts`-এ registered।

**`shop.ts`-এর ভেতরে নয়, ইচ্ছাকৃত।** Category page (product LIST) আর product
page একই সপ্তাহে চলছে, দুটোই `/shop`-এর নিচে। Nest এক prefix-এ দুই controller
মানে, আর দুই ফাইল মানে দুজন একই ৭০০ লাইনে একসাথে লিখছে না।

এক request-এ যা আসে: product + ছবি + size + variant sibling + spec +
FAQ (product ⊕ category) + trust + add-on tab (rule resolve করা) + review
aggregate + cross-sell + SEO + breadcrumb।

যা **যায় না**: `costPaisa` · `sku` · `stockQty` (মালিক `showStock` না দিলে)।
প্রতিটা field নাম ধরে `select` — একটাও spread নেই।

**তিনটে সিদ্ধান্ত এই ফাইলে নেওয়া হয়েছে:**

1. **দাম-এর নিয়ম একবার লেখা** — `paidPaisa()` / `mrpOrNull()` export করা,
   যাতে grid আর PDP কখনো দুই দাম না দেখায়। কল্পিত `÷ 0.81` এখানেই শেষ:
   ছাড় না থাকলে `mrpPaisa` **null**, কাটা দাম আঁকাই হয় না। (§৯-এর ৬ নম্বর
   প্রশ্নের উত্তর এখানে ধরে নেওয়া হয়েছে — মালিক না বললে ফেরানো যাবে।)
2. **Rating null, 4.9 নয়** — শুধু এই product-এর PUBLISHED review গোনা হয়।
   দোকানের বা Google-এর গড় কখনো product-এর নামে বসে না।
3. **Variant `variantValueId` FK থেকে**, `variantLabel`/`variantSwatch` শুধু
   fallback — coworker-এর D-CAT-01 migration-এর উপরেই দাঁড়ানো, দ্বিতীয় পথ নয়।

⚠️ **একটা দুর্বলতা নকল করা হয়েছে, ইচ্ছাকৃত।** `AddOnRule`-এর CATEGORY নিয়ম
category-র **নাম** ধরে মেলে, id বা slug নয় — admin-এর preview ঠিক এটাই করে।
মানে "Cakes" নাম বদলালে ওই নিয়মগুলো চুপচাপ খুলে যাবে। এখানে id দিয়ে মেলালে
বেশি নির্ভুল হত, কিন্তু তখন মালিক preview-তে যা দেখে আর live page যা দেখায়
দুটো আলাদা হত — সেটা আরও খারাপ। দুই দিকে একসাথে ঠিক করার জিনিস।

**Prerequisite:** coworker-এর `20260731090000_category_page` migration চালু
থাকতে হবে (`CategoryFaq` + `Product.variantValueId`), নাহলে এই endpoint 500।

### ধাপ ৪–৬ · Storefront connect — 31 Jul

`apps/web/app/_data/productApi.ts`, নতুন ফাইল — `categoryApi.ts`-এর পাশে,
একই কাজ, একই কারণ। ছয়টা component `ProductDetail` পড়ে; এই ফাইল হুবহু সেই
object ফেরত দেয়, তাই **একটা component-ও বদলায়নি** (দুটো ছাড়া, নিচে দেখুন)।

**যা এখন সত্যিই database থেকে আসছে:** breadcrumb · ছবি · video · nature line ·
নাম · দাম · কাটা দাম · রঙ · size · trust badge · spec · FAQ (product ⊕
category) · rating · SEO।

**404 এখন সত্যি ঠিক।** `generateStaticParams` বাদ — সেটা mock-এর ৭১টা slug
build-এ pre-render করত, তাই admin-এ বানানো product ওই তালিকায় থাকত না, আর
যেগুলো থাকত সেগুলো build-এর সময়ের দাম ধরে বসে থাকত। এখন প্রতি request-এ
render, `cache: "no-store"` — admin-এ দাম বদলালে পরের refresh-এ দেখাবে।

**⚠️ Fallback নিয়ম এখানে উল্টো, এবং সেটাই নিয়ম।** API চুপ থাকলে category
rail পুরনো list দেখায় — বাসি rail-ও ফুল বেচে। Product-এ সেটা চলবে না:
mock catalogue-এ ফেরত গেলে দোকানে নেই এমন ৭১টা তোড়া দামসহ live shop-এ
বসবে। তাই API না পেলে **404** — `_data/shop.ts`-এর `ShopProduct`-এর উপরে
লেখা নিয়ম, আর ৩০ জুলাই category page 404-ই রেখে দেওয়ার একই যুক্তি।

**দুটো component বদলেছে, দুটোই একই কারণে — mock-এ ফিরে যাওয়া বন্ধ করতে:**

1. `PdpView` — কাটা দাম, শতাংশ আর "You save" তিনটেই এখন `mrpPaisa` থাকলে
   তবেই আঁকে; rating সারি review না থাকলে পুরোটাই ওঠে।
2. `RelatedRail` — নতুন optional `items` prop। দেওয়া হলে mock `PRODUCTS`
   ছোঁয়াই হয় না। Live page `items={[]}` দেয়।

**তিনটে section ইচ্ছাকৃতভাবে খালি রাখা হয়েছে:**

| Section | কেন এখন নয় |
|---|---|
| Bundle | table-ই নেই (§২, মালিকের সিদ্ধান্ত বাকি) |
| Add-on | API ঠিকঠাক দেয়, কিন্তু cart দাম বসায় `getAddon()` দিয়ে — database-এর add-on তখন ৳0-তে যোগ হয়ে বিনামূল্যে প্যাক হবে। Cart-এর সাথে **একসাথে** যাবে, অর্ধেক এখন নয় |
| Cross-sell | product **CARD** লাগে, slug নয় — সেই mapper category page-এর `/shop/products`। এখানে দ্বিতীয়টা লিখলে §৮-এর ঠিক যে duplication ঠেকানোর কথা, সেটাই হত |

**চারটে জিনিস এখনো category template থেকে আসে**, ইচ্ছাকৃত: size-এর শিরোনাম ·
craft কার্ড · WhatsApp customization-এর লেখা · out-of-zone বাক্য। চারটেই
**দোকানের কথা**, দাম বা stock-এর দাবি নয় — §৩-এর row বন্ধ হলে admin-এ যাবে।

⚠️ **Cart এখনো mock পড়ে।** নতুন product cart-এ গেলে "পাওয়া যাচ্ছে না"
দেখাবে। Ecommerce lock-এর কাজ, এই pass-এর বাইরে — কিন্তু demo করার সময়
এটা চোখে পড়বে, তাই লিখে রাখা হলো।

### Demo catalogue seed — 31 Jul

`apps/api/seed_demo_products.mjs` + `radian_demo_seed.bat`।

Page API থেকে পড়া শুরু করার সাথে সাথে ৭১টা mock product storefront থেকে
উধাও — সঠিক, কারণ দোকানে ওগুলো ছিল না। কিন্তু ফল হলো প্রতিটা product link
404। মালিক development-এর জন্য demo item চেয়েছেন (category audit §৯.৩)।

⚠️ **এটা `seed.mjs` নয়, আর পার্থক্যটাই মূল কথা।** পুরনোটা Product, Category,
Customer, Order সহ ১৩টা table TRUNCATE করে শুরু করে — আজ চালালে দুই সপ্তাহের
banner, section, collection সব চলে যেত। নতুনটা **শুধু যোগ করে**: একই slug-এর
category/tag/product থাকলে ছুঁয়েও দেখে না, আর size/spec/FAQ/trust শুধু তখনই
লেখে যখন product-এ একটাও নেই। দুবার চালালে দ্বিতীয়বার কিছুই বদলায় না।

ProductImage বসানো হয়নি — ছবি নেই, আর কিছুর দিকে না তাকানো row মানে ভাঙা
image icon। ছবি ছাড়া storefront নিজের tinted panel আঁকে, যেটা সে সবসময়ই করত।

---

## ১১. Bundle — locked, 31 Jul

**মালিকের সিদ্ধান্ত:** রাখা হবে, এবং **bundle নিলে ছাড় দেওয়া হয়**।

### D-PDP-01 · Bundle-এ দাম নয়, ছাড় জমা থাকবে

`Bundle` table-এ কোনো `pricePaisa` column নেই। দাম সবসময় যোগ হওয়া
product-এর নিজের দাম থেকে পড়া হয়; এখানে থাকে শুধু মালিকের দেওয়া **ছাড়**।

**কেন:** ৳400 লিখে রাখলে সেটা যেদিন লেখা হয় সেদিন ঠিক, তারপর প্রতিদিন ভুল।
চকলেটের দাম ৳600 হলে bundle ৳400-তেই বিক্রি হতে থাকবে — প্রতি order-এ ৳200
লোকসান, যেটা কোনো report ধরবে না। "৳50 কম" কখনো পুরনো হয় না।

`discountType`/`discountValue` — Product আর AddOn-এর হুবহু একই convention
(FLAT = paisa, PERCENT = basis points)। তিন রকম নিয়ম মনে রাখতে হবে না।

### D-PDP-02 · Category-তে default, product-এ override

Craft cards-এ মালিক যে নিয়ম বেছেছেন, সেটাই। `categoryId` **অথবা**
`productId` — দুটোর ঠিক একটা, database CHECK constraint দিয়ে বাঁধা।

**Merge নয়, replace।** Product-এর নিজের row থাকলে category-রটা পুরোপুরি বাদ।
Merge করলে override দিয়ে শুধু যোগ করা যেত, আর যে একটা কাজের জন্য override
দরকার — কিছু **বাদ** দেওয়া — সেটাই করা যেত না।

### বাকি দুটো — আমার সিদ্ধান্ত, মালিককে জানানো হয়েছে

- **একসাথে একটাই bundle** — এখনকার design। একাধিক হলে add-on আর bundle-এর
  পার্থক্য ঝাপসা হয়ে যায়।
- **Stock শেষ → card উধাও**, ধূসর নয়। দেখা যায় কিন্তু নেওয়া যায় না এমন card
  মানে পরে ফোন করে প্রতিশ্রুতি ফিরিয়ে নেওয়া।

### দুটো ছোট সিদ্ধান্ত, code-এ

- **"Just Flowers" card তৈরি হয়, জমা থাকে না** — প্রতিটা page-এ একই, মালিকের
  কোনো সিদ্ধান্ত ধরে না। এটা ছাড়া সারিটা "কিছু একটা যোগ করতেই হবে" মনে হয়,
  ফেরার পথ থাকে না।
- **"Most loved" ব্যাজ এক সারিতে একটাই** — দুটো rose-gold card মানে দুটো
  সুপারিশ, অর্থাৎ কোনোটাই নয়।

### ছাড় কোথায় বসে

যোগ হওয়া product-এর **নিজের ছাড়ের পরেও** bundle-এর ছাড় বসে। চকলেটে ১০%
ছাড় চলছে, bundle-এ ৳50 — তাহলে bundle-এ সেটা তার sale price-এর চেয়েও ৳50 কম।
নাহলে আলাদা কেনার চেয়ে bundle **দামি** দেখাত, যেটা পুরো ব্যাপারটাই ভেঙে দেয়।

### Admin — এক component, দুই জায়গা

`BundleEditor.tsx` — Category editor আর Product editor **দুটোতেই একই
component**। Category-র default আর একটা product-এর override আসলে একই screen,
পার্থক্য শুধু একটা id। দুটো screen মানে একই ছয়টা ঘর দুবার আঁকা আর তৃতীয়
পরিবর্তনেই আলাদা হয়ে যাওয়া।

**দামের ঘর নেই, আর সেটাই feature।** মালিক ছাড় বসান; দাম আসে যোগ হওয়া
product থেকে। `alonePaisa` (একা কিনলে কত) আর `addPaisa` (card-এ যা দেখাবে)
দুটোই **server থেকে হিসাব হয়ে আসে**, screen শুধু দেখায়। Browser-এ আবার
হিসাব করলে এক নিয়মের দুই উত্তর হত, আর মালিক যেটা দেখে সিদ্ধান্ত নিতেন
সেটাই হত ভুলটা।

**"কেন আমার bundle site-এ দেখাচ্ছে না" আগেই বলা আছে।** Row active অথচ যোগ
হওয়া product draft বা stock-শূন্য হলে সেই কারণটা row-এর নিচে লেখা থাকে।
নাহলে মালিক bundle বানিয়ে, site-এ কিছু না দেখে ধরে নিতেন feature-টা ভাঙা।

**Product editor-এ card-টা Sizes আর Upgrades-এর মাঝখানে** — page-এ যে ক্রমে
দেখা যায় সেই ক্রমেই, আর এই ক্রমেই তিনটা মাথায় আলাদা থাকে: একই জিনিস অন্য
দামে (size) → পাশে দ্বিতীয় জিনিস (bundle) → একই জিনিস, বড় (upgrade)।

**Save না করা product-এ card দেখায় না** — bundle একটা product id ধরে, আর
unsaved product-এর id নেই। আগে দেখালে সিদ্ধান্ত নেওয়া হত যার রাখার জায়গা নেই।

---

---

## ১২. Craft cards · Size heading · Countdown — 31 Jul

`20260731110000_craft_points` — একটা table, একটা column। দুটোই additive।

### D-PDP-03 · CraftPoint — category-তে একবার

মালিকের সিদ্ধান্ত। `Bundle`-এর **হুবহু একই ownership rule**: `categoryId`
অথবা `productId`, database CHECK দিয়ে বাঁধা, product-এর row থাকলে
category-রটা **replace** হয়। একই page-এ দুটো আলাদা inheritance নিয়ম মানে
একটা নিয়ম বেশি।

**তিন ধাপে খোঁজা হয়:** product → নিজের category → **parent category**।
তৃতীয় ধাপটাই এখানে সবচেয়ে জরুরি — গল্পটা "ফুল" নিয়ে, আর sub-category ৪৪টা।
Parent fallback না থাকলে মালিক Roses, Lilies, Gerbera, Tuberose-এ একই তিনটে
অনুচ্ছেদ লিখতেন, অর্থাৎ একবার লিখতেন আর বাকি ৪৩টা খালি থাকত।

⚠️ **`ProductTrustBadge` এর সাথে গুলিয়ে ফেলা সহজ।** ওটা দামের পাশের তিনটে
ছোট প্রতিশ্রুতি ("2-Hour Delivery"); এটা নিচের তিনটে অনুচ্ছেদ। Trust badge
এখনো product-only, কিছু inherit করে না — §৩গ এখনো খোলা।

### D-PDP-04 · Size-এর শিরোনাম Category-তে

`Category.sizeLabel`। **Product-এ নয়** — এটা কী **ধরনের** জিনিস বিক্রি হচ্ছে
তার বৈশিষ্ট্য, একটা তোড়ার নয়। Cakes-এর প্রতিটা product "Weight" চায়, কেউ
আলাদা শব্দ চায় না।

Migration-এ ৮টা top-level category-তে বর্তমান শব্দগুলোই বসিয়ে দেওয়া হয়েছে —
banner migration-এর একই নীতি: column পড়া শুরু হওয়ার মুহূর্তে page হুবহু
আগের মতো দেখায়, মালিক ৮টা খালি ঘর ভরার বদলে যা আছে তা ঠিক করেন।

Sub-category-তে খালি রাখলে parent-এরটা, তাও না থাকলে সাদামাটা "Size"।

### D-PDP-05 · Countdown আর বানানো নয়

⚠️ আগে `PdpView`-এ ছিল `cut.setHours(18, 0, 0, 0)` — component নিজেই ৬টা ধরে
নিত। **দুটো ভুল একসাথে:** (১) যে delivery mode-এর আসল cut-off ৬টা নয়,
তাতে ঘড়িটা মিথ্যা বলত; (২) হিসাব হত **দর্শকের ঘড়িতে**, তাই টরন্টো থেকে
দেখলে ঢাকার cut-off ৯ ঘণ্টা দূরে দেখাত।

এখন server `DeliveryMethod.cutoffTime` থেকে বাংলাদেশ সময়ে মিনিট গোনে —
shop-এর "Open now" pill আর `orders/promise.ts`-এর একই `+6h`। Browser শুধু
গোনে।

**দুই zone-ই ফেরত আসে**, কারণ দর্শকের zone browser store-এ, এই request-এ নয়।
একটা সংখ্যা পাঠালে অর্ধেক দোকানের জন্য ঘড়িটা চুপচাপ ভুল হত।

**আজকের সব cut-off পেরিয়ে গেলে `null`** — ঘড়িই দেখায় না। কালকের জন্য নতুন
করে গোনা শুরু হয় না: ফুরিয়ে যাওয়া প্রতিশ্রুতি তুলে নেওয়াই সৎ।

### Admin

`CraftEditor.tsx` — `BundleEditor`-এর মতোই এক component, দুই জায়গা।

- **Icon বাছাই, লেখা নয়** — না চেনা নাম storefront-এ neutral tick হয়ে যেত,
  আর মালিক কখনো বুঝতেন না কেন।
- ⚠️ **তালিকার প্রতিটা নাম দুই icon set-এই আছে।** Admin আর storefront আলাদা
  copy রাখে (৩০ জুলাই ঠিক হয়েছে — ২০টা path-এর জন্য workspace package নয়)।
  এক দিকে থাকা নাম website-এ ঠিক আঁকত আর admin-এ ফাঁকা। `sun` আর `store`
  craft-এর জন্য সবচেয়ে মানানসই, কিন্তু ওগুলো শুধু storefront-এ — admin-এর
  `Icon.tsx`-এ যোগ করাই আসল সমাধান, আলাদা কাজ।
- **সর্বোচ্চ তিনটা** — storefront তিনটার সারিতে আঁকে, চতুর্থটা নিচে নেমে
  ভুলের মতো দেখায়।
- **অসম্পূর্ণ card website-এ যায় না**, আর সেটা row-এর নিচেই লেখা থাকে।

---

## ১৩. Offers strip · Live orders counter — 31 Jul

**কোনো migration লাগেনি** — দুটোরই data আগে থেকে ছিল, storefront শুধু
জিজ্ঞেস করত না।

### Offers — দেখায়, বসায় না

⚠️ **এই endpoint offer দেখায়, প্রয়োগ করে না।** এই page-এর কোনো দাম এখান
থেকে নড়ে না। কোন offer জিতবে, stack হবে কি না, শেষে কত কমবে — সেটা
Marketing-এর নিয়ম (`combinable`, `priority`, `minSpendPaisa`,
`perCustomerLimit`) আর সেটা checkout-এ **একবার** হয়। এখানে দ্বিতীয় একটা
হিসাব লিখলে দুটো উত্তর হত, আর ক্রেতা দুটোই দেখত।

**যা বাদ যায়:**

- `approved` নয় এমন সব — draft একটা ভাবনা, offer নয়; আর `pending_approval`
  আছেই কারণ কেউ এখনো রাজি হয়নি
- তারিখের বাইরে — জুলাইয়ে Valentine's
- **ক্রেতার জন্য লেখা নেই এমন সব।** `name` হলো **ভেতরের** নাম
  ("BK cashback Q3 - margin test")। `benefitLine` খালি বলে সেটা ছাপানোই হলো
  ভেতরের নোট ক্রেতার কাছে পৌঁছানোর পথ।

**Brand badge code-এ, admin-এ নয়** — bKash-এর গোলাপি bKash-এর, Radian-এর
কারো বেছে নেওয়ার জিনিস নয়। যে payment method-এর badge নেই, সেটা দোকানের
নিজের বেগুনি পায় — সৎ, কারণ ওটা Radian-এরই offer।

**কিছু চলমান না থাকলে strip-টাই থাকে না।** "Offers Available · 0 running"
লেখা বাক্স খোলার আমন্ত্রণ জানায়, ভেতরে কিছু না থাকা সত্ত্বেও।

⚠️ **Fallback নেই, craft-এর মতো নয়।** ফুল কীভাবে মোড়ানো হয় সেই বাসি বাক্যে
কারো ক্ষতি নেই; **যে cashback দোকান আসলে দিচ্ছে না** সেটা দেখালে bKash-এ
৳300 ফেরতের আশায় টাকা দেওয়া একজন ক্রেতা হারায়।

Admin ইতিমধ্যে আছে — Marketing → Offers। নতুন কিছু বানাতে হয়নি।

### "214 orders this month" — এখন সত্যি

⚠️ ৭১টা product-এই সংখ্যাটা হাতে লেখা ছিল, আর কখনো নড়ত না। এখন গত ৩০ দিনের
আসল `OrderLine` গোনা হয়।

**Cancelled order গোনা হয় না** — বাতিল হওয়া order কেউ জিনিসটা চেয়েছিল তার
প্রমাণ নয়, বরং প্রায়ই উল্টোটা।

**১০-এর নিচে হলে `null`, লাইনটাই ওঠে।** লজ্জা নয়: product-এর নিচে
"3 orders this month" লেখা থাকলে সেটা **কেনার বিপক্ষে যুক্তি**, আর দোকানের
নিজের page সেই কাজটা করবে না। ১০-এর উপরে সংখ্যাটা হুবহু, কখনো বাড়িয়ে নয়।

---

## ১৪. Cross-sell rail — 31 Jul

Coworker-এর `catalog.ts` এসে গেছে, তাই §৮-এর ১ নম্বর নির্ভরতা মিটেছে।

**Card তাদের builder-ই বানায়।** `ShopCatalogService`-এ একটা public
`cardsByIds()` যোগ করা হয়েছে আর module থেকে service export করা হয়েছে —
মোট ১৫ লাইন। `CARD_SELECT` আর `toCard` এখানে copy করলে দুটো card shape হত,
আর যেদিন একটায় rating বা badge অন্যভাবে দেখাত, একই product দোকানের দুই
page-এ দুই রকম দেখাত।

`crossSlugs` (string) বাদ, `crossSell` (পূর্ণ card) এসেছে। Slug পাঠানো মানে
storefront-কে কোথাও খুঁজতে পাঠানো, আর সে খুঁজত mock catalogue-এ — ঠিক যে
জায়গায় তাকানো নিষেধ।

⚠️ **খালি আসতে পারে, এবং সেটা ঠিক আছে।** শুধু ফুল বিক্রি হয় এমন দোকানে
অন্য category নেই। তখন rail-টা আঁকাই হয় না — নিয়ম শিথিল করে আরও ছয়টা তোড়া
দেখানোর চেয়ে ভালো, কারণ সেটা কেনার সিদ্ধান্তকে আবার ঘোরাঘুরিতে ফিরিয়ে দেয়।

---

## ১৫. বাকি তিনটা — একটাই কাজ, আর সেটা এই pass-এর বাইরে

Add-ons · Personalisation · Add to Cart — তিনটে আলাদা section, কিন্তু একটাই
নির্ভরতা: **cart**।

**Storefront audit-এর ৪ নম্বর নিয়ম** (৩০ জুলাই, মালিকের সম্মতিতে): cart,
checkout, account আর tracking এই audit-এর বাইরে — কারণ ওখানে যা নেই তা
field নয়, **business rule**, আর `build_status.md`-এ Ecommerce **locked নয়**।

কাজটা দুই ভাগে ভাগ হয়, আর ভাগটা জরুরি:

| ভাগ | কী | আটকানো? |
|---|---|---|
| **পড়া** | cart product আর add-on-এর দাম API থেকে নেবে (এখন mock) | না — এটা storefront connection, নতুন নিয়ম নয় |
| **লেখা** | order বসানো, advance, zone, slot, offer প্রয়োগ, stock | **হ্যাঁ** — architecture project-এ Ecommerce lock না হওয়া পর্যন্ত নয় |

**"পড়া" অংশটা করলেই Add-ons খুলে যায়।** এখন cart line-এর দাম
`_data/productDetails.ts`-এর `getAddon()` থেকে আসে; database-এর add-on
সেখানে নেই, তাই সেটা চুপচাপ **cart থেকে বাদ পড়ে** — গ্রাহক gift wrap বেছে
নেয়, cart-এ গিয়ে দেখে নেই। তাই PDP-তে add-on দেখানো হচ্ছে না।

⚠️ **Personalisation "পড়া" দিয়ে খোলে না।** ছবিটা order-এর সাথে দোকানে
পৌঁছাতে হবে — সেটা লেখার পথ, আর সেটা locked নয়। PDP-তে ঘরটা বানিয়ে রাখা
মানে গ্রাহকের দেওয়া ছবি কোথাও না পৌঁছানো।

### ১৫ক · "পড়া" অংশ — done, 31 Jul (মালিকের অনুমোদনে)

`resolveCart()` এখন **async**, ঠিক যেমনটা ফাইলটার নিজের header ১৪ জুলাই
লিখে রেখেছিল: *"getProductDetail() যেদিন fetch() হবে, এই function async
হবে। component-এর shape বদলাবে না।"* Component যা **পায়** তার কিছুই
বদলায়নি; দুটো component (`CartView`, `CheckoutView`) শুধু **চাওয়ার**
ধরন বদলেছে — `useMemo` থেকে effect-এ fetch।

**নতুন endpoint:** `GET /shop/addons?ids=` । কেন আলাদা, যখন product page
add-on এমনিতেই ফেরত দেয় — cart-এ চারটে আলাদা product-এর add-on থাকতে পারে,
তাই প্রতিটার page আবার চাওয়া মানে একটা সংখ্যার জন্য চারটে request। **পুরো
cart-এর add-on এক request-এ**, কারণ একই greeting card তিনটে line-এ থাকলে
তিন জায়গায় একই দাম হতেই হবে।

**Inactive/deleted add-on-ও resolve হয়, ইচ্ছাকৃত।** এক ঘণ্টা আগে gift wrap
যোগ করা ক্রেতা cart-এ সেটা দামসহ দেখবে, চোখের সামনে উধাও হতে দেখবে না।
এখনো **কেনা** যাবে কি না সেটা checkout-এর প্রশ্ন, আর উত্তরটা ওখানেই।

**তিনটে race guard** — cart, checkout আর cross-sell তিনটেতেই। Zone দ্রুত
দুবার বদলালে দুটো request চলতে থাকে; guard ছাড়া ধীরটা শেষে পৌঁছে **সঠিক
মোটের উপর ভুল মোট** এঁকে দিত। Checkout-এ সেটা মানে যে টাকা একজন দিতে
যাচ্ছে সেটাই বদলে যাওয়া।

**Cart-এর cross-sell rail-ও mock ছাড়ল।** আগে দোকানে নেই এমন চারটে চকলেট
box দেখাত — **"Add" বোতাম সহ, যেটা কাজও করত**। এখন দুবার fetch করে:
প্রথমে সস্তা candidate, তারপর প্রতিটার detail — কারণ এই rail-এর প্রতিশ্রুতি
**এক tap**, তাই card-এ লেখা দামটাই cart-এ বসতে হবে। Size id এখন
database-এর, তাই `"std"` অনুমান করলে যা যোগ হত তার দাম ক্রেতার সদ্য পড়া
সংখ্যার সাথে চুপচাপ মিলত না।

**Undo bar-ও mock ছাড়ল** — এই page-এর শেষ জায়গা যেটা mock catalogue ছুঁত।
Admin-এ বানানো যেকোনো product মুছলে সেটা "Item" বলত। এখন cart যেসব নাম
দেখেছে সেগুলো মনে রাখে।

⚠️ **যা ছোঁয়া হয়নি:** order বসানো। `buildOrder`, advance, zone rule, slot,
offer প্রয়োগ, stock — সব আগের মতোই। Ecommerce lock না হওয়া পর্যন্ত ওগুলো
architecture project-এর কাজ, এই ফাইলের নয়।

---

## ১৬. প্রথম আসল product — 1 Aug, নিজে publish করে যাচাই

মালিক দুবার product publish করতে গিয়ে **"Internal server error"** পেয়েছেন।
দুবারই আমি অনুমান করে কারণ বলেছি, দুবারই ভুল। তৃতীয়বার log নিজে তুলে,
নিজে product বানিয়ে, নিজে publish করে দেখা হয়েছে।

**তিনটে আলাদা ভুল, একটার পিছনে আরেকটা লুকিয়ে ছিল।**

### ক · `VariantValue` soft-delete তালিকায় ছিল না

মালিক product-এ **রঙ** বেছেছিলেন। `validateRefs()` তখন
`variantValue.findFirst()` ডাকে, আর extension সেখানে `deletedAt: null`
বসিয়ে দেয় — কিন্তু ওই table-এ ওই column নেই। Prisma: *Unknown argument
`deletedAt`*।

⚠️ **এই একই ভুল ওই ফাইলে ছয়বার হয়েছে**, প্রতিবার comment-এ "REV-RTN-4-এর
শিক্ষা, আবার" লেখা হয়েছে। ফাইলটার ভেতরেই লেখা ছিল *"এই তালিকা হাতে ঠিক
রাখা যায় না"*।

**তাই নাম যোগ করেই ছাড়া হয়নি।** তালিকাটা এখন `Prisma.dmmf` থেকে **নিজে
গোনা হয়** — যে model-এ `deletedAt` নেই, filter তার উপরে বসেই না। হাতে লেখা
তালিকাটা রয়ে গেছে, কিন্তু সেটা আর কিছু নিয়ন্ত্রণ করে না; প্রতিটা এন্ট্রি
এখন শুধু **কেন** সেই table-টা আলাদা, তা ব্যাখ্যা করে। সপ্তম বার আর হবে না।

### খ · সংশোধন file-এ ছিল, চলছিল না

⚠️ **`radian_apply.bat` API উঠে গেছে বলে ঘোষণা করে compile শেষ হওয়ার আগেই।**
Log-এ পরিষ্কার:

```
7:21:17  Nest application successfully started
7:21:27  Found 0 errors. Watching for file changes.
```

API পুরনো code নিয়ে **দশ সেকেন্ড আগে** উঠে গিয়েছিল, আর নতুন compile শেষ
হওয়ার পর সেটা আর load হয়নি। তাই সংশোধন করা সত্ত্বেও একই ভুল চলছিল, আর
আমি ভাবছিলাম আমার সংশোধনই কাজ করেনি।

**এখনো খোলা:** script-টা প্রথম উত্তর পেলেই থেমে যায়, compile শেষ হওয়ার
জন্য অপেক্ষা করে না। Code বদলের পর **দুবার** restart লাগে। এটা আলাদা করে
ঠিক করার জিনিস — আজ ছোঁয়া হয়নি, কারণ চালু script ভাঙার ঝুঁকি নেওয়া হয়নি।

### গ · Size-এর guard শুধু একটা পথে বসানো ছিল

৩১ জুলাই "সাদা পর্দার bug" ঠিক করেছিলাম — কিন্তু guard বসেছিল শুধু **mock**
`getProductDetail()`-এ। `fetchProductDetail()` — অর্থাৎ database-এর পথ —
guard ছাড়াই ছিল।

Size ছাড়া একটা product publish করার সাথে সাথেই তার page **"Something went
wrong"**। ঠিক যে জিনিসটা ঠেকানোর জন্য guard লেখা, সেটাই ঘটল, কারণ দুটো
পথের একটায় বসানো হয়েছিল। `guard()` এখন export করা, দুটো পথই এর ভেতর দিয়ে যায়।

### ঘ · দুটো display ভুল, একই ধরনের

- **"0% OFF" sticker** — ছবির উপরে গোলাপি ব্যাজে। কাটা দাম gate করেছিলাম,
  sticker-টা ভুলে গিয়েছিলাম।
- **`--:--:--` ঘড়ি** — cut-off না থাকলেও হলুদ বাক্সটা দাঁড়িয়ে থাকত, পাশে
  *"at their door by 6:00 PM today"* — একটা প্রতিশ্রুতি যার পেছনে কোনো
  সময় নেই।

দুটোই এখন ছাড়/ঘড়ি না থাকলে **সম্পূর্ণ উঠে যায়**।

### যা এখনো লিখে রাখা দরকার

⚠️ **Countdown-এর বাক্যে "6:00 PM" এখনো code-এ লেখা।** Server যে মিনিট
পাঠায় সেটা সঠিক, কিন্তু বাক্যের ঘণ্টাটা নয় — `DeliveryMethod`-এর label
থেকে আনতে হবে।

⚠️ **Trust badge fallback-এ "4.9 on Google · 412 real reviews"।** Product-এ
নিজের badge না থাকলে template-এরটা বসে, আর ওই সংখ্যা দুটো বানানো। শপ-কপি
হিসেবে ছাড় দেওয়া হয়েছিল, কিন্তু এটা একটা **নির্দিষ্ট দাবি** — §৩গ বন্ধ
করার সময় এটাই প্রথমে যাওয়া উচিত।

**যাচাই:** `Velvet Red — 24 Premium Roses` (Deep Red, ৳2,400) admin-এ
publish হয়েছে, আর storefront-এ পুরো page render হয়েছে — breadcrumb, নাম,
দাম, delivery chip, nature line, trust, spec, craft, FAQ, CTA। Review নেই
বলে রেটিং লাইন নেই; ছাড় নেই বলে কাটা দাম নেই। দুটোই ঠিক আচরণ।

---

## ১৭. ছবি ও তথ্য হারিয়ে যাওয়া — 1 Aug

মালিকের তিনটে অভিযোগ, তিনটেই সত্যি, আর তিনটেরই মূল একটাই।

### ক · ছবি upload হয়, save হয় না

`addPhotos()` ৩০ জুলাই থেকেই ঠিক কাজ করছিল — file media store-এ যায়,
ফেরত আসা address `photos`-এ বসে, strip-এ দেখা যায়। **কিন্তু `buildDto()`
কখনো `images` পাঠাত না।** Address গুলো এই screen ছেড়ে বেরই হত না।

একই ভাবে **sizes · specRows · faqs · trustBadges** — প্রত্যেকটার card আছে,
editor আছে, state আছে, আর কোনোটাই database পর্যন্ত পৌঁছাত না।

⚠️ API-তে `buildCreateData` প্রথম দিন থেকেই এই পাঁচটা সামলায়;
**`buildUpdateData` কখনো ছোঁয়নি।** তাই পাঠালেও update-এ কিছু হত না।
`replaceChildren()` যোগ করা হয়েছে — soft delete করে নতুন list বসায়,
কারণ cart বা order line এখনো পুরনো size id ধরে থাকতে পারে।

`undefined` = "এই screen ওই list সম্পাদনা করছে না", ছোঁয়া হয় না।
খালি **array** = "মালিক সব মুছে দিয়েছেন", মানা হয়। দুটোকে এক ধরলে প্রতিটা
আংশিক save বাকি সব মুছে দিত।

### খ · পুরনো product খুললে সব তথ্য উধাও

⚠️ **সবচেয়ে গুরুতর, কারণ এটা শুধু দেখতে ভুল ছিল না — এটা data মুছত।**

Editor-এর প্রতিটা state `src` থেকে শুরু হয় — `src` হলো **mock তালিকা**।
৭১টা demo slug-এ সেটা ভরে যেত, কিছু চোখে পড়ত না। Admin-এ বানানো product-এ
`src` undefined — তাই নাম, দাম, stock, delivery tick, ছবি, প্রতিটা child
list **খালি অবস্থায়** খুলত, আর Publish চাপলে সেই খালিগুলোই আসল product-এর
উপর লিখে দিত। মালিকের ভাষায় হুবহু: "পুরনো product edit-এ গেলে তার title
সহ সব information চলে যায়।"

দুই জায়গায় ঠিক:

1. `getProductBySlug()` **list row ফেরত দিত**, আর list row-তে child list
   থাকে না। এখন list শুধু slug → id মেলায়, product আসে `GET /products/:id`
   থেকে — যেখানে সব আছে।
2. Load করার সময় **প্রতিটা field** database থেকে বসে, mock শুধু নতুন
   product-এর placeholder।

### গ · Gradient ছবি হিসেবে save হওয়ার ঝুঁকি

Mock-এর "ছবি" আসলে CSS gradient। সেগুলো `photos`-এ বসে থাকত, আর এখন
images পাঠানো শুরু হওয়ায় সেগুলোই image address হিসেবে জমা পড়ত —
storefront-এ ভাঙা image icon। `buildDto` এখন শুধু `http(s)` address পাঠায়।

### ঘ · ছবি save হলো, তবু দেখা গেল না

`gallery`-র প্রতিটা entry **CSS background value**, image address নয় —
page প্রতিটা tile আঁকে `style={{ background: … }}` দিয়ে। Gradient কাজ করত
কারণ gradient নিজেই একটা background; খালি URL নয়। তাই প্রথম আসল
ছবিগুলো ঠিকঠাক জমা হয়ে render-এ শূন্য হয়ে গেল। `productApi` এখন
`url(…)`-এ মুড়ে দেয় — seam-এ, ছয়টা component-কে দ্বিতীয় আকার শেখানোর বদলে।

সাথে: **"Product photo" লেখাটা** আসল ছবির উপরেও বসত। এখন শুধু ছবি না
থাকলে দেখায় — ওটা tinted panel-এর লেবেল, ছবির জলছাপ নয়।

**যাচাই:** মালিকের computer থেকে তিনটে ছবি upload করে
`Velvet Red — 24 Premium Roses` publish করা হয়েছে; storefront-এ তিনটে
thumbnail আর main image দুটোই আসছে, placeholder লেখা নেই।

---

## ১৮. Basics tab — মালিকের দুটো সংশোধন, 1 Aug

Admin-এর Basics tab নতুন করে সাজানোর পর মালিক দুটো জায়গায় ধরিয়ে দিলেন।
দুটোই ঠিক, আর দুটোই আমার উত্তর অসম্পূর্ণ ছিল বলে।

### D-PDP-06 · SKU — "কখনো যায় না" ভুল কথা

আমি লিখেছিলাম *"staff-facing, never sent to the website"*। মালিক:
**"Google-এ তো পাঠাতে হতে পারে — data layer দিয়ে data পাঠালে SKU দিয়েই যাবে।"**

সঠিক। Merchant Center feed, page-এর `Product` JSON-LD, analytics-এর
`item_id` — তিনটেতেই SKU-ই সেই পরিচয় যেটা ওরা আশা করে। ছাড়া, নাম একটু
বদলালেই Google-এর কাছে সেটা **নতুন product** হয়ে যায়।

**নিয়মটা তাই "যায় না" নয়:**

> SKU **যন্ত্রের পড়ার data**-তে যেতে পারে।
> SKU কখনো **page-এ দৃশ্যমান লেখা** হিসেবে ছাপা হয় না।

এই payload page আঁকে, তাই এখানে নেই। Feed আর JSON-LD যখন বানানো হবে,
তাদের নিজস্ব surface-এ SKU নাম ধরে লেখা থাকবে। **`costPaisa`-র এমন কোনো
ব্যতিক্রম নেই** — ওটা সত্যিই কখনো নয়।

Admin-এর chip বদলেছে: "Staff only" → **"Not on the page"**।

### D-PDP-07 · Selling unit — connect না করার কোনো কারণ ছিল না

মালিক: **"এটা দেখানোর জায়গা আছে কি? না থাকলে connect করোনি কেন?"**

জায়গা আছে, আর সবসময়ই ছিল। `Unit.shortCode`-এর নিজের schema comment-এ
Item module লেখার দিন থেকেই লেখা: *"storefront suffix + packing slip"*।
Packing slip-এর অর্ধেক বানানো হয়েছিল, storefront-এর অর্ধেক হয়নি। আমি
"বানানো হয়নি"-কে "দেখানোর জায়গা নেই" বলে চালিয়ে দিয়েছিলাম — ওটা ব্যাখ্যা
ছিল না, অজুহাত ছিল।

এখন দামের পাশে ছোট করে বসে: **৳2,400 / stick**।

**খালি রাখলে কিছুই দেখায় না, আর সেটাই বেশির ভাগ product-এ ঠিক** — তোড়ার
গায়ে "per piece" কিছুই বোঝায় না, গোলাপের গায়ে "per stick" গোটা দামটাই
বুঝিয়ে দেয়। Chip এখন সবুজ: **"After the price"**।

### Basics tab-এর design — locked

তিনটে card: **কী নামে ডাকা হবে → দোকানের কোথায় বসবে → কীভাবে বিক্রি হবে**।

- প্রতিটা ঘরের পাশে **কোথায় যায়** chip; ব্যাখ্যা chip-এর ভেতরে (hover),
  ঘরের নিচে নয় — *সবসময় দেখা যাওয়া ব্যাখ্যা একবার পড়ার পর আসবাব হয়ে যায়।*
- **সমান দুই কলাম** (`pairCls`), auto-fit নয় — ভাঙা শেষ সারিই "হিজিবিজি"
  লাগার আসল কারণ ছিল।
- **Seg এখন লেখার সমান চওড়া** (`self-start w-fit`)। `Field` একটা flex
  column, তাই `inline-flex`-ও প্রসারিত হত — দুই শব্দের toggle পুরো card
  জুড়ে বসে থাকত। এই এক লাইনে admin-এর **সব** toggle ঠিক হয়েছে।
- প্রতিটা tab-এর নিচে **Back / Next**, next-এ পরের tab-এর নাম লেখা।
  পাশের menu sticky হওয়ায় লম্বা section-এ সেটা নাগালের বাইরে চলে যেত।

---

## ১৯. D-PDP-08 · Stock — দেখানো OFF-এ শুরু হবে

**মালিকের নির্দেশ, 1 Aug:** *"tracking inventory সবসময় off থাকবে, শুধু হাতে
on করার option থাকবে — এখন সবসময় আগে থেকে on হয়ে থাকে।"*

`showStock` ছিল `useState(true)`। মানে **যত product কখনো বানানো হয়েছে,
প্রত্যেকটাই নিজের গুনতি সংখ্যা customer-কে বলে দিত** — যদি না কেউ মনে করে
বন্ধ করত।

"মাত্র ৩টা বাকি" — আপনি যখন **চান** তখন এটা বিক্রির হাতিয়ার, আর যখন চান না
তখন লজ্জার। আর page-এর একমাত্র সংখ্যা যেটা **কেউ কিছু না লিখলেও বদলায়**।
এত জোরালো দাবি প্রতি product-এ ইচ্ছে করে চালু করার জিনিস, শুরুর অবস্থা নয়।

**`TRACKED` mode এখন disabled**, শুধু unselected নয়। Inventory module সেটার
মালিক আর সেটা এখনো বানানো হয়নি — বেছে নিলে এমন একটা mode জমা পড়ত যেটা
কেউ মানে না, আর গুনতিটা তখন এমন সংখ্যা যা কেউ রক্ষণাবেক্ষণ করে না।
"coming later" লেখা আছে, যাতে **আসছে** বোঝায়, **নেই** নয়।

---

## ২০. Tracked stock → Item → Vendor — 1 Aug

**মালিকের নির্দেশ:** Manual হলে সংখ্যা হাতে; Tracked হলে **Item চাইবে**, আর
Item দিলে system নিজেই inventory-র সাথে জুড়ে দেবে। Vendor-এর product হলে
vendor-ও ওখান থেকেই আসবে — কারণ অর্ডার এলে vendor-কে WhatsApp/SMS যাবে।

⚠️ **আমি বলেছিলাম "Inventory module বানানো হয়নি" — সেটা ভুল ছিল।** পুরনো
ফাইল পড়ে দেখা গেল Item, Inventory, Warehouse, Supplier — সব migrate করা,
আর `GET /inventory/item-stock/:itemId` endpoint-ও আছে। মালিকের স্মৃতিই ঠিক।

### যা আগেই lock করা ছিল

- **DEC-ITM-002** — এক Product ঠিক এক Item-এ resolve করে (`Product.itemId`)
- **DEC-ITM-021** — **দুটো SKU, ইচ্ছাকৃত।** `Item.sku` = গুদামের কোড
  (Inventory, Purchase); `Product.sku` = ecommerce কোড (storefront, data
  layer, Google)। জোড়া লাগে `itemId` FK দিয়ে, **কখনো SKU-র লেখা মিলিয়ে নয়**
- **DEC-SUP-003** — vendor-কে বার্তা: *"আপনার product X, qty Y, কখন লাগবে"*,
  **গ্রাহকের কোনো তথ্য কখনো নয় (SUP-R07)**
- **DEC-SUP-004** — `Item.supplierId`; মালিক এটা "website-এ vendor product
  চিহ্নিত করার জন্য" তখনই বসাতে বলেছিলেন
- **PENDING G1** — *"Product editor-এ 'এটা আমাদের নাকি supplier-এর'"* —
  আজকের কাজটা ওই তালিকায় নাম ধরে বসে ছিল

### D-PDP-09 · Vendor আলাদা করে বাছা হয় না

মালিক বলেছিলেন *"vendor-এর product হলে vendor-এর নাম দিয়ে select করব"*।

**Item বাছলেই vendor সাথে আসে** — সে `Item.supplierId`-এ বসে আছে। Product-এ
আবার জিজ্ঞেস করলে "কে সরবরাহ করে" দুই জায়গায় থাকত, আর একদিন দুটো আলাদা
হয়ে যেত। Editor তাই vendor **দেখায়**, চায় না।

### যা বানানো হলো

- `Product.itemId` DTO-তে, create ও update দুটোতেই, আর **অস্তিত্ব যাচাই** —
  ঝুলন্ত link মানে "tracked" লেখা একটা listing যেটা কেউ গোনে না
- `FULL_INCLUDE`-এ `item` + তার `supplier` (নাম, nickname, notifyChannel,
  notifyMode, leadTimeHours)। **`Item.costPaisa` আর recipe বাদ** — এটা
  product screen, গুদাম নয়
- Admin: TRACKED হলে সংখ্যার ঘর উঠে যায়, **Item খোঁজার ঘর** আসে (server-এ
  search, debounced)। বাছার পর: গুদামের কোড, **এখন কত আছে** (পড়া, লেখা নয়),
  আর vendor থাকলে **badge + কত ঘণ্টা আগে জানাতে হবে**
- MANUAL-এ ফিরলে `itemId` **null** হয়ে যায় — কেউ যেন এমন stock-এর দিকে
  তাকিয়ে না থাকে যা আর পড়া হচ্ছে না

⚠️ **যা বানানো যায়নি, এবং কেন:** অর্ডার এলে **নিজে থেকে** বার্তা পাঠানো।
SMS/WhatsApp gateway নেই (PENDING F11)। Screen-এ সেটা লেখা আছে — vendor-কে
এখনো supplier page থেকে হাতে বার্তা পাঠাতে হবে। Vendor product-এ
**stock-skip** নিয়মও F11-এ, ওটা Sales flow-এর অংশ।

### D-PDP-10 · Stock দেখানো — সংখ্যা সবসময়, সুর বদলায়

মালিক: *"switch চালু করলে **আমি যে সংখ্যা দিই সেটাই** দেখাবে, কিন্তু ৫-১০-এর
নিচে নামলে customer-কে warn করবে।"*

আমি প্রথমে করেছিলাম **শুধু কম হলে দেখাবে** — ভুল। Switch চালু করার মানেই
সংখ্যাটা দেখানো; নাহলে ৩০টা থাকা অবস্থায় switch অন থাকলেও page চুপ, আর
মালিক ভাবতেন কাজ করছে না।

**এখন:** `30 in stock` (শান্ত সবুজ) → **৫ বা তার কম হলে** `Only 3 left`
(জরুরি হলুদ, বিন্দু জ্বলে)। একই তথ্য, দুই স্বর — ৩০টা থাকা একটা **তথ্য**,
৩টা থাকা একটা **তাড়া**।

`LOW_STOCK = 5` — admin-এর নিজের Low-stock তালিকাও এই সংখ্যাই ব্যবহার করে,
তাই দোকান যেটাকে "কম" বলে আর ক্রেতা যা দেখে, দুটো এক থাকে।

### D-PDP-11 · Item link Tracked-এর ভেতরে ছিল — আমার নিজের ভুল

মালিক দুবার বললেন *"vendor product select করার option পেলাম না"*। কারণ
আমি Item বাছার ঘরটা **TRACKED mode-এর ভেতরে** রেখেছিলাম।

⚠️ **সেটা আমার আবিষ্কার, কোনো সিদ্ধান্ত নয়।** DEC-ITM-002 বলে *"every
Product resolves to exactly ONE Item"* — **সবসময়**, কখনো কখনো নয়।

আর ভুলটা ঠিক সেখানেই সবচেয়ে ক্ষতিকর যেখানে জিনিসটা সবচেয়ে দরকার:
**vendor product-এ Radian-এর কোনো stock থাকেই না** (vendor অর্ডার পেলে
বানায়), তাই মালিক ওটাতে কখনোই Tracked বাছতেন না — আর vendor-এর জোড়াটা
ঠিক ওই switch-এর পিছনেই লুকানো ছিল।

**এখন Item link নিজের card**, সবসময় দেখা যায়:
*"What is it, in the stockroom"*। Stock mode তার নিচে আলাদা প্রশ্ন — সংখ্যা
হাতে লেখা হবে না গুদাম থেকে পড়া হবে।

`itemId` এখন **stock mode নির্বিশেষে** পাঠানো হয়। আগে TRACKED ছাড়া null
করে দেওয়া হত, অর্থাৎ Manual-এ রাখলেই vendor-এর জোড়া চুপচাপ খুলে যেত।

### দরজাটা ছিল, সাইনবোর্ড ছিল না

Vendor product বানানোর পথ তিনটে screen জুড়ে ছিল, কোথাও লেখা ছিল না।
যোগ হলো: Item খোঁজার পাশে **"New item"** বোতাম (product-এর নাম নিয়ে যায়,
`?name=`), কিছু না মিললে Suppliers-এ যাওয়ার পথ লেখা, আর **product
তালিকায় vendor badge** — PENDING **G1** এতে বন্ধ।

---

⚠️ **নতুন খোলা প্রশ্ন:** size বদলালে ছাড় কীভাবে বসবে? এখন base দামের
অনুপাত size-এ বসছে (২০% ছাড় মানে Large-এও ২০%)। প্রতি size-এ আলাদা MRP-র
ঘর schema-তে নেই। মালিক size-ভিত্তিক আলাদা ছাড় চাইলে সেটা নতুন সিদ্ধান্ত।

---

## ২১. যাচাই pass — 1 Aug 2026

মালিক বললেন: "যে কাজ এখন করসো সব চেক করে দেখো ঠিক আছে কিনা।" তাই এই pass-এ
নতুন কিছু বানানো হয়নি — শুধু যা বানানো হয়েছে তা সত্যিই চলে কিনা দেখা হয়েছে।

### যা সবুজ

| যাচাই | ফল |
| --- | --- |
| `apps/web` টাইপ-চেক | clean |
| `apps/api` টাইপ-চেক | clean |
| ছোঁয়া ৯টা admin component parse | clean |
| schema ↔ migration মিল (script) | প্রতিটা model-এর CREATE TABLE আছে; `Product.supplierId/displayQty/makeMinutes`, `Category.capacityGroupId/sizeLabel` দুই জায়গাতেই আছে |
| soft-delete-এর derived guard | আছে — `deletedAt` কলাম নেই এমন model (যেমন `CapacityBooking`) নিজে থেকেই বাদ পড়ে |
| API চালু | `Found 0 errors`, 2:34 PM |
| `/products/capacity` | দুই team live — cake ৫ × ৮ঘ = ৪০ঘ, florist ১০ × ১২ঘ = ১২০ঘ |
| Product editor-এর section switching | কাজ করে (Basics → Stock & lead time → Next/Back footer) |
| `GET /shop/products/:slug` | সত্যিকারের নাম, দাম, তিনটা upload করা ছবি, breadcrumb — সবই DB থেকে |
| Web PDP | ওই সব ডেটা এঁকে দেখাচ্ছে; নকল badge, নকল countdown, watermark — কিছু নেই |

### যা লাল ছিল, এই pass-এ সারানো হলো

**১. "Show a different number" ঘরটা কিছুই করত না।**
`Product.displayQty` admin থেকে **সেভ হচ্ছিল**, কিন্তু `product-detail.ts`
website-এ পাঠাচ্ছিল `stockQty` — মানে গুদামের আসল সংখ্যা। মালিক ২০ লিখলেও
site দেখাত ৫,০০০। ঘরটা চুপচাপ ফেলে দেওয়া হচ্ছিল আর জানার কোনো উপায় ছিল না।

```ts
// আগে
stockQty: p.showStock ? p.stockQty : null,
// এখন — খালি (null) মানে এখনো "আসলটাই দেখাও"
stockQty: p.showStock ? (p.displayQty ?? p.stockQty) : null,
```

**২. Stock switch-এর নিচের preview লাইনটা দুই জায়গায় মিথ্যা বলত।**
`stock || 30` লেখা ছিল, তাই ০ stock-এ লিখত `"0 in stock"` — কিন্তু website
১-এর নিচে কোনো badge-ই দেখায় না। আর `displayQty` ধরত না। এখন লাইনটা
website-এর তিনটা শাখাই হুবহু চালায়: ০ → badge নেই · ১–৫ → `"Only n left"` ·
৬+ → `"n in stock"`।

### খোলা প্রশ্ন — এটা business rule, তাই মালিকের সিদ্ধান্ত

`stockMode = MANUAL` আর stock = ০ হলে **product এখনো পুরো কেনা যায়** —
Add to Cart, Buy Now, সব চালু। Bundle-এর ভেতরে থাকলে সেটা বাদ পড়ে
(৩১ জুলাইয়ের নিয়ম), কিন্তু নিজের page-এ কোনো বাধা নেই।

তিনটা পথ আছে, তিনটাই বৈধ:

1. **বিক্রি বন্ধ** — "Out of stock", cart button নিষ্ক্রিয়।
2. **নেওয়া হোক** — capacity-র মতোই। মালিক capacity নিয়ে বলেছিলেন
   "order blocked হবে না, next slot দেখাও"। stock-ও তাই হতে পারে।
3. **নাও, কিন্তু বলো** — কেনা যাবে, তবে "এটা বানিয়ে পাঠাতে ২ দিন" ধরনের
   সৎ লাইনসহ।

মালিক না বলা পর্যন্ত কিছু বসানো হবে না।

---

## ২২. DEC-PDP-09 — মজুদ শূন্য হলে বিক্রি বন্ধ, 1 Aug 2026

মালিকের কথা, হুবহু: **"stock 0 হলে order দেওয়া যাবে না। হয় stock out আসবে,
বা pre-order আসবে।"**

### তিনটা প্রশ্নের উত্তর

| প্রশ্ন | সিদ্ধান্ত |
| --- | --- |
| কে ঠিক করবে stock out না pre-order | **প্রতি product-এ মালিক নিজে**। product type থেকে আন্দাজ নয় — তাজা ফুল কখনো pre-order নয়, কিন্তু একই READYMADE ঘরে বসা mug হতে পারে |
| Pre-order-এ টাকা | **product-এর নিজের `advanceRequired`ই চলে**। আলাদা কোনো pre-order payment নিয়ম নেই, তাই দুটো নিয়ম মিলিয়ে রাখার ঝামেলাও নেই |
| Pre-order-এ তারিখ | **মালিক নিজে লিখে দেন** — "Expected back on"। lead time থেকে হিসাব নয় |

### যা বসানো হলো

**Schema** (`20260801140000_sold_out_mode`)
`Product.soldOutMode` (`STOCK_OUT` default / `PRE_ORDER`) আর
`Product.preorderDate`। পুরনো সব সারি নিরাপদ দিকেই যায়।

**নিয়মটা একটাই function** — `src/common/availability.ts`।
`shop/product-detail.ts`-এ রাখা হয়নি: Sales-কেও এটা লাগে, আর order নেওয়ার
পথে একটা storefront controller টেনে আনা উল্টো কাজ। নিয়মটা pure, তাই কারো
নয় — `common/`-এ থাকে।

```ts
const counted = p.stockMode === 'MANUAL' && p.supplierId === null;
if (!counted || p.stockQty > 0) return { state: 'IN_STOCK' };
```

**গেট দুই জায়গায়, একই function পড়ে** — website (`availability` field) আর
`orders.service.ts` (`create` + `addLines`)। নিষ্ক্রিয় button ভদ্রতা, নিয়ম নয়;
endpoint-এ কেউ সরাসরি post করতে পারে, আর admin-এর order form একই দরজা দিয়ে
ঢোকে। **staff-ও ছাড় পায় না** — যে জিনিস নেই তার ফোন-order একই ভাঙা প্রতিশ্রুতি।

**যা গেটের বাইরে, ইচ্ছাকৃত:**
· **TRACKED** — আসল সংখ্যা Item module-এ, `Product.stockQty` ওদের জন্য সত্য নয়।
· **Vendor product** — আমাদের গুদামে ওদের কিছুই নেই, আমাদের সংখ্যা ওদের নিয়ে
কিছু বলে না।

**Website**
· `OUT_OF_STOCK` → CTA row-এর জায়গায় `SoldOut` panel। button ধূসর করা হয়নি —
নিষ্ক্রিয় button মানুষ চাপে, কিছু হয় না, আর তারা ভাবে site নষ্ট। panel সোজা
কথা বলে আর অন্য জায়গা দেখায়।
· `PRE_ORDER` → button "Buy Now" থেকে "Pre-order", উপরে সৎ লাইন, তারিখ থাকলে
তারিখ। "No payment until you confirm" লাইনটা তখন সরে যায় — টাকার নিয়ম
product-এর advance rule ঠিক করে, তাই page কোনো দিকেই প্রতিশ্রুতি দিতে পারে না।
· **mobile sticky bar আলাদা করে সামলানো হয়েছে** — ওটা scroll করে না, তাই শুধু
desktop CTA লুকালে out-of-stock product-এর উপরে একটা চালু "Buy Now" ভাসত।
· `addToCart`/`buyNow`-এও guard — cart line পরে সত্যিকারের order হয়।

**Admin** — Stock card-এর নিচে "When it runs out" (Stock out / Pre-order),
PRE_ORDER হলে "Expected back on" তারিখের ঘর। শুধু MANUAL + vendor নয় হলেই
দেখায়; যে প্রশ্নের সত্য উত্তর নেই সেটা না করাই ভালো।

⚠️ পার হয়ে যাওয়া তারিখ website-এ পাঠানো হয় না। মালিক নিজে তারিখ লেখা
বেছেছেন, আর তার সৎ খরচ হলো একদিন তারিখ বাসি হবে। আগস্টে "back on 12 July"
পড়ার চেয়ে চুপ থাকা ভালো। admin-ও এটা তখনই বলে দেয়।

### ⚠️ যা এখনো সারানো হয়নি — architecture project-এর কাজ

**১. গেটটা দেরিতে বন্ধ হয়।** DEC-MOD-003 অনুযায়ী stock কমে Delivery
Processing-এ, order confirm-এ নয়। তাই শেষ ১টা জিনিসে ১০টা confirm হওয়া order
বসে থাকলেও `stockQty` ১-ই দেখায় আর দশটাই গেট পার হয়।
প্রস্তাব (**অনুমোদিত নয়**): আলাদা `reservedQty` counter — confirm-এ বাড়ে,
delivery-তে কমে; নিয়মটা পড়বে `stockQty − reservedQty`। এতে DEC-MOD-003 ভাঙে
না, stock তখনো Delivery Processing-এই কমে। এটা Sales/Delivery-র পরিবর্তন।

**২. locked list-এর সাথে একটা অমিল।** সেখানে লেখা *"Display Scarcity Counter
… never derived from actual stock"*, কিন্তু আজকের `displayQty` ফাঁক সারানোয়
ঘরটা খালি থাকলে আসল stock-ই website-এ যায়। মালিককে জানানো হয়েছে;
architecture project-এ ঠিক না হওয়া পর্যন্ত কোড বদলানো হবে না।

**৩. Category/listing card-এ এখনো কিছু দেখায় না।** sold-out product তালিকায়
স্বাভাবিকভাবেই বসে থাকে, ঢোকার পর জানা যায়। এই pass product page-এর, তাই
card-এর কাজ ধরা হয়নি — কিন্তু ধরা দরকার।

---

## ২৩. Stock & lead time tab — day আর time আলাদা করা, 1 Aug 2026

মালিক: *"day and time-এর ঘর বোঝার উপায় নাই, কোনটা day আর কোনটা time"*, আর
tab-টা আবার এলোমেলো লাগছে।

দোষটা শব্দের ছিল না — দুটো প্রশ্নকে **একই পোশাক পরানো হয়েছিল**। দুটো খালি
number box, উপরে দুটো label, বাক্সের ভেতরে কিছুই বলে না কোনটা কী মাপে। দ্রুত
পড়লে "Minutes to make one" আর "Days to make it" একই আকৃতি। কেউ ৩ দিন ভেবে
minutes-এর ঘরে ৩ লিখলে পুরো workshop-এর হিসাব চুপচাপ ভুল হয়ে যেত।

### তিনটা নতুন building block

| | কাজ |
| --- | --- |
| `NumBox` | একক **বাক্সের ভেতরে** — `MIN` · `DAYS` · `PCS`। লেখা যায় না, সরে যায় না, না দেখে ভরা যায় না |
| `Measure` | একটা মাপের নিজস্ব frame, উপরে দুই শব্দের kicker — **WORKSHOP TIME** / **DELIVERY DATE** / **ON THE WEBSITE** / **AT ZERO**। সংখ্যা পড়ার আগেই কোন ঘড়ি সেটা বলা হয়ে যায় |
| `Says` | যা টাইপ করা হলো তার সোজা বাংলা ফল — সবুজ/হলুদ/সাদা |

Card-এর নাম "Made to order" → **"How long it takes"**। আগের নামটা শুধু প্রথম
অর্ধেক বোঝাত; দ্বিতীয় অর্ধেক (delivery date) যেকোনো অপেক্ষার ক্ষেত্রেই খাটে।

### Stock card পরিষ্কার করা

· **`pairCls` → flex।** দুই-কলামের grid তখনই ঠিক যখন নিশ্চিতভাবে দুটো field
থাকে। Tracked-এ "How many you have" চলে যায়, আর toggle অর্ধেক কলামে বসে
পাশে ফাঁকা অর্ধেক রেখে দিত — ওই ফাঁকটাই "অসম্পূর্ণ" অনুভূতির বড় অংশ।

· **ক্রম বদলানো হয়েছে।** "Show a different number"-এর full-width বাক্সটা
বসে ছিল **ওই switch-এর উপরে** যেটা ঠিক করে সংখ্যা আদৌ দেখানো হবে কিনা। মানে
form জিনিসটার অস্তিত্ব জিজ্ঞেস করার আগেই তার খুঁটিনাটি চাইত। এখন একটাই panel,
মানুষ যে ক্রমে ভাবে সেই ক্রমে: (১) সংখ্যা দেখাবেন কি না → (২) হ্যাঁ হলে আসলটা
না অন্যটা → (৩) page ঠিক কোন বাক্যটা ছাপবে। switch OFF থাকলে ধাপ ২ দেখায়ই না,
কারণ তখন ওটা কিছুই ঠিক করে না।

· `unit="shown"` → `unit="pcs"`। suffix একক বোঝায়, field-এর কাজ নয় —
"real SHOWN" দুটো শব্দ পরস্পরের সাথে লড়ছিল।

### ২৩ক. একই tab, দ্বিতীয় পাস — frame বাদ, text বাদ

মালিক: *"পুরা tab অনেক অনেক text, যা মোটেও ভালো লাগছে না… click করার পর
ডানপাশে এলোমেলো হয়ে যায়।"* দুটোই সত্যি, দুটোই আমার দোষ।

**১. অতিরিক্ত text।** প্রতিটা panel-এ kicker + title + ব্যাখ্যা + রঙিন result
box — একটা সংখ্যার জন্য চার টুকরা লেখা। ব্যাখ্যা `?` tooltip-এ থাকা উচিত,
যেখানে দরকার না হলে কোনো খরচ নেই। page-এ থাকবে শুধু **ফল**, এক লাইনে, আর সেটা
ব্যাখ্যার **জায়গায়** বসবে — নিচে যোগ হবে না।

**২. ডানপাশ লাফাত।** পুরনো row ছিল `justify-between` + `flex-wrap`, তাই
control কোথায় বসবে সেটা ঠিক করত পাশের বাক্যের দৈর্ঘ্য। সংখ্যা বদলালে বাক্য
বদলায়, বাক্য বদলালে control সরে যায়। এখন ডান কলাম **নির্দিষ্ট প্রস্থের**
(`w-[230px]`), text কখনো ঠেলতে পারে না। কাজ করার সময় control নড়লেই form
অস্থির লাগে।

`Measure` আর `Says` মুছে গেছে, একটাই `Row` এসেছে: বাঁয়ে নাম, ডানে control,
নিচে এক লাইন। দুই ঘড়ির kicker (**WORKSHOP TIME** / **DELIVERY DATE**) আর
বাক্সের ভেতরের একক (`MIN` · `DAYS` · `PCS`) থেকে গেছে — ওটাই আসল সমাধান ছিল,
frame নয়।

পুরো tab এখন পাঁচ স্ক্রিনের জায়গায় দুই স্ক্রিন।

---

## ২৪. Stock & lead time — কোন ঘর website-এ যায়, ঘর-বাক্স ঠিক করা

### দুটো আসল bug, দুটোই মালিক ধরেছেন

**১. Browser-এর নিজের spinner unit-এর উপরে বসে ছিল।** `type="number"` ডান
কিনারায় নিজের উপর-নিচ তীর আঁকে — ঠিক যেখানে unit label pin করা। দুটো
একটার উপর আরেকটা, তাই "MIN" তীরের ভেতর দিয়ে ছাপা হচ্ছিল। তীর দুটো মুছে
দেওয়া হয়েছে; যে সংখ্যা মানুষ টাইপ করে তার জন্য ওগুলো অকেজো।

**২. সংখ্যা আর একক বাক্সের দুই মাথায় ছিল।** বাঁয়ে "0", একশো pixel দূরে
"MIN" — ওটা একটা মান হিসেবে পড়ায় না, বাক্সে দুটো জিনিস হিসেবে পড়ায়। এখন
ডানে ঘেঁষা, পাশাপাশি — "0 min"।

⚠️ আর `pr-[62px]` কাজ করছিল না: `.ipt` `padding` shorthand দেয় এবং Tailwind-এর
**পরে** load হয়, তাই যেকোনো `pr-*` চুপচাপ বাতিল হয়ে যায় — মান তখন unit-এর
উপর দিয়ে ছাপা হয়ে "MIN0" পড়াচ্ছিল। `globals.css`-এ `.ipt-icon`-এর জন্য ঠিক
এই সতর্কবার্তাটাই লেখা ছিল, তবু আমি একই ফাঁদে পড়েছি। এখন `.ipt-unit` class।

### এই tab-এর প্রতিটা ঘর — website-এ যায় কি না

| ঘর | column | website |
| --- | --- | --- |
| Who provides this? | `supplierId` | **না।** ইচ্ছাকৃতভাবে shop response থেকে বাদ — vendor কে, সেটা ক্রেতার জানার বিষয় নয়। শুধু availability হিসাব করতে পড়া হয় |
| Stock mode | `stockMode` | **না।** সংখ্যাটা কোথা থেকে আসে সেটাই ঠিক করে |
| How many you have | `stockQty` | **আংশিক।** সংখ্যাটা কেবল toggle on থাকলে; কিন্তু কেনা যাবে কি না সেটা **সবসময়** এটাই ঠিক করে (DEC-PDP-09) |
| Linked stockroom item | `itemId` | **না।** কখনোই না |
| Show how many are left | `showStock` | **হ্যাঁ** — badge-এর সুইচ |
| Show a different number | `displayQty` | **হ্যাঁ** — আজ যুক্ত হলো (§২১) |
| When it runs out | `soldOutMode` | **হ্যাঁ** — Out of stock panel বনাম Pre-order button |
| Expected back on | `preorderDate` | **হ্যাঁ** — Pre-order button-এর নিচে। পার হওয়া তারিখ বাদ পড়ে |
| How long one takes to make | `makeMinutes` | **না** — Daily capacity module-এর জিনিস, shop response-এ পাঠানোই হয় না |
| Days before it can go out | `leadTimeDays` | **না — আর এটাই ফাঁক** ↓ |

### ⚠️ নতুন ফাঁক: "Days before it can go out" কিছুই করে না

মালিকের প্রশ্নের উত্তর খুঁজতে গিয়ে বেরিয়েছে। API `leadTimeDays` **পাঠায়**,
কিন্তু `apps/web`-এ ওই field-টা কোথাও পড়া হয় না — checkout-এর date picker
নিজের তালিকা বানায়, product-এর lead time দেখে না। মানে **৩ দিন লাগে এমন
product-এও আগামীকাল দেখানো হয়**।

Admin-এ chip-টা সবুজে "Moves the date" লেখা ছিল — ওটা **মিথ্যা**। ঘরটা কী
**জন্য**, তা বলছিল; কী **করে**, তা নয়। এখন `off` — *"Not on the site yet"*।
Form যদি নিজেকে বাড়িয়ে বলে, সেটা চুপ থাকার চেয়ে খারাপ: মালিক ঘর ভরেন,
বিশ্বাস করেন, আর জানতে পারেন গ্রাহকের ফোনে।

`leadTimeDays` কিন্তু **Capacity-তে কাজ করে** — একাধিক দিনজুড়ে কাজ তার
মিনিটগুলো দিনগুলোর মধ্যে ভাগ করে নেয়। শুধু checkout-এর অর্ধেকটা বাকি।

### ২৪ক. তৃতীয় পাস — chip-ও যে text, সেটা গোনা হয়নি

মালিক, tab দুবার পরিষ্কার করার পরেও: *"এখনো অনেক অনেক text"*।

**যা কাটা হলো**

· **Card-এর hint লাইন।** "Stock — How many you have, and whether the customer
is told." শিরোনামই যা বলছে, তার নিচে আবার এক লাইন। তিনটা card থেকেই গেল।

· **Chip-এর লেখা → এক শব্দ।** এটাই সবচেয়ে বড় অংশ ছিল, আর আমি এটাকে text
হিসেবেই গুনিনি। একটা কলামে পরপর তিনটা সারিতে "Seen by customers" — নয়টা
শব্দ, একই কথা তিনবার, আর যেই field-এর নাম ব্যাখ্যা করার কথা তার সাথেই
প্রতিযোগিতা করছে। এখন একটাই শব্দভাণ্ডার সারা tab-জুড়ে:

  **Live** (সবুজ) · **Sometimes** (হলুদ) · **Staff** (বেগুনি) · **Not live** (ধূসর)

চোখ চারটা আকৃতি শিখে ফেলে, প্রতিবার বাক্য পড়তে হয় না। রঙই অর্থ বহন করে;
শব্দটা শুধু নাম দেয়, আর ব্যাখ্যার বাক্য `why`-তে — hover-এ, যেখানে সেটা ফ্রি।

⚠️ সবুজ "Live"-এর পাশে হলুদ "Live" লেখা যাবে না। তখন রঙই সব কাজ করে, আর
পাঠক রঙের উপর বিশ্বাস হারায়। হলুদের শব্দ **Sometimes**।

· **যে hint control নিজেই বলে দেয়, সেটা বাদ।** "Empty shows the real count" —
বাক্সের placeholder-এ তো `real` লেখাই আছে।

---

## ২৫. DEC-PDP-10 — lead time checkout-এর সাথে যুক্ত হলো, 1 Aug 2026

§২৪-এ যে ফাঁক বেরিয়েছিল: API `leadTimeDays` পাঠাত, `apps/web` কোথাও পড়ত না।
৩ দিন লাগে এমন bouquet-এ 2-Hour Express দেখানো হত।

নিয়মটা এক লাইন: **যা এখনো বানানো হয়নি তা আগে যেতে পারে না।** নিচের সবই ওই
এক লাইনকে গ্রাহক যেখানে সময় বাছে সেখানে বসানো।

| জায়গা | আচরণ |
| --- | --- |
| `cartLeadDays()` | cart-এর **সবচেয়ে বড়** lead, যোগফল নয় — দুই দিনের তিনটা জিনিস আলাদা হাতে একসাথে বানানো হয়, ছয় দিন লাগে না |
| Method card | 2-Hour Express, Same Day ধূসর — কারণসহ: *"Needs 3 days to make — use Schedule It"* |
| Date strip | প্রথম ৩টা তারিখ বন্ধ, ৪র্থ থেকে খোলা। strip-ও lead-এর সমান বড় হয়, যাতে **আসল পছন্দের সংখ্যা** একই থাকে — বেশিরভাগ ধূসর strip ভাঙা page মনে হয় |
| Courier window | পুরো জানালা সরে যায় — courier তো এমন parcel তুলতে পারে না যেটা বানানোই হয়নি |
| `validateStep(4)` | পুরনো session থেকে ফিরে আসা তারিখও ধরা পড়ে |
| এক লাইন ব্যাখ্যা | *"This order is made to order — we need 3 days before it can go out"* |

⚠️ **Courier ছাড় পায়।** ওরও date picker নেই, কিন্তু ঢাকার বাইরে পৌঁছানোর
একমাত্র পথ ওটাই। "use Schedule It" বলে ফেরত পাঠানো মানে এমন method-এ পাঠানো
যেটা ওই zone-এ নেই — উত্তর নয়, বন্ধ গলি।

### পরীক্ষা করতে গিয়ে আরেকটা bug বেরোল

Same Day ঢাকার default। ৩ দিনের product দিলে Same Day ধূসর হয়ে যেত, **অথচ
Order Summary-তে "Delivery · Same Day · ৳60" লেখা থাকত** — যে method page
এইমাত্র অস্বীকার করল, তারই দাম দেখানো হচ্ছে।

সারানো হয়েছে: **অসম্ভব হয়ে যাওয়া পছন্দ থেকে নিজে থেকেই সরে আসে।**

⚠️ **আর সরে আসে সবচেয়ে সস্তাটায়, তালিকার প্রথমটায় নয়।** প্রথম version
METHODS-এর ক্রম ধরে সরত, আর ক্রমে প্রথম চালু method হলো Midnight Surprise —
৳২৬০। মানে page Same Day নাকচ করে চুপচাপ দোকানের সবচেয়ে দামি option ধরিয়ে
দিত। না চাইলেও ওটা upsell-এর মতো দেখায়, আর টাকাটা গ্রাহকের। কারো **হয়ে**
নেওয়া সিদ্ধান্ত কখনো তার নিজের সিদ্ধান্তের চেয়ে দামি হতে পারে না।

⚠️ শুধু **অসম্ভব** পছন্দ থেকে সরে, দুটো সম্ভব পছন্দের মাঝে নয়। গ্রাহকের
নিজের বাছাই যতক্ষণ কাজ করে ততক্ষণ ছোঁয়া হয় না।

### যাচাই — ব্রাউজারে, সত্যিকারের data দিয়ে

`demo-red-roses`-এ stock ২০ আর lead ৩ বসিয়ে cart → checkout ঘুরে দেখা হয়েছে:
Express + Same Day ধূসর কারণসহ, নিজে থেকে **Schedule It (৳60)**-এ সরেছে,
১–৩ আগস্ট বন্ধ, ৪ আগস্ট থেকে খোলা, মোট ৳1,860।

### ⚠️ migration-এর পর দোকান অন্ধকার

`soldOutMode` migration চলার পর **প্রতিটা demo product `OUT_OF_STOCK`** —
সবগুলোর `stockQty` ছিল ০। DEC-PDP-09 ঠিক যা বলে তাই করছে, আর bat file-এও এই
সতর্কবার্তা লেখা ছিল। কিন্তু জানা দরকার: **Stock page-এ গিয়ে সংখ্যা বসাতে
হবে**, নাহলে কিছুই বিক্রি হবে না।

---

## ২৬. Photos & video — তিনটা bug, 1 Aug 2026

মালিক এই section-এ এলেন। যা পাওয়া গেল:

### ১. ছবি লুকিয়ে যাচ্ছিল, অথচ website-এ দেখা যাচ্ছিল

Grid আঁকত `photos.slice(0, 6)`, কিন্তu uploader ১২টা পর্যন্ত নিত আর
`buildDto` **সবগুলোই** পাঠাত। মানে ৭ থেকে ১২ নম্বর ছবি database-এ যেত,
website-এ উঠত, আর যিনি upload করেছেন তিনি সেগুলো **দেখতেও পেতেন না,
মুছতেও পারতেন না**।

এখন একটাই constant — `MAX_PHOTOS = 8` — uploader আর grid দুজনেই পড়ে।
মালিকের সিদ্ধান্ত ৮: FlowerAura/FNP বেশিরভাগ product-এ ৪–৬টা দেখায়; ৮টায়
গল্প বলার জায়গা থাকে, আবার মোবাইলে page ভারী হয় না — আর বাংলাদেশে প্রায়
সব order মোবাইল থেকেই আসে।

### ২. অনেকগুলো ছবি একসাথে দিলে কিছুই upload হত না, কোনো বার্তাও নয়

```ts
for (const f of files) {
  if (photos.length + files.length > 12) break;
```

`photos` state, loop-এর ভেতরে বদলায় না; `files.length`-ও না। শর্তটা তাই
**ধ্রুবক** — ১৩টা একসাথে দিলে **প্রথম** file-এই break, কিছুই যায় না। ৭টা
থাকা অবস্থায় ৬টা দিলেও তাই। আর `failed` খালি থাকে, তাই মালিক একটা
সফল-দেখতে screen পান যাতে নতুন কোনো ছবি নেই, আর কেন নেই তার কোনো ইঙ্গিত নেই।

এখন আগে হিসাব হয় কত জায়গা বাকি, ঠিক ততটাই যায়, আর কয়টা বাদ পড়ল তা
পরিষ্কার লেখা হয়।

### ৩. Main ছবি বদলানোর কোনো উপায় ছিল না

প্রথম ছবিই main image — card, search result, WhatsApp preview সবই ওটা ব্যবহার
করে। বদলাতে হলে **সব ছবি মুছে সঠিক ক্রমে আবার upload** করা ছাড়া উপায় ছিল না।

এখন **drag করে ক্রম বদলানো যায়**, আর প্রতিটা non-first tile-এ hover করলে
**"Make main"** — কারণ আসল দরকারটা ৪ নম্বর বনাম ৫ নম্বর নিয়ে নয়, কোনটা
প্রথমে থাকবে তা নিয়ে। Hover-এ রাখা হয়েছে; সব tile-এ সবসময় দেখালে পাঁচটা
button ছবিগুলোর সাথেই প্রতিযোগিতা করত, অথচ ছবি দেখানোই এই card-এর কাজ।

`+` tile সীমায় পৌঁছালে **অদৃশ্য** হয়ে যায় — যে plus কিছু করে না, সেটা
ভাঙা button।

### ⚠️ এখনো বাকি — মালিকের সিদ্ধান্ত দরকার

**ছবিগুলো `<img>` নয়, CSS background।** তাই:
· কোনো `alt` লেখা নেই — `ProductImage`-এ column-ও নেই
· Google Images এই ছবিগুলো খুঁজে পায় না
· lazy loading নেই, `next/image`-এর optimisation নেই

মালিক আগে বলেছিলেন data layer দিয়ে Google-এও পাঠাতে হতে পারে — তখন `alt`
লাগবেই। এটা schema + migration + PDP gallery-র কাজ, তাই আলাদা ধাপ।

---

## ২৭. ছবির নিয়ম — **১:১, সবসময়** · DEC-PDP-11, 1 Aug 2026

> মালিকের স্থায়ী নির্দেশ: *"image jen 1/1 hoy alwas, ata mone rakhio"*।
> **এটা প্রতিটা নতুন ছবির surface-এ খাটে — product, category, banner, add-on।**

### সংখ্যাগুলো

| | মান |
| --- | --- |
| আকৃতি | **১:১ বর্গাকার**, ব্যতিক্রম নেই |
| সর্বোচ্চ ফাইল | **১০ MB** — API-র নিজের সীমাও ঠিক এটাই |
| সর্বনিম্ন মাপ | **৬০০×৬০০** — এর নিচে product page ভরাট দেখায় না |
| সংরক্ষিত মাপ | সর্বোচ্চ **১৬০০×১৬০০** |
| সর্বোচ্চ সংখ্যা | **৮টা** |

### crop CSS-এ নয়, upload-এ

⚠️ প্রতিটা surface — PDP gallery, category card, admin tile, WhatsApp preview —
আগেই `aspect-square` + `bg-cover` দিয়ে বর্গাকার বাক্সে ছবি বসাত। মানে ৩:৪
মোবাইল ছবি **আগেও কাটা পড়ত**, শুধু প্রতি জায়গায় আলাদাভাবে আর অদৃশ্যভাবে।
আরও খারাপ: share preview আর ভবিষ্যতের Google Shopping feed **কাঁচা ফাইলটাই**
নেয়, তাই WhatsApp-এ গ্রাহক যে ছবি দেখত সেটা দোকান যা অনুমোদন করেছে তা নয়।

একবার, upload-এর সময় কেটে নিলে **ফাইলটাই সেই জিনিস যা সবাই দেখে**।

⚠️ **মাঝখান থেকে কাটা, আর মালিককে বলে দেওয়া হয়।** লম্বা bouquet-এর মাথা
চুপচাপ কেটে ফেলা এমন ছোট অসততা যা এক সপ্তাহ পরে ধরা পড়ে, তখন কেউ আর
upload-টা মনে রাখে না। তাই *"2 photos were cropped square from the centre."*

⚠️ **বাতিল করা হয় না।** এই দোকানের প্রায় সব ছবিই ফোনে তোলা — ৪:৩ বা ৩:৪।
যে যন্ত্র তার মালিকের ক্যামেরাকেই ফিরিয়ে দেয়, সে যন্ত্র কেউ ব্যবহার করে না।

⚠️ **কখনো বড় করা হয় না।** ৭০০px ছবি ৭০০ বর্গই থাকে — ১৬০০-তে টেনে বড় করলে
retina পর্দায় ঘোলা দেখাত।

### খালি অবস্থায় তিনটা ঘর

মালিক: *"+ icon ar avabe jen 3 ta image ar thake, tahole bujte subida hobe"*।

একটা ছোট বর্গ **একটা** ছবি চায়। তিনটা বর্গ কোনো বাক্য ছাড়াই দুটো কথা একসাথে
বলে: **কয়েকটা** আনো, আর সেগুলো **বর্গাকার** হবে। এই card-এ কেউ কাজ করার আগে
শুধু খালি বাক্সের আকৃতিটাই পড়ে।

ছবি এলে ঘরগুলো কমে যায় — দেখার মতো কিছু থাকলে ছায়া-ঘর শুধু জঞ্জাল।

### যাচাই — সত্যিকারের upload, শেষ মাথা পর্যন্ত

১৪০০×৭০০ (২:১) একটা ছবি বানিয়ে আসল crop + আসল endpoint দিয়ে চালানো হয়েছে:

· ImageKit থেকে ফেরত এল **৭০০×৭০০**, `cropped: true` — দুই পাশের গোলাপি
  পট্টি বাদ পড়েছে, ঠিক যেমন হওয়ার কথা
· product-এ বসিয়ে storefront-এ দেখা গেছে — gallery-তে ছবি, পাশে **WATCH**
  thumbnail
· YouTube link দিয়েও দেখা হয়েছে — embed চলে, ভিডিও বাজে
· তারপর দুটোই মুছে দেওয়া হয়েছে, `demo-red-roses` আগের অবস্থায়

### ২৭ক. ১ MB ছাদ — সব ছবিতে, DEC-PDP-12

> মালিক, 1 Aug 2026: *"max 1 mb, তার উপরে কোনো image না। তার উপরে image দিলেও
> এটাকে resize করে 1 mb করে নিবে।"*

⚠️ **এটা দরজা নয়, ছাদ** — আর পার্থক্যটাই পুরো নকশা। *"আপনার ফাইল ৪ MB,
সীমা ১ MB"* একটা বন্ধ গলি; তখন মানুষকে গিয়ে compression software খুঁজতে হয়।
দোকানের নিজের ক্যামেরাই ৩–৬ MB ফাইল বানায়, তাই ওই error প্রায় প্রতিটা ছবিতেই
উঠত। এখন browser নিজেই আবার encode করে যতক্ষণ না ফিট হয় — **সীমা আছে বলেই কেউ
জানতে পারে না**।

কেন এটা এখানে সবচেয়ে জরুরি: Radian-এর প্রায় সব order মোবাইল ডেটা থেকে আসে।
আটটা ৪ MB ছবির একটা product page মানে **৩২ MB**, একটা শব্দ পড়ার আগেই — ফুল
দেখা যাওয়ার আগেই গ্রাহক চলে যায়।

**কোন ক্রমে ছোট হয়** — যে ক্রমে মান সবচেয়ে কম নষ্ট হয়:

1. আগে JPEG quality কমে (`0.9 → 0.5`) — ছবিতে চোখে পড়ার অনেক আগেই যথেষ্ট ছোট
   হয়ে যায়
2. তারপরই কেবল pixel কমে (`1600 → 800`) — এটা **চোখে পড়ে**

উল্টো ক্রমে করলে যে detail শুধু quality দিয়েই বাঁচানো যেত, সেটা ফেলে দেওয়া হত।

**যা মুছে ফেলা হলো:** `SHRINK_ABOVE_BYTES = 3MB` আর `shrink()`। ওগুলো কেবল
৩ MB-র **উপরে** একবার, নির্দিষ্ট quality-তে encode করত — তাই ২.৫ MB ছবি
অক্ষত সংরক্ষিত হত, আর ৪ MB প্রায়ই ২ MB হয়ে বসত। Threshold উত্তর দেয় "কখন
কষ্ট করব"; মালিকের নিয়ম উত্তর দেয় "কী সংরক্ষণ করা যাবে" — আর দ্বিতীয়টাই
page-টাকে মোবাইলে খোলার মতো রাখে।

⚠️ **shared uploader-এ ১:১ চাপানো হয় না।** Banner চওড়া, icon icon — ওদের
বর্গাকার করলে hero-র দুই পাশ কেটে যেত। ১:১ (DEC-PDP-11) **product photo**-র
নিয়ম, আর ওগুলো `uploadProductPhoto` দিয়ে যায়। ১ MB ছাদ দুজনেরই।

### যাচাই — সবচেয়ে খারাপ ক্ষেত্রে

৩০০০×২০০০ pixel-এর pure random noise (JPEG-এর জন্য সবচেয়ে কঠিন), **১৬.৭০ MB**:

```
1600px q0.90 → 1.77 MB
1600px q0.82 → 1.38 MB
1600px q0.74 → 1.13 MB
1600px q0.66 → 0.93 MB   ✓
```

pixel কমাতেই হয়নি — **১৬০০×১৬০০, ০.৯৩ MB**, আসল endpoint দিয়ে upload হয়ে
ImageKit থেকে নিশ্চিত। সত্যিকারের ফুলের ছবি এর চেয়ে অনেক সহজে চাপে, তাই
বাস্তবে quality-র প্রথম বা দ্বিতীয় ধাপেই মিটে যাবে।

---

## ২৮. Delivery tab — Zone ঠিক ছিল, speed তিন জায়গায় ভাঙা · DEC-PDP-13

মালিক বললেন Delivery tab-টা admin আর frontend মিলিয়ে দেখতে।

### Zone — কাজ করে

Admin `zone` → API → PDP-তে ঢাকার বাইরের ঠিকানায় `OutOfZone` panel, cart-এ
`held` lines, checkout-এ `methodsForZone`। `nationwideMsg`-ও যায়। ✓

### Delivery speed — API পাঠাত, কেউ পড়ত না

`supportsExpress / supportsSameDay / supportsMidnight` endpoint লেখার দিন
থেকেই payload-এ ছিল। **একমাত্র পাঠক ছিল listing card** — কোন delivery-filter
page-এ product-টা দেখাবে সেটা ঠিক করতে। বাকি সব জায়গা উপেক্ষা করত।

**তিনটা ভাঙা জায়গা:**

**১. Product page-এর সবুজ chip।** `zone === "dhaka" ? "30–120 Min Delivery" :
…` — zone ছাড়া আর কিছুই পড়ত না। তাই ঢাকার **প্রতিটা** product দামের উপরে
সবুজে দুই-ঘণ্টার প্রতিশ্রুতি দিত, express টিক থাকুক বা না থাকুক। পুরো
page-এর সবচেয়ে দৃশ্যমান মিথ্যা।

এখন যা সত্যিই পারে তাই: express → "30–120 Min Delivery" · শুধু same-day →
"Same-day in Dhaka" · শুধু midnight → "Midnight delivery" · **কিছুই না →
chip-ই নেই**। খালি chip-এর ভেতরে বজ্রচিহ্ন কোনো chip না থাকার চেয়েও খারাপ।

**২. একই page-এর trust badge-ও একই মিথ্যা বলত।** মালিক নিজে badge না বসালে
category template তিনটা দেয়, আর প্রথমটা hard-coded "2-Hour Delivery · inside
Dhaka"। তাই chip ঠিক করার পরেও ছবির নিচে বজ্রচিহ্ন নিয়ে একই দাবি বসে থাকত —
**এক page, দুই উত্তর**। এখন fallback-এর speed দাবিটা বাদ পড়ে, আসলটা বসে।
⚠️ মালিক **নিজে** যে badge লিখেছেন সেগুলোতে হাত পড়ে না — তিনি লিখলে তিনি
বুঝেই লিখেছেন।

**৩. Checkout একেবারেই পড়ত না।** `methodsForZone(zone)` — cart-এর product
কখনো method-এর তালিকা ছোট করত না। মানে midnight ইচ্ছে করে না-টিক করা ক্রিম
কেকও midnight-এ order করা যেত।

### নিয়ম — মালিকের কথায়

> *"যতগুলা product cart-এ থাকুক, যে নিয়ম সবগুলা product-এ আছে সেটাই win হবে"*

**Intersection, union নয়।** একটা ঠিকানা, একটা rider, একটা যাত্রা — তাই যে
কেক midnight-এ যেতে পারে না, সে পুরো order-কেই midnight থেকে আটকায়, একই
ব্যাগে গোলাপ থাকুক বা না থাকুক। **সবচেয়ে ধীর জিনিসটাই গতি ঠিক করে।**

⚠️ **কে আটকাল, নামটা সাথে যায়।** "Midnight not available" পড়ে গ্রাহক এলোমেলো
জিনিস মুছে দোষী খুঁজতে থাকে, নয়তো ছেড়ে দেয়। *"Mixed Flower Basket can't go
this way"* পড়ে এক নজরেই ঠিক করা যায় — কেক বাদ দেব, না midnight বাদ দেব।
একটা string-এর খরচে একটা order বাঁচে।

⚠️ **কোনো টিক না থাকলে তিনটাই বন্ধ** — এটা bug নয়, এটাই উত্তর: দোকান বলেছে
এই জিনিস কোনো দ্রুত পথে যায় না, তাই এটা schedule করা দিনে যাবে।
**Schedule It কখনো আটকায় না** — ওটাই সবার শেষ আশ্রয়।

### যাচাই — cart-এ দুটো জিনিস

গোলাপ (সব ✓) + Mixed Flower Basket (শুধু Same-day):

· **2-Hour Express** ধূসর — *"Mixed Flower Basket can't go this way"*
· **Midnight Surprise** ধূসর — একই কারণ
· **Same Day** নিজে থেকেই বাছা হয়ে গেছে ✓
· **Schedule It** খোলা
· উপরে এক লাইনে নাম ধরে বলা, আর কী করলে খুলবে
· Summary: Delivery · Same Day · ৳60

Product page-ও মিলে গেছে — chip **"Same-day in Dhaka"**, নিচের badge
**"Same Day · order before 6 PM"** সূর্যের চিহ্ন নিয়ে।

### ⚠️ demo data — যা রেখে এসেছি

পরীক্ষার জন্য `demo-red-roses` আর `demo-mixed-basket` ছোঁয়া হয়েছে। শেষে
দুটোকেই আগের speed-এ ফেরত দেওয়া হয়েছে (exp ✓ · sd ✓ · mn ✗, lead ০), তবে
**stock ২০ রেখে দেওয়া হয়েছে** — নাহলে DEC-PDP-09 অনুযায়ী দুটোই আবার
out of stock হয়ে যেত আর demo দোকান অন্ধকার থাকত।

---

## ২৯. Delivery module একটাই উৎস — DEC-DLV-007 / 008 / 009

মালিকের দুটো নিয়ম, ১ আগস্ট ২০২৬:

> ১. *"এখানে বেশি নির্দিষ্টতাই জিতবে।"*
> ২. *"delivery module-এ যা edit বা change করা হয়, তা যেন auto পুরা system-এ
> কাজ করে — frontend, product upload page, আর যেখানে দরকার সব জায়গায়।"*

দ্বিতীয় নিয়মটার একটা সরাসরি মানে আছে: **কেউ নিজের কাছে delivery-র নাম বা
দামের কপি রাখতে পারবে না।** কপি ছিল তিন জায়গায় —

| কোথায় | কী ছিল |
| --- | --- |
| `Product` | তিনটা boolean — `supportsExpress/SameDay/Midnight` |
| product upload পর্দা | পাঁচটা নাম কোডে লেখা |
| web app | METHODS তালিকা, নিজের দাম আর slot নিয়ে |

### যা বানানো হলো

**ধাপ ১ · টেবিল** — `DeliveryArea` (zone → এলাকার গাছ),
`DeliveryMethod.areaId` (কোন এলাকার দাম; null = পুরো zone),
`DeliverySlot.startMin/endMin/cutoffTime` (প্রতি slot-এর নিজের সময় ও ঘড়ি)।

**ধাপ ২ক · নাম** — `DeliveryType`, দোকানজুড়ে একবার। `ProductDeliveryType`
দিয়ে product-এর সাথে যোগ। নামগুলো আর product-এর তিনটা টিক **নিজে থেকেই**
পুরনো সারি থেকে ভরে গেছে।

⚠️ কেন নামের আলাদা টেবিল: Dhanmondi-র "Same Day" আর পুরো ঢাকার "Same Day"
দুটো আলাদা সারি, কারণ দাম আলাদা (৳৮০ / ৳১০০)। Product যদি **লেখার** সাথে
যুক্ত হতো, মালিক একদিন নাম বদলালেই সব product-এর সংযোগ নীরবে ছিঁড়ে যেত —
কোনো error নয়, শুধু গ্রাহক দ্রুত delivery-র ঘরটা আর দেখত না।

**ধাপ ২খ · পর্দা** — `ZonesAvailability` এখন database-এ লেখে। আগে
`DEMO_ZONE_TREE` নিয়ে browser-এ বসে থাকত: charge বদলে refresh দিলেই ফিরে
আসত পুরনোটা। "DEMO DATA" ব্যাজটাও গেছে — যে চিহ্ন আর সত্য নয় সেটা রেখে
দেওয়া সবচেয়ে খারাপ।

⚠️ একটা type যোগ করলে **দুটো** কাজ হয়: নামটা আগে থেকে না থাকলে বানানো হয়,
তারপর ওই এলাকার দাম। তাই একই নাম দুই এলাকায় বসালে নাম একটাই থাকে।

⚠️ প্রতিটা বদলের পর পুরো তালিকা আবার পড়া হয়, browser-এ হিসাব করা হয় না।
একটা এলাকা মুছলে তার দাম যায়, দাম গেলে তার slot — সেই হিসাব browser-এ
আবার লিখলে সেটা server-এর হিসাবের দ্বিতীয় সংস্করণ হতো।

**ধাপ ৩ · product page** — তিনটা fixed chip গেছে; নামগুলো `/delivery/types`
থেকে আসে। নতুন নাম বানালে refresh-এই চলে আসে।

**DEC-DLV-009 · কোন দাম খাটবে** — `src/delivery/resolve.ts`, একটাই function।
এলাকার সারি → না থাকলে zone-এর সারি → **কোনোটাই না থাকলে `null`**, অন্য
এলাকার দাম ধার করা হয় না। ধার করা মানে এমন জায়গায় যাওয়ার কথা দেওয়া যেখানে
দোকান যায়ই না।

### bug যা ধরা পড়ল

**দুই module একই জায়গাকে দুই নামে ডাকে।** `Product.zone` = `NATIONWIDE`,
`DeliveryZone` = `BANGLADESH`। তাই Nationwide product-এ "কোনো delivery নেই"
লেখা উঠছিল, অথচ "Nationwide Courier" টেবিলে বসা ছিল। অনুবাদটা এখন এক
জায়গায় (`deliveryZoneOf`)।

### যাচাই

পর্দা দিয়ে Dhanmondi বানিয়ে তাতে "Same Day ৳৮০" বসিয়ে refresh দেওয়া হয়েছে।
database বলছে:

```
Same Day · Dhanmondi   · tk80  · name=Same Day
Same Day · whole DHAKA · tk100 · name=Same Day
```

**দুই দাম, এক নাম** — ঠিক যা দরকার। Product একবার "Same Day"-র সাথে যুক্ত
হয়, আর গ্রাহকের এলাকা ঠিক করে সে ৳৮০ দেবে না ৳১০০।

### ⚠️ এখনো বাকি

**ধাপ ৪ — checkout।** এখনো web app-এর নিজের লেখা দাম, slot আর cut-off
দেখায়। এটাই শেষ কপি, আর এটা না সরানো পর্যন্ত মালিকের নিয়ম ২ পুরোপুরি
সত্য নয়।

**দামহীন নাম।** "4-Hour Express" নামটা আছে কিন্তু কোনো এলাকায় তার দাম বসানো
নেই। তাই product page-এ সেটা দেখা যায়, কিন্তু setup পর্দায় নয়, আর
checkout-এও কখনো আসবে না। product-এ টিক দেওয়া যাবে অথচ কিছুই হবে না —
পর্দায় এটা সাবধান করা দরকার।

---

## ৩০. মুছে ফেলা জিনিস ফিরে আসত — seed-এর bug, 1 Aug 2026

মালিক Dhaka City-র নিচের delivery-গুলো মুছে নিজের মতো সাজাতে গিয়েছিলেন, আর
মুছে দেওয়া নামগুলো ফিরে এসেছিল। কারণটা এক লাইনের:

```ts
const count = await this.prisma.db.deliveryMethod.count();
if (count > 0) return;   // "টেবিল খালি নয়, seed লাগবে না"
```

`prisma.db` হলো **soft-delete করা client** — সে মুছে ফেলা সারি গোনেই না। তাই
সব মুছে ফেলার পর count শূন্য, আর "একদম নতুন database" ভেবে seed আবার চারটা
delivery বসিয়ে দিত। **দোকান কখনোই নিজের তালিকা খালি করতে পারত না।**

তিন জায়গায় একই ভুল ছিল: `seedMethodsIfEmpty`, `seedZonesIfEmpty`,
`seedCouriersIfEmpty`। তিনটাই এখন **raw client** দিয়ে গোনে, যেটা মুছে ফেলা
সারিও দেখে। মানে seed জীবনে একবারই চলে।

⚠️ শিক্ষাটা seed-এর চেয়ে বড়: soft-delete করা client দিয়ে "খালি কি না" মাপা
যায় না। "কিছুই নেই" আর "সব মুছে ফেলা হয়েছে" — দুটো আলাদা কথা, আর filter করা
count দুটোকে এক দেখায়।

### delete যে কাজ করে, তা যাচাই করা হয়েছে

Dhanmondi মুছে দেখা গেছে: এলাকা গেছে, তার ৳৮০-র সারিও গেছে, বাকি চারটা
zone-wide দাম অক্ষত।

মালিক আগে যেটা দেখেছিলেন (Dhanmondi/Gulshan মুছেও ফিরে আসা) — তার একটা অংশ
এই seed bug, আর একটা অংশ সময়ের: তখন পর্দাটা এখনো demo ছিল, তাই মুছে ফেলা
শুধু browser-এর ভেতরে ঘটত।

---

## ৩১. ধাপ ৪ শুরু — checkout-এর জন্য আসল মেনু

`GET /shop/delivery-options?zone=&areaId=` — checkout-এর পুরো মেনু, সরাসরি
delivery module থেকে: নাম, দাম (এলাকা ধরে, DEC-DLV-009), eta, আজকের cut-off
আর প্রতিটা slot তার নিজের সময় ও ঘড়ি নিয়ে।

⚠️ `deliveryModes()` (আগের থেকেই আছে) এটার জায়গা নেয় না। ওটা homepage-এর
বিজ্ঞাপন — নাম আর কাউন্টডাউন। এটা checkout-এর মেনু। দুই প্রশ্ন, দুই উত্তর,
**একই টেবিল**।

### ⚠️ যা আটকে আছে — schema-তে দুটো জিনিস নেই

Checkout-কে জানতে হয় প্রতিটা delivery **কীভাবে আচরণ করে**:

· গ্রাহক কি তারিখ বাছতে পারবে, নাকি শুধু আজ?
· slot লাগবে, নাকি লাগবে না?

পুরনো hardcoded তালিকায় এগুলো ছিল (`datePick`, `todayOnly`)। **Delivery
module-এ নেই** — সেখানে আছে নাম, zone, দাম, cut-off, eta আর slot।

নাম দেখে আন্দাজ করা যেত ("midnight" থাকলে তারিখ বাছা যায়), কিন্তু সেটা ঠিক
সেই ভুল যেটা আজ সারানো হলো — লেখার উপর নিয়ম দাঁড় করানো। মালিক নতুন একটা
ধরন বানালে আন্দাজ ভেঙে পড়ত।

তাই `DeliveryType`-এ দুটো column দরকার, আর সেটা মালিকের সিদ্ধান্ত:
**কোন delivery-তে গ্রাহক তারিখ বাছবে, আর কোনটা শুধু আজকের।**

---

## ৩২. পুরো শিকল যাচাই — delivery module → product → checkout, 1 Aug 2026

মালিক নিজে setup সাজিয়ে বললেন পুরোটা মিলিয়ে দেখতে।

### মালিকের এখনকার setup

| নাম | ছাঁচ | দাম | slot |
| --- | --- | --- | --- |
| 3-Hour Express | FROM_CONFIRM ১৮০ মিনিট, জানালা ১০টা–৯টা | ৳৩০০ | — |
| Schedule It | PICK_DATE_SLOT | ৳১৫০ | Morning ১০–৩, Afternoon ৩–৯ |
| Same Day | TODAY_SLOT | ৳২০০ | Morning ১০–৩, Afternoon ৩–৯ |
| Midnight Surprise | PICK_DATE_FIXED | ৳১০০০ | ১১:৩০ PM–১২:৩০ AM, last order ৬টা |
| Nationwide Courier | LEAD_DAYS | ৳১৫০ | — |

### চারটা সংযোগের তিনটা ঠিক

**১. Delivery module → Product upload · ✅**
ছয়টা নামই আসে, delivery module থেকেই। নতুন নাম বানালে refresh-এই আসে।

**২. Product → PDP chip ও trust badge · ✅**
যা টিক দেওয়া, তাই লেখা ওঠে। কিছু না থাকলে chip-ই থাকে না।

**৩. Delivery module → checkout API · ✅**
`GET /shop/delivery-options?zone=DHAKA` মালিকের setup হুবহু ফেরত দেয় —
ছাঁচ, দাম, slot, আজকের জানালা সহ।

**৪. checkout API → checkout পর্দা · ❌ এটাই বাকি**

প্রমাণ, একই মুহূর্তে:

```
Delivery module :  Same Day = ৳২০০
Checkout পর্দা  :  Same Day = ৳৬০      ← web app-এ লেখা পুরনো সংখ্যা
```

আর মালিকের বানানো **3-Hour Express** checkout-এ নেই-ই, কারণ ওই তালিকাটা
এখনো `_data/delivery.ts`-এ হাতে লেখা চারটা।

### যা এই pass-এ সারানো হলো

**নাম আছে, দাম নেই — নীরব ফাঁদ।** 2-Hour আর 4-Hour Express-এর কোনো এলাকায়
দাম বসানো ছিল না, তবু product page-এ টিক দেওয়া যেত। টিক save হতো, আর
checkout ওই delivery কখনো দেখাত না — **একটা টিক যা কিছুই করে না।**

এখন `/delivery/types` প্রতিটা নামের সাথে `rateCount` পাঠায়:
· product page দামহীন নাম **দেখায় না**
· আগে টিক দেওয়া কোনো নামের দাম মুছে ফেললে product page **নাম ধরে সতর্ক করে** —
  চুপচাপ হারায় না
· setup পর্দা উপরে বলে দেয় কোন নামের দাম কোথাও বসানো নেই

⚠️ `rateCount` অজানা হলে "ঠিক আছে" ধরা হয় (`?? 1`)। পুরনো API এখনো এটা
পাঠায় না, আর `?? 0` লিখলে সে **সব নামের** বিরুদ্ধে মিথ্যা সতর্কবাণী দিত।
অজানা মানে দোষী নয়।

### ⚠️ খেয়াল রাখার মতো

**মধ্যরাত পেরোনো slot।** Midnight-এর slot ১১:৩০ PM → ১২:৩০ AM, অর্থাৎ শেষ
সময় শুরুর চেয়ে **ছোট** (1410 → 30)। ধাপ ৪-এ checkout যখন এই সময় আঁকবে আর
"পেরিয়ে গেছে কি না" হিসাব করবে, তখন এই একটা ক্ষেত্র আলাদা করে ধরতে হবে —
নাহলে "১১:৩০ PM – ১২:৩০ AM" কে শূন্য দৈর্ঘ্যের বা উল্টো slot মনে হবে।

---

## ৩৩. ধাপ ৪ শেষ — checkout এখন delivery module পড়ে, 1 Aug 2026

মালিকের নিয়মটা এখন **পুরোপুরি সত্যি**: delivery module-এ যা বদলায়, তা সব
জায়গায় বদলায়।

### শেষ কপিটা মুছে গেল

`_data/delivery.ts`-এর `METHODS` তালিকা checkout আর পড়ে না। ওখানে লেখা ছিল
Same Day ৳৬০, মালিকের module-এ ৳২০০ — একই জিনিসের দুই দাম, দুই ফাইলে, আর
গ্রাহক ভুলটাই দিত।

### আগে ↔ পরে, একই মুহূর্তে

```
আগে (হাতে লেখা)                    পরে (module থেকে)
2-Hour Express   ৳150               3-Hour Express     ৳300   Within 3 hours of confirming
Same Day         ৳60                Schedule It        ৳150   Pick any date & time slot
Midnight         ৳60+৳200           Same Day           ৳200   Today — pick a time slot
Schedule It      ৳60                Midnight Surprise  ৳1,000 Lands 11:30 PM – 12:30 AM
```

মালিকের বানানো **3-Hour Express** আগে checkout-এ ছিলই না। এখন আছে, আর তার
লেখাটাও তাঁর দেওয়া ১৮০ মিনিট থেকে নিজে থেকে বানানো — "Within 3 hours of
confirming"।

Same Day বাছলে তাঁর নিজের দুটো slot আসে, সময়সহ:
`Morning · 10:00 AM – 3:00 PM` (আজকের জন্য পেরিয়ে গেছে) আর
`Afternoon · 3:00 PM – 9:00 PM` (খোলা)। মোট ৳৪,১০০ — ৳২০০ delivery নিয়ে।

### যেসব সিদ্ধান্ত এখানে নেওয়া হলো

**আচরণ আসে ছাঁচ থেকে, নাম থেকে নয়।** `datePick` / `slots` / `todayOnly`
তিনটাই `timing` দেখে ঠিক হয়। মালিক "5 Hours" নামে নতুন কিছু বানালে সেটা
নিজে থেকেই ঠিক আচরণ করবে, কারণ ছাঁচটা তিনিই বেছেছেন।

**surcharge বলে আর কিছু নেই।** পুরনো midnight-এ ৳৬০ + ৳২০০ ভাগ করা ছিল —
ওটা web app-এর নিজের বানানো। delivery module-এ একটা delivery-র একটাই দাম।

**`quoteDelivery` এখন সারিটাই নেয়, শুধু id নয়।** id এখন database-এর সারির
id; হাতে-লেখা তালিকায় সেটা খুঁজে না পেয়ে সে চুপচাপ প্রথম সারির দাম ধরে
নিত। মালিক ৳২০০ লিখতেন, গ্রাহক ৳৬০ দিত, কেউ টের পেত না।

**slot-এর "পেরিয়ে গেছে" হিসাব server-এ, ঢাকার সময়ে।** আগে browser-এর ঘড়ি
দেখা হতো — দুবাই থেকে উপহার পাঠালে ভুল slot খোলা দেখাত।

**capacity ০ মানে "সীমা নেই", "ভরে গেছে" নয়।** admin-এ ঘরটা খালি রাখলে ঠিক
এটাই হয়, আর শূন্যকে ভরা ধরলে প্রতিটা নতুন slot জন্মের সাথে সাথেই বন্ধ দেখাত।

**মধ্যরাত পেরোনো slot সামলানো হয়েছে।** Midnight-এর ১১:৩০ PM → ১২:৩০ AM-এ
শেষ সময় শুরুর চেয়ে ছোট (1410 → 30)। লেখা বানানো হয় দুটো সংখ্যা আলাদা করে,
বিয়োগ করে নয় — নাহলে উত্তর ঋণাত্মক আসত।

### পুরো শিকল, এখন

```
Delivery module  →  Product upload page   ✅ নাম আসে
                 →  PDP chip ও badge      ✅ যা টিক তাই লেখা
                 →  Checkout তালিকা       ✅ নাম, ছাঁচ, লেখা
                 →  Checkout দাম          ✅ module-এর দাম
                 →  Checkout slot         ✅ module-এর slot, সময়সহ
```
