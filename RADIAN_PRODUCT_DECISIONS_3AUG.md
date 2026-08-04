# Product page — ২–৩ আগস্ট ২০২৬-এর সিদ্ধান্তগুলো (DEC-PRD-022 … 029)

আগের অংশ: `RADIAN_PRODUCT_DECISIONS_2AUG.md` (DEC-PRD-012 … 021)।

সব সিদ্ধান্ত মালিকের নিজের কথা থেকে। কোনোটাই অনুমান করে বসানো হয়নি —
ব্যবসার নিয়ম মালিক দেন, এই নথি শুধু সেটা কেন আর কীভাবে বসল তা রাখে।

---

## চালানো বাকি

| কী | কোথায় |
|---|---|
| — | সব migration প্রয়োগ হয়েছে, API 0 error-এ চলছে |

---

## DEC-PRD-022 — চিপগুলো master থেকে আসবে, কোড থেকে নয়

**Business Problem.** Product editor-এ Occasion আর Recipient-এর চিপ দুটো
তালিকা **কোডে হাতে লেখা** ছিল। ফলে মালিক Occasions & Tags-এ নতুন একটা tag
বানালে সেটা product upload পর্দায় কোনোদিন দেখা যেত না — master data থাকত
এক জায়গায়, আর কাজের পর্দা অন্য কথা বলত।

**Decision.** চিপ আঁকা হয় `/tags` থেকে, group ধরে। মালিক যা বানান, তাই
এখানে — কোড ছোঁয়া ছাড়াই।

**Reason.** মালিকের প্রশ্ন ছিল সোজা: tag বানিয়ে রাখলে সেটা product-এ
লাগানো যাবে তো? হাতে লেখা তালিকা মানে উত্তরটা "না, কেউ কোড না বদলালে"।

**Alternatives.** দুটো তালিকা মিলিয়ে রাখা। **বাতিল:** একই তথ্য দুই জায়গায়
থাকলে একদিন আলাদা হয়ে যাবেই।

**Impact.** Product editor (Tags tab) · Occasions & Tags module।

---

## DEC-PRD-023 — Trust badge, What's inside আর FAQ-এর master category-তে

**Business Problem.** "2-Hour Delivery", "Freshness Guarantee" — এই কথাগুলো
প্রতিটা product-এ আলাদা করে লিখতে হতো। ১০০টা product মানে একই তিনটে কথা
১০০ বার, আর একটা বদলাতে চাইলে ১০০ জায়গায়।

**Decision.** তিনটেরই master এখন **Category**-তে (`CategoryTrustBadge`,
`CategorySpec`, নিজের icon upload সহ)। Product-এ ঘরগুলো থাকে, কিন্তু
খালি রাখলে category-রটাই দেখা যায়।

উত্তরাধিকারের নিয়ম দু-রকম, আর সেটা ইচ্ছাকৃত:

| জিনিস | product-এ লিখলে |
|---|---|
| Trust badge | category-রটা **বদলে যায়** (replace) |
| What's inside | category-রটা **বদলে যায়** (replace) |
| FAQ | category-রটার **সাথে যোগ হয়** (add up) |

**Reason.** মালিক: *"আমি চাই প্রতিটা admin panel-এ যেন create করে রাখা যায়
আর এখানে যেন just সে data আসে"*। FAQ ব্যতিক্রম কারণ product-ভিত্তিক প্রশ্ন
("এই কেক কি ডিম ছাড়া?") আর category-ভিত্তিক প্রশ্ন ("মাঝরাতে দেবেন?") —
দুটোই গ্রাহকের দরকার, একটা আরেকটাকে মুছে দেওয়ার কথা নয়।

**Alternatives.** সব কিছুতেই "যোগ হবে" নিয়ম। **বাতিল:** তখন product-এ
নিজের badge লিখলে ছয়টা badge দেখাত, আর তিনটের নকশা ছয়টায় ভেঙে পড়ত।

**Impact.** Category editor (নতুন `CategoryStoryEditor`) · Product editor
(Product story tab) · shop detail (`pickList`) · PDP।

---

## DEC-PRD-024 — Share-এর ছবি upload হবে, ঠিকানা লেখা লাগবে না

**Business Problem.** Search & sharing tab-এ শুধু "https://…" লেখা একটা ঘর
ছিল। মালিকের প্রশ্ন: *"image-এর কীসের link দেব বুঝলাম না।"* — ন্যায্য প্রশ্ন,
কারণ দোকানের কাছে ছবির URL আসবে কোথা থেকে?

