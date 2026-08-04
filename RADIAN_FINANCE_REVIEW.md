# Radian Finance Module — Architecture Review

**তারিখ:** 26 Jul 2026 · **পদ্ধতি:** `architecture-review` skill (module-review checklist ১৩ section)
**পরিধি:** `RADIAN_FINANCE_MODULE_ARCHITECTURE.md` v1.0 + বিদ্যমান কোড/schema যাচাই + বাংলাদেশ বাজার-প্রেক্ষিত
**রায়:** ⚠️ **শর্তসাপেক্ষে অনুমোদনযোগ্য** — ৫টি 🔴 কোড শুরুর আগে সারাতে হবে

---

## ১. যা ঠিক আছে (নষ্ট করা যাবে না)

- **Double-entry ভিত্তি** — Radian-এ AVCO inventory, receivable, payable, store-credit ইতিমধ্যেই আছে; সরল cash-ledger নিলে P&L নীরবে ভুল হতো। সিদ্ধান্তটা সঠিক।
- **`Goods Out for Delivery` (1160)** — অপ্রত্যাশিত বোনাস: এটাই **চুরি ধরার যন্ত্র**। মাল গুদাম থেকে বেরিয়েছে কিন্তু না ডেলিভারি হয়েছে, না ফেরত এসেছে — সেটা এখন টাকার অঙ্কে ঝুলে থাকবে। aging report দিলেই ধরা পড়বে।
- **Ledger immutable + reversal** — NBR **VAT আইনের ধারা ৮৩** অনুযায়ী নিরীক্ষক **৫ বছর পিছনের খাতা** খুলতে পারে। immutable ledger + audit trail এখানে বড় সম্পদ।
- **Revenue at `delivered`** — এটা কাকতালীয়ভাবে একটা পরিচিত ফাঁদ এড়ায়: EFD মেশিনে বিক্রির সাথে সাথে VAT দায় বসে যায়, অর্ডার বাতিল হলেও বাতিল অর্ডারের VAT দিতে হয়। delivered-ভিত্তিক স্বীকৃতি সেই ঝুঁকি কমায়।
- **fail-soft posting + replay queue** — বিক্রি কখনো হিসাবের কারণে আটকাবে না।
- **One Data One Owner** অক্ষত — Finance কোনো operational entity দখল করেনি; DAG-এ cycle নেই।

---

## ২. 🔴 Critical — কোড শুরুর আগেই সারাতে হবে

### C1 — VAT ইতিমধ্যেই আদায় হচ্ছে, কিন্তু architecture-এ VAT নেই
**প্রমাণ:** `Order.vatPaisa` · `Order.taxRateBps` · `PosSetting.defaultTaxRateBps` — POS বিক্রিতে
VAT হিসাব করে total-এ যোগ করছে (`pos.service.ts:279`)। অথচ architecture §১২-তে VAT "non-goal" লেখা।

**পরিণতি:** পুরো total Sales Income-এ গেলে **আয় VAT-এর পরিমাণ বেশি দেখাবে**, আর সরকারকে দেয়
টাকাটা নিজের লাভ মনে হবে। VAT আদায় করা টাকা কখনো তোমার আয় নয় — **দায়**।

**সমাধান:** `2400 VAT Payable` account + `1500 VAT Input (rebate)`। বিক্রিতে
Dr Receivable / Cr Sales + **Cr 2400 VAT Payable**। VAT জমা দিলে Dr 2400 / Cr Bank।
→ **DEC-FIN-020**

### C2 — COD-এর টাকা ডেলিভারির দিনে হাতে আসে না (সবচেয়ে বড় নগদ-ভুল)
**প্রমাণ:** `orders.service.ts:372` — `delivered` হলেই পুরো বকেয়ার `COD_COLLECTED` transaction
তৈরি হয়, rider না courier সেটা দেখা হয় না। বাস্তবে Steadfast/Pathao/RedX **৩–৭ দিন পরে**
টাকা পাঠায়, **তাদের চার্জ কেটে**।

**পরিণতি:** সিস্টেম বলবে "ব্যাংকে ৳৪ লাখ", বাস্তবে ৳২.৮ লাখ — বাকিটা কুরিয়ারের কাছে। এই ভুল
ধারণায় সাপ্লায়ারকে টাকা দিতে গেলে চেক bounce করবে। রাইডার টাকা মেরে দিলেও ধরা পড়বে না।

