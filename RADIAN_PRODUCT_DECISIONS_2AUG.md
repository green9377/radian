# Product page — ২ আগস্ট ২০২৬-এর সিদ্ধান্তগুলো

**পদ্ধতি:** `decision-log-writing` skill-এর ৭টা উপাদান — Business Problem ·
Decision · Reason · Alternatives · Impact · Future Review · Related.
**Prefix:** কোডে ইতিমধ্যে `DEC-PRD-*` লেখা আছে (Product domain), তাই সেটাই রাখা
হলো — skill-এর তালিকায় `DEC-MOD`/`DEC-RULE`-এর কাছাকাছি, কিন্তু কোড আর
document এক নামে ডাকাই বেশি জরুরি।
**Status:** সবগুলো **Active**।
**Decided By:** মালিক (sobuj) · **Recorded By:** development session

> ⚠️ এই ফাইলটা কোডের বদলে নয়, কোডের **সাথে**। প্রতিটা সিদ্ধান্তের কারণ
> সংশ্লিষ্ট ফাইলের মন্তব্যেও আছে; এখানে এক জায়গায় পুরো ছবিটা।

---

## চালানো বাকি

```
radian_bundle_items_migrate.bat     ← BundleItem টেবিল (DEC-PRD-017/018)
radian_apply.bat                    ← API-র সব পরিবর্তন
```

আগে চালানো হয়েছে: `radian_product_variants_migrate` · `radian_variant_item_migrate`
· `radian_bundle_combo_migrate`।

---

## DEC-PRD-012 — এক product page, তার ভেতরে সব রঙ

**Business Problem.** পুরনো নকশায় প্রতিটা রঙ ছিল **আলাদা product**, আর
`VariantGroup` দিয়ে তারা বাঁধা। কারণটা ভালো ছিল — প্রতি রঙের নিজের মজুদ, ছবি,
Google page। কিন্তু product-কে group-এ ঢোকানোর পর্দা কখনো বানানো হয়নি: টেবিল
ছিল, API পড়তও, হাতল ছিল না। ফল — swatch বাস্তবে কোনোদিন দেখা যায়নি, আর মালিক
ধরলেন: *"আমরা just উপরের variant থেকে একটাই choose করতে পারি, এটা কেন?"*

**Decision.** এক product page-এর ভেতরেই সব রঙ/ফ্লেভার/মাপ থাকবে
(`ProductVariant`), **প্রতিটার নিজের ছবি, নিজের মজুদ, আর ঐচ্ছিক নিজের দাম**।
দাম খালি রাখলে product-এর মূল দামই চলে।

**Reason.** মালিকের হুবহু কথা: *"protitar alada image and stock agula hbe"*, আর
*"same product just color change হলে দাম same থাকবে, আবার kg change হলে আলাদা
হবে"*। দাম nullable রাখায় প্রতিটা রঙে একই সংখ্যা লিখে রাখতে হয় না — নাহলে
একদিন একটা বদলাতে ভুলে দুই দাম পাশাপাশি বসে থাকত।

**Alternatives.** পুরনো নকশা রেখে group-এ ঢোকানোর পর্দাটা বানানো। **বাতিল:**
মালিক জেনেই বেছেছেন — Google-এ তিনটে page-এর বদলে একটা, বিনিময়ে গ্রাহকের
কেনার পথ ছোট।

**Impact.** Product · Storefront PDP · Cart (`variantId`) · Order snapshot
(`variantLabel`)। পুরনো `Product.variantValueId` আর `VariantGroup` **মোছা
হয়নি** — আলাদা pass-এ উঠবে।

**Future Review.** এক page-এ ২০+ রঙ হলে page ভারী হবে — তখন গুচ্ছ করে দেখানোর
কথা ভাবতে হবে।

**Related.** Enables DEC-PRD-014, DEC-PRD-015।

---

## DEC-PRD-014 — variant থাকলে মজুদ variant-এরই

