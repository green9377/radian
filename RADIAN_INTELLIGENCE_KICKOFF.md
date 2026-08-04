# Radian — Intelligence module kickoff

_২৯ জুলাই ২০২৬। Marketing শেষ হওয়ার পর মালিকের সিদ্ধান্ত: পরের module **Intelligence**।_

এই ফাইলটা পরের chat-এর জন্য। যা যা জানা দরকার সব এখানে — যাতে নতুন chat শূন্য
থেকে শুরু না করে, আর আগের ভুলগুলো আবার না হয়।

---

## ০. প্রথমেই যা করতে হবে

পড়ো, এই ক্রমে:

1. `D:\radian\RADIAN_INTELLIGENCE_KICKOFF.md` — এইটা
2. `D:\radian\RADIAN_FINAL_REVISION_TODO.md` — **ইচ্ছে করে যা অসমাপ্ত রাখা হয়েছে**
   (২৯ জুলাই লেখা; পুরো সিস্টেমের বাকি কাজের একমাত্র নির্ভরযোগ্য তালিকা)
3. `D:\radian\RADIAN_MODULE_PRIORITY.md` — ৬০ module-এর সংশোধিত মানচিত্র
4. `D:\radian\RADIAN_MARKETING_MODULE_ARCHITECTURE.md` — **§৩ (MKT-D20, D21) ও §১০**
   (গত module-এ কী কী ভুল ধরা পড়েছিল)

Skills লোড করো: `radian-business-context` · `radian-development-context` ·
`module-design-template` · `business-rules-writing` · `architecture-review` ·
`decision-log-writing`।

---

## ১. কাজের নিয়ম (অপরিবর্তিত)

- **বাংলায় কথা, কোড ও UI ইংরেজিতে।** mockup বাংলায় নয়।
- **এক এক করে প্রশ্ন**, প্রতিটার সাথে অপশন ও তোমার সুপারিশ।
- **আমি লক করার আগে কোনো কোড নয়।**
- আমি হিসাব-নিকাশ কম বুঝি — **সহজ করে বুঝিয়ে তারপর জিজ্ঞেস করবে**।
- **আমি টার্মিনাল চালাব না** — সব `.bat` ফাইল, নয়তো তুমি নিজে চালিয়ে দেবে।
- **`schema.prisma` শুধু তুমি ছোঁবে।**
- **আমি বললেই মেনে নেবে না** — ভুল মনে হলে সরাসরি বলবে।
- **module শেষ হবে self-test দিয়ে**, `marketing.selftest.ts`-এর আকৃতিতে।
- একসাথে অনেক কিছু বানিয়ে ফেলবে না — **প্রতিটা টুকরোর পর যাচাই**।

---

## ২. Intelligence কী — মালিকের মানচিত্র অনুযায়ী

**একটা module, চারটে sub-module।** (মালিকের `radian-admin-os.html` মানচিত্র;
sidebar-এ `INTELLIGENCE · 1/4` হিসেবে দেখানো।)

```
Intelligence
├── Executive Dashboard        এক পাতায় গোটা ব্যবসা
├── Reports                    ছাপার যোগ্য · রপ্তানিযোগ্য · সময়মতো নিজে তৈরি
├── Analytics & KPIs           "কেন" — এবং লক্ষ্যমাত্রার বিপরীতে কোথায়
└── Forecasting & AI Insights  পূর্বাভাস (⚠️ নিচের §৬ পড়ো)
```

⚠️ **"Executive Dashboard" module নয়, sub-module।** আগের chat এই ভুলটা করেছিল।

---

## ৩. যা ইতিমধ্যে আছে — Intelligence এগুলোর উপর দাঁড়াবে

**Intelligence কোনো ব্যবসায়িক ডেটার মালিক নয়। এটা শুধু পড়ে।** এটাই এই
module-এর একমাত্র সবচেয়ে গুরুত্বপূর্ণ স্থাপত্য নিয়ম — এবং সবচেয়ে সহজে ভাঙা।