**Decision.** সরাসরি upload করা যায়, ঠিক যেভাবে product-এর ছবি হয়। ঘরটা
রয়ে গেছে, কারণ কখনো অন্য জায়গার ছবির ঠিকানা বসাতেই হতে পারে।

**Reason.** যে কাজটা করতে হবে, সেটাই যেন পর্দায় থাকে। "লিংক দিন" একটা
অনুরোধ, উত্তর নয়।

**Impact.** Product editor (Search & sharing) · `generateMetadata` (PDP)।

---

## DEC-PRD-025 — বিক্রির সংখ্যার নিজের মেয়াদ

**Business Problem.** নতুন product-এ "০ জন কিনেছেন" লেখা থাকলে কেউ কেনে না।
তাই একটা শুরুর সংখ্যা দরকার। কিন্তু একটামাত্র সংখ্যা রাখলে সেটা **চিরকাল**
বসে থাকত।

**Decision.** চারটে সময়ের চারটে আলাদা শুরুর সংখ্যা — আজ / এই সপ্তাহ /
এই মাস / সব সময়। কোনটা দেখানো হবে, মালিক বেছে দেন। দেখানো সংখ্যা =
**ওই সময়ের শুরুর সংখ্যা + ওই সময়ের সত্যিকারের order**।

শুরুর সংখ্যার মেয়াদ আছে (`salesSeedAt` থেকে গোনা, বাংলাদেশ সময়ে):

| জানালা | মেয়াদ |
|---|---|
| আজ | যে দিন save করা, শুধু সেই দিন |
| এই সপ্তাহ | ৭ দিন |
| এই মাস | ৩০ দিন |
| সব সময় | কখনো ফুরায় না, শুধু বাড়ে |

**Reason.** মালিকের নিজের যুক্তি, তাঁর ভাষায়: *"always যদি মানুষ দেখে today
10 sale, তাহলে Google আর মানুষের কাছে এটা fake হয়ে যাবে। daily এটা restart
হওয়াই ভালো।"* সংখ্যাটা বিশ্বাস তৈরির জন্য; মেয়াদ না থাকলে সেটাই বিশ্বাস
নষ্ট করত।

**Alternatives.** (ক) একটাই সংখ্যা, চিরকাল — মালিক নিজেই নাকচ করেছেন।
(খ) `salesCount`-এই লেখা — **বিপজ্জনক**, কারণ ওই কলামটা প্রতিটা order-এ
নিজে বাড়ে; মালিকের লেখা সংখ্যা সেটাকে মুছে দিত। তাই seed আলাদা কলামে,
আর `salesCount` শুধু Sales module-এর।

**Impact.** `Product.salesSeed*` × ৪ · `salesSeedAt` · `salesWindow` ·
shop detail (`ordersThisMonth`) · Product editor (Product story tab)।

---

## DEC-PRD-026 — গ্রাহকের নিজের লেখা আর ছবি, product-প্রতি

**Business Problem.** কেকে নাম, মগে ছবি — কিছু product-এ গ্রাহকের কাছ থেকে
কিছু নিতে হয়, বেশিরভাগে নিতে হয় না। কোনো configar করার জায়গাই ছিল না।

**Decision.** দুটো আলাদা switch — লেখা, আর ছবি। প্রতিটার নিজের label,
নিজের ছোট নোট; লেখায় সর্বোচ্চ অক্ষরও দেওয়া যায়। দুটোই বন্ধ থাকলে product
page-এ ওই অংশটা **আঁকাই হয় না**।

**Reason.** মালিক: *"কোথাও image upload আর কোথাও text লেখার জায়গা product
page-এ দিতে হবে, সেটার configar করার জায়গা পেলাম না।"*

**⚠️ খোলা।** গ্রাহকের ছবি এখন শুধু **ফাইলের নাম** রাখে — সত্যিকারের upload
পথটা ইচ্ছে করে বন্ধ (`@Public()` দেওয়া হয়নি)। আলাদা, নিয়ন্ত্রিত একটা route
বানানোর কথা মালিক অনুমোদন করেছেন; **শুরু হয়নি**।

**Impact.** `Product.perso*` × ৮ · shop detail (`perso`) · PDP · Product editor।

---