**Business Problem.** DEC-PRD-012-এর পর এক product-এ **দুই জায়গায়** সংখ্যা
লেখা যেত — Stock tab-এ একটা, প্রতি রঙে একটা। Website product-এর ঘরটা পড়ত, তাই
Deep Red 6 + Pink 4 থাকা সত্ত্বেও page বলত "Out of stock"।

**Decision.** variant থাকলে **variant-এর যোগফলই** আসল মজুদ — website, order
gate, All products তালিকা, Overview-এর গোনা, সব জায়গায়। Stock tab-এর ঘরটা তখন
তালাবদ্ধ হয়ে যোগফল দেখায়। **ব্যতিক্রম:** সব variant-এর ঘর ০ হলে product-এর
নিজের সংখ্যাটাই চলে।

**Reason.** এক জিনিসের দুটো সংখ্যা মানে একদিন দুটোই ভুল। ব্যতিক্রমটা ইচ্ছাকৃত —
ঘর ভরতে ভুলে গেলে দোকানে জিনিস থাকা অবস্থায় বিক্রি বন্ধ হয়ে যেত।

**Alternatives.** দুটোই মানা (product 0 হলে সব বন্ধ)। **বাতিল:** মালিককে প্রতি
product-এ দুই জায়গায় সংখ্যা ঠিক রাখতে হতো।

**Impact.** `availabilityOf()` · Orders `assertBuyable` · shop detail · products
list · Bundle card লুকানোর নিয়ম।

**Related.** Depends on DEC-PDP-09 · DEC-PRD-012।

---

## DEC-PRD-015 — প্রতিটা রঙের নিজের stockroom Item

**Business Problem.** DEC-PRD-014-এর মজুদ কেবল **হাতে লেখা** যেত। দোকানের গোনা
যখন Inventory রাখে, তখন হাতে লেখা সংখ্যাটা দ্বিতীয় সত্য হয়ে দাঁড়াত।

**Decision.** `ProductVariant.itemId` — product **Tracked** হলে প্রতিটা রঙ নিজের
Item-এর দিকে দেখাবে (Stock tab-এ product যেভাবে Item ডাকে, হুবহু সেভাবে)।
Manual হলে আগের মতোই হাতে সংখ্যা। রঙে Item না বাছলে product-এর Item-ই ধরা হয়।

**Reason.** মালিকের কথা: *"inventory থেকে যদি আনা লাগে তাহলে stock and lead
time-এ আমরা যেভাবে inventory থেকে product ডেকেছি সেভাবে ডাকবে"*। Stockroom-এ লাল
আর গোলাপি গোলাপ আলাদা তাকে, আলাদা গোনা।

**Alternatives.** এক Item-এর ভেতরে রঙভিত্তিক lot। **বাতিল:** Inventory module
(DEC-ITM-005) মজুদের একমাত্র মালিক — সেখানে নতুন ধারণা ঢোকানো মানে দুই
module-এ একই কাজ।

**Impact.** Prisma `ProductVariant` · Product editor variant card · Inventory
(পড়া মাত্র)। ⚠️ Item-ভিত্তিক variant-এর **gate এখনো নেই** — DEC-PDP-09
অনুযায়ী TRACKED product এমনিতেই gate-এর বাইরে।

**Future Review.** Inventory থেকে সরাসরি variant-এর সংখ্যা টানা লাগলে (gate সহ)
সেটা আলাদা সিদ্ধান্ত।

---

## DEC-PRD-018 — এক product = একটাই bundle তালিকা, একটাই ছাড়

**Business Problem.** প্রথম নকশায় এক bundle = **একটা** product আর তার নিজের ছাড়।
তিনটে জিনিস দিতে হলে তিনটে সারি, তিনটে আলাদা ছাড়, আর "সব মিলিয়ে এত" বলার কোনো
জায়গাই নেই। মালিক: *"protita product a individually discount ditachi... ata ami
chai na"*।