| যা আছে | কোথায় |
|---|---|
| বিক্রি, অর্ডার, চ্যানেল, পেমেন্ট | `Order` · `OrderLine` · `PaymentTransaction` · `Channel` |
| স্টক, নড়াচড়া, অপচয় | `InventoryStock` · `InventoryMovement` · `ItemExpiryLot` |
| টাকার পুরো ছবি | `JournalEntry` / `JournalLine` — **P&L, ব্যালান্স শিট, break-even সব `FinanceService`-এ তৈরি** |
| ডেলিভারি | `DeliveryAssignment` · `Order.deliveryStatus` · Delivery performance |
| POS | `PosShift` · counter sale |
| ক্রয় | `Purchase` · সরবরাহকারীর কর্মক্ষমতা |
| ফেরত | `SalesReturn` |
| কর্মী | `Employee` · `Attendance` · `PayrollLine` |
| গ্রাহক | `Customer` (`ordersCount` · `ltvPaisa` · `lastOrderAt` — Orders ও POS এগুলো বাড়ায়) |
| বিপণন | `Campaign` · `OrderAttribution` · `AdInsight` · `LoyaltyPoint` |

**ইতিমধ্যে তৈরি সারাংশ endpoint** (নতুন করে হিসাব লিখো না — এগুলো ডাকো):

```
GET /finance/overview            P&L · নগদ · break-even
GET /finance/accounts/summary
GET /finance/reports             (একাধিক)
GET /inventory/overview
GET /assembly/overview
GET /purchases/stats
GET /hr/employees/stats
GET /marketing/stats
GET /marketing/affiliates/overview
GET /marketing/loyalty           points দায়
```

**Admin-এ ইতিমধ্যে যেসব রিপোর্ট পর্দা আছে:** `/orders/reports` ·
`/inventory/reports` · `/purchases/reports` · `/finance/reports` ·
`/delivery/performance` · `/products/margin` · `/products/health`।

👉 **Reports sub-module মানে নতুন রিপোর্ট বানানো নয় — এগুলোকে এক কেন্দ্রে আনা**,
তারিখ বাছাই, PDF/Excel রপ্তানি, আর প্রয়োজনে সময়মতো নিজে তৈরি হওয়া।

---

## ৪. স্থাপত্যের নিয়ম — Intelligence-এর জন্য বিশেষভাবে

**ক. Intelligence কোনো সংখ্যা নিজে হিসাব করবে না, যদি সেটা অন্য কোথাও হিসাব হয়ে থাকে।**

এটাই এই module-এর প্রধান ফাঁদ। লাভের অঙ্ক dashboard-এ আলাদা করে হিসাব করলে
একদিন সেটা Finance-এর অঙ্কের সাথে মিলবে না — আর তখন কেউ জানবে না কোনটা সত্যি।
**একটা সংখ্যার একটাই উৎস।** `FinanceService` থেকে ডাকো, নিজে যোগ করো না।

**খ. সংখ্যা দুই জায়গা থেকে এলে, না মিললে পর্দা সেটা বলবে।**

Loyalty পর্দায় এই ধরনটা আছে (`agrees` ক্ষেত্রটা দেখো): points-এর খাতা আর
account ২১৩০ পাশাপাশি দেখানো হয়, আর না মিললে লাল ব্যানার ওঠে — সুন্দর দেখানোর
জন্য একটা বেছে নেওয়া হয় না। **এই module-এ সেটা বহুবার লাগবে।**

**গ. `prisma.db.*` ব্যবহার করো, `prisma.*` নয়** — নইলে soft-deleted সারি
গণনায় ঢুকে যাবে। ব্যতিক্রম: `findUnique`, `groupBy`, `upsert` আর nested
include-এ filter হয় **না**, তাই ওখানে হাতে `deletedAt: null` লিখতে হবে।

**ঘ. টাকা সবসময় পূর্ণসংখ্যা পয়সা।** হার basis point-এ (১০০০ = ১০%)।

**ঙ. Nest route ক্রম** — স্থির path সবসময় `:id`-এর **উপরে**। এই ফাঁদ
/purchases, /products, /suppliers, /hr, /marketing — পাঁচবার ধরেছে।

**চ. singleton টেবিলে `deletedAt` না থাকলে** `soft-delete.extension.ts`-এর
`NO_SOFT_DELETE`-এ নাম যোগ করতে হবে, নইলে প্রতিটা call ৫০০ দেবে।

**ছ. hook নয়, reconciliation।** যে hook ব্যর্থ হয়, নিঃশব্দে ব্যর্থ হয়।
Finance drift checker আর Marketing-এর রাতের সুইপ — দুটোই এই ধরনে।