## DEC-PRD-027 — "Want this customised?" বাক্স, product-প্রতি

**Business Problem.** সব product customise করা যায় না। অথচ WhatsApp-এর সবুজ
বাক্সটা হয় সবখানে থাকত, নয় কোথাও না।

**Decision.** Product-প্রতি একটা switch, নিজের heading আর নিচের লাইন সহ।
নম্বরটা **এখানে লেখা যায় না** — সেটা Company settings থেকে আসে।

**Reason.** মালিক: *"আমরা কোন কোন product-এ customize করতে দিব, যা দিলে পাশে
WhatsApp show করবে — তা customize করার option"*। নম্বর এক জায়গায় রাখার কারণ:
দুই জায়গায় দুটো নম্বর থাকলে একদিন একটা পুরনো হয়ে বসে থাকত।

**⚠️ খোলা।** `CompanySetting.publicPhone` এখন খালি, তাই বাক্সটা কথা দেখায়
কিন্তু button দেখায় না।

**Impact.** `Product.customise*` × ৩ · shop detail (`customise`) · PDP ·
Product editor · Company settings।

---

## DEC-PRD-028 — ছাড়ের শুরু আর শেষের তারিখ

**Business Problem.** Product-এ ছাড় বসানো যেত, কিন্তু সেটা **চিরকাল** চলত।
তিন দিনের একটা offer মানে ছিল: তারিখ মনে রেখে চতুর্থ দিনে নিজে গিয়ে মুছে
দেওয়া। কেউ মনে রাখে না, আর ছাড় মাসের পর মাস চলতে থাকে।

**Decision.** প্রতিটা product-এ দুটো ঐচ্ছিক তারিখ, প্রতিটার নিজের অর্থ:

| | মানে |
|---|---|
| দুটোই খালি | এখনই চলছে, শেষ নেই (আগের আচরণ — পুরনো সব সারি অক্ষত) |
| শুধু শুরু | ওই দিন থেকে |
| শুধু শেষ | ওই দিন **পর্যন্ত**, দিনটা সহ |

শেষ তারিখ দিনটাকে **ধরে** — "১০ আগস্ট পর্যন্ত" মানে ১০ তারিখ দিনভর, দুপুরে
হঠাৎ দাম বেড়ে যাওয়া নয়। দিন গোনা হয় **বাংলাদেশ সময়ে**, server-এর UTC-তে নয়।

সময় ফুরালে ছাড়ের সংখ্যাটা **মোছা হয় না** — শুধু বসে না। তারিখ বাড়ালেই আবার
চলবে, কিছু আবার লিখতে হয় না।

**Reason.** মালিক, ৩ আগস্ট: *"amra jodi nirdisto product a kono offer chalai
like discount, tar timing dewar jayga nei — start date and end date. ja
frontend and admin panel akoi sathe dekhabe ar kaj korbe."*

**Alternatives.** Offers module-এ campaign বানানো। **বাতিল:** ওটা coupon,
শর্ত, অনুমোদন আর অনেক product নিয়ে — এক product-এর নিজের দামের জন্য অতিরিক্ত।
দুটো আলাদা জিনিস, দুটোই থাকছে।

**Impact.** `Product.discountStartsAt` / `discountEndsAt` · `paidPaisa()` ·
storefront grid · PDP · bundle card · upgrade · order line · POS ·
admin margin · Product editor (Pricing tab, live status line)।

---

## DEC-PRD-029 — দামের নিয়ম একটাই জায়গায়

**Business Problem.** DEC-PRD-028 চালাতে গিয়ে ধরা পড়ল: ছাড়ের অঙ্কটা কোড জুড়ে
**ছয় জায়গায়** আলাদা করে লেখা — storefront grid, product page, admin margin,
order line, POS, Offers। একটার পাশে মন্তব্যও লেখা ছিল *"এটা offers.service.ts-এর
সাথে মিলিয়ে রাখতে হবে"*।

বাস্তবে মেলেনি। তারিখের নিয়ম যোগ করার প্রথম চেষ্টায় product page-এ ছাড় বন্ধ
হলো, অথচ grid-এ চলতেই থাকল — **একই পণ্যের দুই দাম, দুই পাতায়**। Admin margin
৪৪% দেখাত যখন দোকান পুরো দামে বিক্রি করছে।

**Decision.** একটাই ফাইল — `apps/api/src/common/discount-window.ts`। সেখানে
`discountLive()` আর `paidPaisa()`। বাকি সবাই সেটাই ডাকে।