**সমাধান:** নতুন asset account **`1110 Cash with Rider / Courier`** (per-carrier subledger)
- delivered (COD) → Dr **1110** / Cr 1100 Receivable
- rider ড্রয়ারে জমা দিল → Dr 1000 Cash / Cr 1110
- courier remittance এলো → Dr 1040 Bank + Dr 5200 Delivery Cost / Cr 1110
→ **DEC-FIN-021** · পর্দায় "কার কাছে এই মুহূর্তে কত টাকা" — রোজ দেখার সংখ্যা

### C3 — Supplier payment দুইবার বসে যাওয়ার আসল ঝুঁকি
**প্রমাণ:** `suppliers.service.ts:767` — একটা `SupplierPayment` ভেতরে ভেতরে
`PurchasePayment` row তৈরি করে (allocation, SUP-R06)। Event map-এ দুটোকেই source ধরা হয়েছে।

**পরিণতি:** একই টাকা ledger-এ **দুইবার** বেরোবে → নগদ কম, payable ভুল।

**সমাধান:** posting-এর একমাত্র উৎস = `SupplierPayment`। `PurchasePayment` তখনই post হবে যখন
তার `id` কোনো `SupplierPaymentAllocation.purchasePaymentId`-তে **নেই** (সরাসরি purchase payment)।
→ **DEC-FIN-022**

### C4 — Idempotency নেই → replay/retry-তে দ্বিগুণ entry
**পরিণতি:** fail-soft queue-এর replay বা concurrent hook একই ঘটনা দুইবার post করতে পারে।
ledger immutable বলে ভুলটা মুছে ফেলাও যাবে না — reversal-এর জঙ্গল হবে।

**সমাধান:** `JournalEntry`-তে `sourceKey String @unique` = `"{sourceType}:{sourceId}:{kind}"`।
post করার আগে upsert-guard; একই key দুইবার এলে চুপচাপ skip। → **DEC-FIN-023**

### C5 — উৎস রেকর্ড বদলে/মুছে গেলে ledger নীরবে ভুল হয়ে যাবে
**প্রমাণ:** `PaymentTransaction.deletedAt` আছে — posted payment soft-delete করা যায়।
`OrderEditForm` delivered order-এও line বদলাতে পারে (`recomputeMoney` + `reapplyOffers`)।

**পরিণতি:** ledger-এ ৳৫,০০০ আয়, order-এ ৳৪,২০০ — কেউ কোনোদিন টের পাবে না।

**সমাধান:** (ক) posted উৎস রেকর্ডে `financePostedAt` stamp; (খ) stamp থাকলে soft-delete/edit করলে
**বাধ্যতামূলক adjusting entry** (reversal + নতুন) — নীরবে নয়; (গ) রাতে একটা **drift checker**:
order total vs ledger total না মিললে Ledger screen-এ লাল তালিকা। → **DEC-FIN-024**

---

## ৩. 🟠 Major — v1-এ থাকা উচিত