---

## ৫. কর্মক্ষমতা — এই module-এ এটাই আসল ঝুঁকি

Dashboard মানে **একসাথে ১৫-২০টা প্রশ্ন**। সরল ভাবে লিখলে পর্দা খুলতে ১০ সেকেন্ড
লাগবে, আর তখন কেউ আর খুলবে না।

দুটো পথ, নতুন chat-কে মালিকের সাথে ঠিক করে নিতে হবে:

| | পথ | দাম |
|---|---|---|
| ক | প্রতিবার সরাসরি হিসাব | সবসময় টাটকা, কিন্তু ধীর |
| খ | রাতে/ঘণ্টায় একবার হিসাব করে `DailySnapshot`-এ জমা | দ্রুত, কিন্তু বাসি |
| গ | **আজকের সংখ্যা সরাসরি, ইতিহাস snapshot থেকে** | মিশ্র — আমার সুপারিশ |

**(গ) সুপারিশের কারণ:** "আজ কী হচ্ছে" বাসি হলে অকেজো; "গত ছয় মাসের ধারা"
প্রতিবার নতুন করে হিসাব করা অপচয়। আর snapshot টেবিলটা **Forecasting-এর
ভিত্তিও তৈরি করে দেয়** — §৬ দেখো।

---

## ৬. Forecasting & AI Insights — একটা আপত্তি, খোলাখুলি

**পূর্বাভাসের জন্য অতীত লাগে। Radian-এর বইখাতা শূন্য থেকে শুরু হয়েছে।**

আজ যা বানানো হবে সেটা কিছুই না জেনে শিখবে, আর ভুল পূর্বাভাসের উপর ভিত্তি করে
ফুল কেনা হলে ক্ষতিটা সত্যিকারের টাকায়। `RADIAN_MODULE_PRIORITY.md`-এর Tier ৫-এ
এটা "না বানানোই ভালো" তালিকাতেই আছে, একই কারণে।

**সুপারিশ:** sub-module ১, ২, ৩ বানাও। ৪-এর জায়গায় এখন **শুধু ডেটা জমানোর
ব্যবস্থা** — রোজকার স্ন্যাপশট জমতে থাকুক, যাতে ছয় মাস পর সত্যিকারের পূর্বাভাস
বানানো *সম্ভব* হয়। পর্দাটা খালি থাকবে আর সৎভাবে বলবে "আরও কত মাসের ডেটা
দরকার" — মিথ্যে সংখ্যা দেখাবে না।

**মালিক এই আপত্তিটা শুনেছেন এবং মেনেছেন (২৯ জুলাই)।** তবু নতুন chat যেন
নিজে থেকে যাচাই করে নেয়, অন্ধভাবে না মানে।

---

## ৭. মালিককে যা জিজ্ঞেস করতে হবে (এক এক করে)

1. **সকালে পর্দা খুলে সবার আগে কী?** — (ক) আজ কী করতে হবে · (খ) ব্যবসা কেমন
   চলছে · (গ) টাকা কোথায়। *সুপারিশ: (ক) উপরে, (খ) নিচে। কারণ dashboard-এর
   সবচেয়ে বড় ব্যর্থতা হলো সুন্দর কিন্তু নিষ্ক্রিয় হওয়া — দু'সপ্তাহ পর কেউ আর
   খোলে না। উপরের প্রতিটা লাইন ক্লিক করলে কাজের তালিকায় নিয়ে যাবে।*
2. **টাটকা না দ্রুত** — §৫-এর ক/খ/গ।
3. **KPI-র লক্ষ্যমাত্রা** — মাসিক বিক্রি, মার্জিন, সময়মতো ডেলিভারির হার। কে
   ঠিক করবে, কোথায় বসবে, না পৌঁছালে কী হবে।
4. **Reports** — কোন কোনটা ছাপতে/পাঠাতে হয়? কার কাছে? কোন ফরম্যাটে?
5. **কে কী দেখতে পাবে** — OWNER সব, MANAGER কতটা? লাভের অঙ্ক কর্মী দেখবে কি?
6. **Forecasting** — §৬ অনুযায়ী স্থগিত রাখা ঠিক আছে কি?

---