**Reason.** মন্তব্য দিয়ে দুটো কপি এক রাখা যায় না; এক কপি রাখলেই যায়। বিশেষ
করে দামে — গ্রাহক এক পাতায় ৳২,১৬০ দেখে অন্য পাতায় ৳২,৪০০ দিলে সেটা শুধু bug
নয়, বিশ্বাস ভাঙা।

**Alternatives.** প্রতিটা কপিতে আলাদা করে তারিখের গেট বসানো। **বাতিল:**
ছয়টার একটা ভুলে গেলে সমস্যাটা ফিরে আসত, আর পরেরবার নতুন নিয়মে আবার একই ঝুঁকি।

**Impact.** `shop/catalog.ts` · `shop/product-detail.ts` ·
`products/products.service.ts` · `orders/orders.service.ts` ·
`pos/pos.service.ts`। (`offers/offers.service.ts` locked module — এখনো নিজের
কপি রাখে, পরে মেলাতে হবে।)

---

## DEC-PRD-030 — category থেকে যা আসছে, সেটা product পর্দাতেও দেখা যাবে

**Business Problem.** DEC-PRD-023-এর পর trust badge আর What's inside category-তে
লেখা হয়, আর website-এ ঠিকঠাক আসে। কিন্তু Product story tab-এ ঘরদুটো **খালিই**
থাকত। মালিকের প্রশ্ন, ৩ আগস্ট:

> "ami catagory page a giye whats inside and trust budge a add krlm... tahole
> product story tab a ata auto show krbe pore ami chaile nijer moto kre edit o
> krte parbo right?"

উত্তর ছিল অর্ধেক হ্যাঁ — website-এ আসত, পর্দায় দেখা যেত না। মালিক পর্দা দেখে
ভাবতেন কিছুই সেট করা নেই, আর হয়তো আবার হাতে লিখতেন।

**Decision.** দুটো card-এ একটা করে বাক্স। দুটো অবস্থা:

| product-এ | পর্দায় |
|---|---|
| কিছু লেখা নেই | category-র সারিগুলো **ধূসর করে** দেখানো + "Use these and edit" button |
| কিছু লেখা আছে | "This product's own — it replaces Demo Gifts's" + ফিরে যাওয়ার পথ |

ধূসর সারিগুলো **কোথাও save হয় না** — শুধু আয়না, website-এ এই মুহূর্তে যা
দেখাচ্ছে তাই। কপি হয় একমাত্র button চাপলে, আর তখন থেকে ওই product নিজের কপি
রাখে।

**Reason.** মালিক নিজে ঠিকই ধরেছেন যে auto আসা উচিত। কিন্তু **auto করে বসিয়ে
দেওয়া নয়** — তাহলে প্রতিটা product নিজের কপি রাখত, আর পরে Categories-এ badge
বদলালে পুরনো product-গুলোতে কিছুই বদলাত না। DEC-PRD-023 যে সমস্যাটা সমাধান
করেছিল, সেটাই ফিরে আসত। তাই: **দেখানো auto, কপি করা হাতে।**

**Alternatives.** (ক) category select করলেই ঘর ভরে যাবে — **বাতিল**, উপরের
কারণে। (খ) শুধু "৩টে badge Demo Gifts থেকে আসছে" লাইন — **বাতিল**, তখন আলাদা
কিছু লাগলে পুরোটা আবার টাইপ করতে হতো।

**⚠️ সাথে ধরা পড়া bug.** `ProductTrustBadge.iconUrl` কলামটা ২ আগস্ট থেকেই ছিল,
কিন্তু DTO-তে না থাকায় **কখনো লেখা হয়নি**। কপি করার পথ বানাতে গিয়ে ধরা পড়ল:
মালিকের upload করা icon কপি হয়ে stock icon-এ নেমে যেত। DTO, admin type আর
`buildDto` — তিনটেতেই যোগ করা হয়েছে।

**Impact.** Product editor (Product story tab — নতুন `FromCategory` component) ·
`ProductTrustBadgeInput.iconUrl` · `ApiProduct.trustBadges` · `TrustRow`।

---

## DEC-PRD-031 — icon মানে icon, লেখা নয়