| id | ফাঁক | কেন গুরুত্বপূর্ণ | সমাধান |
|---|---|---|---|
| **M1** | **Period lock নেই** (আমি non-goal লিখেছিলাম — ভুল) | লাভ বণ্টনের পরে কেউ পিছনের তারিখে খরচ বসালে **ইতিমধ্যে ভাগ হওয়া লাভ** বদলে যাবে → পার্টনার বিরোধ | `FinanceSetting.lastClosedDate`; তার আগের তারিখে entry block, override হলে audit + দুই পার্টনারের নাম → **DEC-FIN-025** |
| **M2** | **অনুমোদন শুধু Expense-এ** | সাপ্লায়ার পেমেন্ট · নগদ refund · বড় wastage — এগুলোতেই টাকা বেশি বেরোয় | একই threshold পদ্ধতি supplier payment · cash refund · wastage-এ → **DEC-FIN-026** |
| **M3** | **কোনো লগইন/role নেই (D10)** — `actorName` শুধু টাইপ করা লেখা | Finance এই দুর্বলতাকে **বহুগুণ** করে: যে কেউ যেকোনো নাম দিয়ে টাকা বের করতে পারে, খাতায় দোষ পড়বে অন্যের ঘাড়ে | Finance-এর আগে অন্তত **হালকা লগইন (PIN/user)** — অন্তত টাকা-সংক্রান্ত কাজে। বিস্তারিত §৫ |
| **M4** | **কাস্টমারের অগ্রিম = খরচযোগ্য নগদ মনে হবে** | ভ্যালেন্টাইন/মা দিবসের আগে অগ্রিম জমে; ওটা খরচ করে ফেললে ডেলিভারির দিন ফুল কেনার টাকা থাকবে না | সারসংক্ষেপে **"নিজের টাকা vs গ্রাহকের অগ্রিম"** আলাদা দেখানো (নগদ − 2100) → **DEC-FIN-027** |
| **M5** | **Mushak 6.3 / BIN field নেই** | Radian-এর লক্ষ্য বাজারে **corporate gifting** আছে; কর্পোরেট ক্রেতা VAT challan ছাড়া কিনবে না (rebate দাবি করতে পারে না) | `Order.buyerBin` + VAT challan প্রিন্ট — Tax module-এর আগে ছোট সংস্করণ |
| **M6** | **নষ্ট/adjustment-এ কোনো সীমা নেই** | ফুলের দোকানে সবচেয়ে সহজ চুরির পথ: মাল "নষ্ট" দেখিয়ে সরানো | actor-ভিত্তিক wastage %, মাসিক সীমা ছাড়ালে সতর্কতা → §৫ |

---

## ৪. 🟡 উন্নতির সুযোগ (প্রায় বিনা খরচে, কারণ ডেটা আগে থেকেই আছে)

1. **উৎসব-ভিত্তিক লাভ** — `RecipientOccasion`/`OccasionType` আছে। ভ্যালেন্টাইন · মা দিবস · পহেলা
   ফাল্গুন — কোন উৎসবে আসল লাভ কত, নষ্ট কত। মৌসুমি ব্যবসায় এটাই পরের বছরের ক্রয় পরিকল্পনা।
2. **জোন-ভিত্তিক লাভ** — কুরিয়ার খরচ ধরার পরে কোন এলাকায় ডেলিভারি আসলে লোকসান।
3. **চ্যানেল-ভিত্তিক লাভ** — Facebook বিজ্ঞাপন খরচ vs ওই চ্যানেলের অর্ডার (Meta Ads সংযোগ আছে) →
   এক কাস্টমার আনতে খরচ কত, ফিরে আসছে কিনা।
4. **ক্রয়মূল্যের ওঠানামা** — একই আইটেম আগের বারের চেয়ে বেশি দামে কেনা হলে সতর্কতা (কিকব্যাক ধরার সহজ উপায়)।
5. **নগদ কতদিন চলবে (runway)** — স্থির খরচ জানা আছে, তাই "বর্তমান নগদে আর ৪২ দিন" রোজ দেখানো যায়।
6. **1160 aging** — "৭ দিনের বেশি পথে ঝুলে থাকা মাল" তালিকা = চুরি/হারানোর সরাসরি সংকেত।
7. **VAT-সহ দাম পরিস্থিতি** — বার্ষিক টার্নওভার **~৳৩ কোটি** ছাড়ালে standard VAT বাধ্যতামূলক
   (তার নিচে turnover tax, ঐতিহাসিকভাবে ~৪%)। VAT-inclusive দামে গেলে **একই বিক্রিতে আয় ~১৩% কমে**
   — break-even স্ক্রিনে একটা "VAT চালু হলে" সুইচ রাখলে আগেভাগে প্রস্তুতি নেওয়া যাবে।
8. **EFD/SDC প্রস্তুতি** — খুচরা চেইন ও D2C ই-কমার্সে EFD/SDC বাধ্যতামূলক করা হয়েছে; QR ছাড়া
   হাতে-লেখা চালান লঙ্ঘন। এখনই বিক্রির ডেটা রপ্তানিযোগ্য রাখলে পরে জোড়া লাগানো সহজ।

---

## ৫. System-loss — টাকা/মাল কোন কোন পথে নীরবে বেরোতে পারে