## ৮. যেসব ফাঁদে আগে পড়েছি — আবার যেন না পড়ি

- **`postEntry()` duplicate `sourceKey`-তে `null` ফেরত দেয়** এবং ফেরত মান
  **চেক করতেই হবে** (DEC-FIN-023 / HR-R28 / MKT-RULE-016)। না করলে পর্দা
  "হয়ে গেছে" বলে, খাতা ফাঁকা থাকে। *Intelligence টাকা লেখে না, তাই এটা এখানে
  সরাসরি লাগার কথা নয় — কিন্তু নিয়মটা জেনে রাখা দরকার।*
- **নথি নম্বর RAW client দিয়ে তৈরি করতে হবে** — soft-deleted সারি তার নম্বর
  ধরে রাখে। `campaignNo`-তে এটা সত্যিকারের বাগ ছিল।
- **singleton `findUnique → create` নয়, `upsert`** — একই পর্দা দুটো call
  করলে দ্বিতীয়টা মরে যায়।
- **Chrome `autoComplete="off"` মানে না।** key/token-এর প্রতিটা ঘরে
  `autoComplete="new-password"` লাগবে, নইলে Chrome সেভ করা পাসওয়ার্ড বসিয়ে দেয়
  (২৯ জুলাই ধরা পড়েছে, তিনটে পর্দায়)।
- **যে self-test কখনো লাল হয়নি, সেটা আবার পড়ো।** ২৯ জুলাই একটা check ভুল
  কারণে পাশ করছিল — নিয়মটা মুছে দিলেও পাশ করত।
- **`tsconfig.build.json` self-test বাদ দেয়।** তাই `radian_check_and_restart.bat`
  ওইটা দেখে, `tsconfig.json` নয়।
- **API sandbox থেকে compile-check করা যায় না** (Prisma client বাসি)। তাই
  syntax/redeclaration যাচাই করতে:
  `node -e "ts.transpileModule → new vm.Script(...)"` — V8 duplicate `const`
  ধরে ফেলে, TypeScript parser ধরে না।

---

## ৯. চালু রাখার হাতিয়ার

| ফাইল | কাজ |
|---|---|
| `START_RADIAN.bat` | Docker + API + panel — রোজ সকালে এইটা |
| `radian_check_and_restart.bat` | build ভাঙেনি নিশ্চিত করে তারপর API restart |
| `radian_api_doctor.bat` | কী ভাঙল দেখায় |
| `_grab_api_log.bat` | নিঃশব্দে `_now.log`-এ লগ লেখে |
| `radian_backup.bat` · `_check` · `_schedule` · `_restore` | ব্যাকআপ |
| `radian_marketing_selftest.bat` | ১৬০টা check, ২৯ জুলাই সব পাশ |

নতুন migration-এর জন্য **নিজের `.bat` লিখতে হবে**, আগেরগুলোর আকৃতিতে
(`radian_loyalty_migrate.bat` সবচেয়ে সাম্প্রতিক উদাহরণ) — ভেতরে মন্তব্যে
লিখতে হবে **কী যোগ হচ্ছে এবং কেন**, যাতে ছ'মাস পরেও বোঝা যায়।

---

## ১০. এই মুহূর্তে সিস্টেম কোথায় (২৯ জুলাই ২০২৬)

**তৈরি ও পরীক্ষিত:** Products · Items · Categories · Tags · Brands ·
Customers · Suppliers · Staff/HR · Orders · POS · Returns · Purchases ·
Inventory · Assembly · Delivery · **Marketing & Growth (সম্পূর্ণ)** ·
Finance · Offers · SEO · Audit · Auth

**তৈরি নয়:** **Intelligence (এই কাজ)** · Ecommerce (storefront ↔ API) ·
Company Settings/Integrations · CMS

**চলছে:** API Docker-এ `:4000` · admin panel `:3001` · Postgres `:5433` ·
storefront `:3000` (**এখনো ১০০% নকল ডেটা — একটাও API call নেই**)

**সবচেয়ে বড় ঝুলে থাকা কাজ:** Ecommerce। অনলাইনে একটাও অর্ডার সিস্টেমে ঢোকে
না। মালিক ইচ্ছে করে এটা শেষে রেখেছেন — সিদ্ধান্ত তাঁর, কিন্তু নতুন chat যেন
জানে।