**Decision.** এক product-এ **একটাই তালিকা** — মালিক ৩-৪টা product রাখেন — আর
তালিকার নিচে **একটাই ছাড়ের ঘর**। গ্রাহক যা খুশি নেয়, বাকিগুলো skip করে।
**একটাও নিলেই** ছাড় বসে, **main product সহ** মোট দামের উপর। কিছু না নিলে ছাড়
নেই।

**Reason.** মালিকের নিজের ভাষায়: *"just main product নিলে কোনো discount নেই, আর
সাথে extra কোনো bundle থেকে product select করলেই সে discount পাবে"*। এতে
"গ্রাহক কয়টা bundle নেবে" আর "কোন bundle-এ main গোনা হবে" — দুটো প্রশ্নই
অদৃশ্য হয়ে যায়।

**Alternatives.**
· *প্যাকেজ (combo) — নির্দিষ্ট set-এ নির্দিষ্ট দাম* (DEC-PRD-016 হিসেবে বানানো
হয়েছিল)। **বাতিল:** ৫টা জিনিস মানে ৩১টা combination; হাতে লেখা অসম্ভব, আর
অর্ধেক লেখা তালিকা গ্রাহকের কাছে খামখেয়ালি দাম।
· *কয়টা নিল তার উপর ধাপে ধাপে ছাড়।* **বাতিল:** মালিক নাকচ করেছেন।

**Impact.** `Bundle` + নতুন `BundleItem` · shop detail (`bundle`) ·
`bundlePricing.ts` (এক জায়গায় হিসাব) · PDP · Cart · Order · Admin BundleEditor।
⚠️ `BundleCombo`/`BundleComboItem` টেবিল **অব্যবহৃত** কিন্তু মোছা হয়নি।

**Related.** Supersedes DEC-PRD-013 (একাধিক bundle) আর DEC-PRD-016 (combo দাম) ·
Supersedes DEC-PRD-017 (এক bundle = কয়েকটা product, প্রথমটায় main)।

---

## DEC-PRD-019 — দাম-সংক্রান্ত সব সিদ্ধান্ত Pricing tab-এ, আর tab-টা শেষে

**Business Problem.** Pricing tab ছিল দ্বিতীয়। কিন্তু দাম আর একটা সংখ্যা নয় —
রঙ/মাপে আলাদা দাম বসে (DEC-PRD-012), bundle-এর ছাড় main সহ মোট দামের উপর বসে
(DEC-PRD-018)। মালিক আগে একটা সংখ্যা লিখতেন, পরের দুটো tab সেটা বদলে দিত, আর
তিনি দুবার একই সিদ্ধান্ত নিতেন।

**Decision.** Pricing tab **সবার শেষে**। bundle-এর ছাড়ের ঘরটা Bundles card থেকে
সরে **Pricing tab-এ**। Pricing-এ একটা "What the customer pays" card — product-এর
দাম, রঙভিত্তিক আলাদা দাম, bundle-এর জিনিস ও তাদের দাম, ছাড়ের পরে গ্রাহক কত
দেবে, আর **লাভ কত** (bundle-এর জিনিসের খরচ সহ)।

**Reason.** মালিকের কথা: *"ami chai price tab sheshe thakuk and sekhanei price ar
sob calculation hok"* আর *"discount dile bundle product soho dekhabe koto discount
koto amdr profit"*। যে সংখ্যাটা লেখা হচ্ছে তার ফল ঠিক তার নিচেই দেখা গেলে মাথায়
হিসাব করতে হয় না।

**Alternatives.** প্রতিটা tab-এ তার নিজের দাম। **বাতিল:** তিন পর্দায় ছড়ানো
থাকলে মোট ছবিটা কোথাও দেখা যায় না — মালিক ঠিক এটাই ধরেছেন।

**Impact.** Product editor (SECTIONS-এর ক্রম, Pricing card, BundleEditor থেকে
ছাড় বাদ) · `/bundles/list` API-তে `costPaisa` ও `itemsCostPaisa`।
⚠️ নতুন (না-সংরক্ষিত) product-এ লাভ দেখানো হয় না — তখন bundle-এর জিনিসের খরচ
জানা যায় না, আর শূন্য ধরলে লাভ বেশি দেখাত।