| # | পথ | এখন ধরা পড়বে? | প্রতিকার |
|---|---|---|---|
| ১ | **রাইডার COD টাকা জমা দেয় না** | ❌ (C2 না সারালে) | 1110 Cash with Rider — রোজ "কার কাছে কত" |
| ২ | **কুরিয়ার remittance কম এলো** | ❌ | 1110 vs আসল জমা মিলিয়ে পার্থক্য দৃশ্যমান |
| ৩ | **মাল "নষ্ট" দেখিয়ে সরানো** | আংশিক | actor-ভিত্তিক wastage %, মাসিক সীমা, ছবি বাধ্যতামূলক (M6) |
| ৪ | **stocktake-এ ঘাটতি চাপা দেওয়া** | আংশিক | 5150 adjustment-এ threshold + approval |
| ৫ | **POS-এ দাম কমিয়ে ক্যাশ পকেটে** | আংশিক | `PosDiscountRule` আছে, কিন্তু approval = টাইপ করা নাম (M3)। discount-by-cashier রিপোর্ট |
| ৬ | **`adjustmentPaisa` দিয়ে total কমানো** | ❌ | আলাদা account 4110 Sales Adjustment + কে কত করল রিপোর্ট |
| ৭ | **ভুয়া refund (নগদে)** | আংশিক | refund ≤ collected আছে; নগদ refund-এ approval + দৈনিক তালিকা (M2) |
| ৮ | **বন্ধুকে store credit দেওয়া** | ❌ | 2110-এর মাসিক গতিবিধি রিপোর্ট |
| ৯ | **ভুয়া/স্ফীত সাপ্লায়ার বিল** | ❌ | ক্রয়মূল্য ওঠানামা সতর্কতা + payment approval |
| ১০ | **একই পেমেন্ট দুইবার entry** | ❌ | C3 + C4 (idempotency) |
| ১১ | **posted রেকর্ড মুছে ফেলা** | ❌ | C5 drift checker |
| ১২ | **পিছনের তারিখে খরচ বসিয়ে লাভ কমানো** | ❌ | M1 period lock |
| ১৩ | **ব্যক্তিগত খরচ ব্যবসার খাতায়** | ❌ | threshold approval + মাসিক "পার্টনার-সংশ্লিষ্ট সব লেনদেন" রিপোর্ট |
| ১৪ | **পথে থাকা মাল হারানো** | ✅ **ধরা পড়বে** | 1160 aging — architecture-এর নিজস্ব শক্তি |
| ১৫ | **ড্রয়ারের ক্যাশ কম** | ✅ | POS day-close + reconciliation |

**সবচেয়ে বড় একক দুর্বলতা: M3 — লগইন নেই।** উপরের অর্ধেক প্রতিকারই "কে করল" জানার উপর দাঁড়িয়ে,
অথচ এখন নামটা হাতে টাইপ করা একটা লেখা মাত্র। **সুপারিশ: Finance-এর কোড শুরুর আগে অন্তত
৪-সংখ্যার PIN-ভিত্তিক হালকা লগইন** — পূর্ণ Roles & Permissions পরে হলেও চলবে, কিন্তু টাকা-সংক্রান্ত
প্রতিটি কাজে যাচাইযোগ্য পরিচয় থাকতেই হবে।

---

## ৬. বাজার-প্রেক্ষিত (প্রতিদ্বন্দ্বী ও স্থানীয় সফটওয়্যার)

- **স্থানীয় ERP (Biznify/Softify ঘরানা)** — POS + inventory + সরল আয়-ব্যয় রিপোর্ট দেয়; কিন্তু
  **পার্টনার equity waterfall · AVCO-ভিত্তিক প্রকৃত COGS · উৎসব/জোন-ভিত্তিক লাভ · রাইডার cash custody**
  — এগুলো সাধারণত থাকে না। C1–C5 সারালে Radian এই জায়গায় স্পষ্টভাবে এগিয়ে থাকবে।
- **NBR-এর গতিমুখ (২০২৬)** — LDC graduation + IMF রাজস্ব লক্ষ্যের চাপে স্বয়ংক্রিয় ক্রস-ম্যাচিং,
  EFD/SDC বাধ্যবাধকতা, ৫ বছর পিছনে নিরীক্ষার ক্ষমতা। অর্থাৎ **পরিচ্ছন্ন immutable খাতা এখন
  সুবিধা নয়, রক্ষাকবচ**।