**Business Problem.** Product-এর trust badge সারিতে icon বাছার ঘরটা ছিল একটা
`<select>`, আর তাতে লেখা থাকত `truck · nationwide`, `bolt · 2-hour` — শব্দ,
ছবি নয়। মালিক, ৩ আগস্ট: *"icon-এ text আসে কেন, এটা তো image আসবে।"*

সমস্যাটা শুধু দেখতে নয়। **দুই পর্দায় দুটো আলাদা তালিকা** চলত:

| | তালিকা | কটা |
|---|---|---|
| Categories | `ICON_NAMES` | ২০টা |
| Product editor | `TRUST_ICONS` (হাতে লেখা) | ৮টা |

মাঝখানে অনুবাদ হতো `startsWith()` দিয়ে। যে নামটা ছোট তালিকায় নেই — `clock`,
`medal`, `globe`, `calendar` — সেটা category থেকে product-এ আসার সময়
**নীরবে অন্য একটা icon-এ নেমে যেত**। DEC-PRD-030-এর কপি button বানানোর দিন
এটাই প্রথম ধরা পড়ল: ⚡ 2-Hour Delivery কপি হয়ে 🚚 হয়ে গেল।

**Decision.** `TRUST_ICONS` তালিকাটা মুছে দেওয়া। Product-এর picker এখন
**হুবহু Categories-এরটাই** — একই ২০টা icon, একই ছবি, একই "Upload your own",
একই ৯৬ × ৯৬ px নির্দেশ। সারিটাও card-এর চেহারা নিয়েছে: বাঁয়ে icon বোতাম,
ডানে দুটো ঘর।

`icon` এখন সরাসরি নাম (`"bolt"`) — কোনো অনুবাদ নেই, তাই ভুলও নেই।

**Reason.** মালিক ঠিক বলেছেন — icon বাছার ঘরে icon দেখাই স্বাভাবিক। কিন্তু
আসল লাভটা তার নিচে: একই জিনিসের দুটো তালিকা রাখলে একদিন সেগুলো আলাদা হয়েই
যায়, আর তখন অনুবাদ নীরবে ভুল উত্তর দেয়। DEC-PRD-029-এর দামের কপির মতোই —
**এক তালিকা রাখলেই মেলে।**

**Alternatives.** ছোট তালিকাটায় বাকি ১২টা নাম যোগ করা। **বাতিল:** তখনও দুটো
তালিকা থাকত, আর পরের বার Categories-এ একটা icon যোগ করলে আবার ফাঁক তৈরি হতো।

**Impact.** Product editor (Trust badges card) · `TrustRow.icon` এখন সাদা নাম ·
`buildDto` থেকে `.split(" ")[0]` উঠে গেছে · `ShopIconPreview` + `ICON_NAMES`
এখন দুই পর্দাতেই।

---

## ৩ আগস্টের পূর্ণ-সংযোগ নিরীক্ষা (DEC-PRD-032 · 033)

মালিকের নির্দেশ: *"basic থেকে pricing পর্যন্ত সব data একে অপরের সাথে connected
হয়েছে কিনা, আর admin panel-এর সব কিছু frontend-এর সাথে connect হয়েছে কিনা
check করবা, সমস্যা পেলে ঠিক করে দিবা।"*

পদ্ধতি: `buildDto`-র ৫৪টা field ↔ load-effect-এর ৬৭টা setter ↔ API DTO ↔
shop endpoint — চার স্তর মিলিয়ে। পাওয়া গেল পাঁচটা ছেঁড়া তার:

**১. Advance (আগাম টাকার নিয়ম) অর্ধেক ফিরত।** Switch-টা load হতো, কিন্তু
FULL/PARTIAL, শতাংশ আর টাকার অঙ্ক হতো না। "PARTIAL ৩০%" save করে আবার খুললে
FULL দেখাত — আর পরের save **চুপচাপ FULL লিখে দিত**। চারটে field-ই এখন ফেরে;
`ApiProduct`-এও তিনটে যোগ হয়েছে (আগে ছিলই না, তাই পড়ার কিছুও ছিল না)।

**২. Nature line-এর লেখা হারাত।** Load করা হতো `natureType` enum থেকে,
মালিকের নিজের `typeText` থেকে নয়। "Handmade" লিখে save → আবার খুললে "fresh" →
পরের save "fresh"-ই লিখে দিত। এখন মালিকের লেখা আগে, enum শুধু fallback।