---

## DEC-PRD-020 — Upgrade মানে দাম বদলায়, page নয়

**Business Problem.** `Product.upgradeOfProductId` schema-তে ২৬ জুলাই থেকেই ছিল,
admin-এ বাছাও যেত, **কিন্তু storefront কোনোদিন এটা পড়েনি** — মালিক যা বাছতেন তা
কোথাও দেখাত না। admin-এ লেখা ছিল "clicking it swaps the price and photo in
place" — একটা প্রতিশ্রুতি যা website রাখত না। (হুবহু একই ভুল DEC-PRD-012-এর
swatch-এ হয়েছিল।)

**Decision.** Product page-এর উপরে একটা সারি: এই product + তার সব upgrade,
গোল চিহ্ন দিয়ে (একটাই বাছা যায়)। Click করলে **দাম আর ছবি এই page-এই বদলায়,
URL বদলায় না**। কেনার সময় cart-এ **upgrade product-এর slug** যায়। Upgrade বাছলে
রঙ আর bundle-এর বাছাই মুছে যায়। Draft বা মজুদ-শেষ upgrade দেখানোই হয় না।

**Reason.** মালিকের কথা: *"upgrade product-এ click করলে price change হবে কিন্তু
অন্য page-এ যেন না নেয়"*। slug বদলানো জরুরি কারণ upgrade একটা সত্যিকারের আলাদা
product — নাহলে দোকানে ২৪টা গোলাপের order যেত আর গ্রাহক ৫০টার দাম দিতেন।
বাছাই মুছে যায় কারণ ওই রঙ/তালিকা অন্য product-এর।

**Alternatives.** Link করে অন্য page-এ নেওয়া। **বাতিল:** মালিক স্পষ্ট নাকচ
করেছেন; তুলনার মাঝপথে page ছেড়ে গেলে ফেরার পথ হারায়।

**Impact.** shop detail (`upgrades`) · PDP (`UpgradeRow`) · Cart (slug) · Admin
Upgrade card (এখন কথাটা সত্যি)।

---

## DEC-PRD-021 — পুরনো "Sizes" card তুলে দেওয়া

**Business Problem.** Variants master আসার পর "Sizes" card একই কাজ করত, কম
ভালোভাবে: শুধু এই product-এ, ছবি রাখা যায় না, আর তার "Stock" ঘরটা লেখা যেত
কিন্তু কোথাও save হতো না (database-এ কলামই নেই)।

**Decision.** Product editor থেকে Sizes card বাদ। মাপ এখন Variants তালিকা থেকে —
নিজের ছবি আর নিজের মজুদ সহ। `ProductSize` টেবিল, API আর website-এর size row
**অক্ষত**; `buildDto` `sizes` পাঠায়ই না, তাই পুরনো সারি মোছে না।

**Reason.** মালিক: *"size ta tahole to dorkar nai ata soraia daw"*। চেক করে
দেখা গেছে ৮টা product-এর একটাতেও পুরনো size নেই — তাই বাস্তবে হারানোর কিছু নেই।

**Impact.** Product editor · (সম্ভাব্য) পুরনো size-ওয়ালা product, যদি কখনো থাকে।

---

## এখনো খোলা (আগের session থেকে)

| বিষয় | অবস্থা |
|---|---|
| `OrderLine.costPaisa` snapshot | manual/vendor product-এ COGS ০ |
| `reservedQty` | DEC-MOD-003-এ মজুদ কমে Delivery Processing-এ, তাই gate দেরিতে বন্ধ হয় |
| "Display Scarcity Counter" | locked decision-এর সাথে `displayQty`-র দ্বন্দ্ব |
| Category card-এ sold-out | listing-এ মজুদ পড়া হয় না |
| `Product.variantValueId` · `VariantGroup` | DEC-PRD-012-এর পর অব্যবহৃত, মোছা বাকি |
| `BundleCombo` · `BundleComboItem` | DEC-PRD-018-এর পর অব্যবহৃত, মোছা বাকি |