- **টার্নওভার সীমা** — ~৳৩ কোটির নিচে turnover tax (~৪%, বাজেটভেদে বদলায়), উপরে standard VAT ১৫%
  ও input rebate। কর্পোরেট ক্রেতা ধরতে চাইলে standard VAT + Mushak 6.3 কার্যত বাধ্যতামূলক (M5)।
  **এই সংখ্যাগুলো একজন VAT পরামর্শকের সাথে যাচাই করে নিও — বাজেটে প্রতি বছর বদলায়।**

---

## ৭. Checklist সারাংশ

| Section | অবস্থা | নোট |
|---|---|---|
| 1 Identity · 2 Responsibilities · 3 Entities | ✅ | boundary পরিষ্কার, ownership সংঘাত নেই |
| 4 Operations | ✅ | |
| 5 Rules | ⚠️ | idempotency (C4) ও source-mutation (C5) নিয়ে নিয়ম নেই |
| 6 Workflows | ⚠️ | COD custody workflow অনুপস্থিত (C2) |
| 7 Relationships | ⚠️ | supplier/purchase payment দ্বৈত উৎস (C3) |
| 8 Reports · 9 Analytics | ✅ | §৪-এর ৮টি যোগ করলে আরও শক্ত |
| 10 Settings | ⚠️ | period lock · VAT rate · carrier remittance setting নেই |
| 11 **Bangladesh context** | ❌ | **VAT/Mushak/EFD সম্পূর্ণ অনুপস্থিত (C1, M5)** |
| 12 Scalability | ✅ | branchId সর্বত্র; carrier subledger যোগ করলে multi-branch-ও ঠিক |
| 13 Critical gaps | ⚠️ | payment architecture-এ COD custody ফাঁক |

---

## ৮. সুপারিশকৃত নতুন সিদ্ধান্ত (মালিকের অনুমোদন লাগবে)

| ID | সিদ্ধান্ত |
|---|---|
| **DEC-FIN-020** | VAT Payable (2400) + VAT Input (1500) — VAT আদায় = দায়, আয় নয় |
| **DEC-FIN-021** | `1110 Cash with Rider/Courier` — COD টাকা হাতে আসা পর্যন্ত আলাদা ঘরে; courier চার্জ remittance-এ কাটা |
| **DEC-FIN-022** | Supplier payment posting-এর একমাত্র উৎস `SupplierPayment`; allocation-জাত `PurchasePayment` post হবে না |
| **DEC-FIN-023** | `JournalEntry.sourceKey @unique` — এক ঘটনা এক entry (idempotent) |
| **DEC-FIN-024** | `financePostedAt` stamp + বাধ্যতামূলক adjusting entry + রাতের drift checker |
| **DEC-FIN-025** | Period close (`lastClosedDate`) — পিছনের তারিখে entry block, override audited |
| **DEC-FIN-026** | Approval threshold শুধু Expense-এ নয় — supplier payment · নগদ refund · wastage-এও |
| **DEC-FIN-027** | সারসংক্ষেপে "নিজের নগদ vs গ্রাহকের অগ্রিম" আলাদা |
| **DEC-FIN-028** | *(শর্ত)* Finance কোডের আগে হালকা PIN-লগইন — টাকা-সংক্রান্ত কাজে যাচাইযোগ্য পরিচয় |

---

## ৯. পরবর্তী ধাপ

1. মালিক DEC-FIN-020…028 অনুমোদন/সংশোধন করবেন
2. অনুমোদিত অংশ `RADIAN_FINANCE_MODULE_ARCHITECTURE.md`-এ মিশিয়ে v1.1 করা হবে
3. §৪-এর উন্নতিগুলো থেকে কোনগুলো v1-এ, কোনগুলো পরে — মালিকের বাছাই
4. তারপর schema → FinanceService → hooks → screens

**Sources:**
[Biznify (Softifybd) — BD cloud ERP](https://biznify.net/) ·
[2026 VAT Compliance Guide for Bangladesh — AmigoPro](https://www.amigopro.net/insight-vat-compliance-2026) ·
[Turnover Tax vs VAT in Bangladesh 2026 — Rakib Hassan](https://rakibhassan.eu/turnover-tax-vs-vat-in-bangladesh-2026-nbr-guide/) ·
[Mushak 6.3 VAT Challan — ACE Advisory](https://aceadvisory.biz/resource/forms-and-templates/mushak-6.3)