**৩. DEC-PRD-032 — Bestseller আর New arrival-এর switch ছিল না।** কলাম দুটো,
storefront-এর Bestsellers তাক আর "New" tag — সবই আগে থেকে ছিল; admin-এ বসানোর
কোনো ঘরই ছিল না, তাই কেউ কোনোদিন on করতে পারত না। এখন Basics → How it is
sold-এ দুটো switch।

**৪. DEC-PRD-033 — Delivery tab আর website-এর badge-এর মধ্যে তার ছেঁড়া ছিল
(সবচেয়ে বড়টা)।** Editor লিখত নতুন টেবিলে (`ProductDeliveryType`), আর
storefront-এর badge/filter পড়ত পুরনো তিনটা কলাম (`supportsExpress/SameDay/
Midnight`) — যেগুলো **আর কেউ লিখত না**। মালিক Delivery tab-এ যা-ই বদলান,
website-এ তার ছাপ পড়ত না।

এখন `replaceDeliveryTypes()` join টেবিল লেখার পর তিনটা flag-ও লেখে,
`DeliveryType.timing` থেকে: FROM_CONFIRM → express · TODAY_SLOT → same day ·
PICK_DATE_FIXED → midnight। ধাপ ৪-এ storefront নতুন টেবিল পড়া শিখলে
অনুবাদটা মুছে যাবে।

**৫. মরা delivery-ও badge জ্বালাত।** Live test-এই ধরা: product-এ "2-Hour
Express"-এর একটা পুরনো link ছিল যার কোনো ভাড়া বসানো নেই — editor সেটা লুকিয়ে
সাবধানবাণী দেখায়, checkout কখনো দেয় না, অথচ badge "২ ঘণ্টায়" বলে বসে ছিল।
নিয়ম: গ্রাহককে যা সত্যিই দেওয়া যায় (চালু + ভাড়া আছে), শুধু সেটাই গোনা হয়।

**Live প্রমাণ (Velvet Red):** Express chip on → save → shop `exp:true`;
chip off → save → `exp:false`, Same Day অক্ষত। দাম, trust, spec, FAQ,
variant — সব আগের মতোই।

**সাথে:** সমান্তরাল session-এর `homepage_contents` migration আটকে ছিল
(Prisma client পুরনো, ১৫টা compile error) — `radian_fix_generate.bat` নামে
একটা pause-হীন, নিজে-log-লেখা script বানিয়ে migrate + generate + restart
চালানো হয়েছে। এখন ০ error। Script-টা রয়ে গেল — পরের বার এক click।

---

## এখনো খোলা

| বিষয় | অবস্থা |
|---|---|
| গ্রাহকের ছবি upload | শুধু ফাইলের নাম রাখে; নিয়ন্ত্রিত route বানানো বাকি (DEC-PRD-026) |
| `CompanySetting.publicPhone` | খালি, তাই WhatsApp button আঁকা হয় না (DEC-PRD-027) |
| `offers.service.ts`-এর দামের কপি | DEC-PRD-029-এর বাইরে রয়ে গেছে |
| `OrderLine.costPaisa` snapshot | manual/vendor product-এ COGS ০ |
| `reservedQty` | DEC-MOD-003-এ মজুদ কমে Delivery Processing-এ, তাই gate দেরিতে বন্ধ হয় |
| Category card-এ sold-out | listing-এ মজুদ পড়া হয় না |
| `Product.variantValueId` · `VariantGroup` | DEC-PRD-012-এর পর অব্যবহৃত, মোছা বাকি |
| `BundleCombo` · `BundleComboItem` | DEC-PRD-018-এর পর অব্যবহৃত, মোছা বাকি |

---

## শেখা — প্রয়োগ হয়ে যাওয়া migration কখনো সম্পাদনা করা যায় না

৩ আগস্ট `P2022 — The column Product.salesSeedToday does not exist` এসেছিল।
কারণ: মালিক এক seed থেকে চার seed-এ মত বদলানোর পর আমি **আগে প্রয়োগ হয়ে যাওয়া**
migration ফাইলটা সম্পাদনা করেছিলাম। Prisma প্রয়োগ হওয়া migration আর কখনো
চালায় না — সম্পাদনাটা নীরবে উপেক্ষিত হয়।

**নিয়ম: নতুন ফাইল, সবসময়।** আর নতুন ফাইলটা idempotent (`IF NOT EXISTS`),
যাতে আধা-প্রয়োগ হওয়া database-এও চলে।
