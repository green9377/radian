# Radian — পরের chat-এর জন্য হ্যান্ডওভার

লেখা: ২৮ জুলাই ২০২৬ · Finance module শেষ হওয়ার পর।

---

## ০. হালনাগাদ — Employee / HR module বানানো হয়েছে (২৮ জুলাই, একই দিনে)

নিচের §৩-এ "পরের module কোনটা" প্রশ্নের উত্তর হয়েছে **Employee / HR**, আর সেটা
কোডসহ শেষ। বিস্তারিত: **`RADIAN_HR_MODULE_ARCHITECTURE.md`** (সিদ্ধান্ত HR-D01…D09,
নিয়ম HR-R01…R17)।

- নতুন টেবিল: `Employee` · `Attendance` · `Payroll` · `PayrollLine`
- `JournalLine.employeeId` যোগ হয়েছে — পুরনো `employeeName`-এর **পাশে**, বদলে নয়
- নতুন পর্দা: `/employees` · `/employees/attendance` · `/employees/payroll`
- `/finance/staff` বদলেছে — নাম টাইপ করার ঘর নেই, কর্মী তালিকা থেকে বাছাই (HR-D06)
- Delivery module-এ **কোনো পরিবর্তন নেই** (HR-D02)
- **চারটে migration চলেছে** (এই ক্রমে): `radian_hr_migrate.bat` →
  `radian_hr_extras_migrate.bat` → `radian_hr_duty_hours_migrate.bat` →
  `radian_hr_times_migrate.bat`

পরের ধাপে যোগ হয়েছে: Job roles master · কর্মীর ছবি · নথি (একাধিক, নিয়োগের সময়ও) ·
প্রতি কর্মীর ডিউটির ঘণ্টা ও শিফট · হাজিরায় in/out সময় (মাঝরাত পেরোনো শিফট সহ) ·
সময় থেকে status নিজে নির্ণয় · practice data লোড/মোছার বোতাম।

**২৮ জুলাই full review + self-test** — মোট ১০টা সমস্যা ধরা পড়ে সারানো হয়েছে,
বিস্তারিত `RADIAN_HR_MODULE_ARCHITECTURE.md` §৯। তিনটে বড়:
একই লোককে এক মাসে দুবার বেতন · চাকরি ছাড়া লোককে টাকা দেওয়ার পথ বন্ধ ছিল ·
**খাতায় কিছু না বসিয়েও run "APPROVED" হয়ে যেত** (HR-R28)।

**`radian_hr_selftest.bat` — ৬৫ passed, ০ failed।** নিজের নকল কর্মী বানিয়ে
হাজিরা-অগ্রিম-পে-রোল-অনুমোদন পুরো পথ চালায়, খাতার এন্ট্রি খুলে মিলিয়ে দেখে,
আর যা আটকানোর কথা সব আটকায় কিনা পরীক্ষা করে — শেষে সব মুছে ফেলে।
**কোড বদলালে এটা আবার চালাও।**

**এখনো মালিকের হাতে (কোড নয়):** §৯-এর শেষে ৪টা খোলা প্রশ্ন — শাখা, নথির ধরন,
আইনি যাচাই। আর module-টা এখনো **আসল ডেটা দিয়ে একবারও চালানো হয়নি**।

Skill `radian-development-context` এখনো Employee-কে "locked, ready to build"
বলছে; architecture project-এ এটাকে **built** করে দেওয়া দরকার।

---

## ১. এই chat-এ কী শেষ হলো

**Finance module — কোডের দিক থেকে সম্পূর্ণ।** পাঁচটা খোলা ফাঁকই বন্ধ:

| ফাঁক | কী হলো |
|---|---|
| G1 Drift checker | খাতা vs দোকান — ১০টা তুলনা, রাত ২টায় নিজে চলে, ইতিহাস AuditLog-এ, Overview-তে ব্যাজ |
| G2 লগইন + PIN | পুরো প্যানেলে global AuthGuard, ৩টা role, People & access পর্দা, নিজের password/PIN বদলানো |
| G3 মূসক ৬.৩ | সরকারি VAT চালান — `/finance/vat`, BIN না বসালে ছাপবে না |
| G4 লোন সংশোধন | posted হলে টাকা-তারিখ জমাট, নয়তো মুক্ত |
| G5 মাস বন্ধ | চলতি মাস বন্ধ করার বাগ সারানো, reopen (OWNER+PIN+audit), settings back door বন্ধ |

বিস্তারিত: `RADIAN_ADMIN_PROGRESS.md` §২৯–§৩৪ক।

### সাথে যেসব বাগ ধরা পড়ে সারানো হয়েছে
- চারটে raw `fetch()` token ছাড়া চলছিল — **profit-sharing preview ও pay-out দুটোই ভাঙা ছিল**
- `x-actor-name` header client যা পাঠাত তা-ই বিশ্বাস করা হতো (Assembly / Customers / Items)
- মাস বন্ধ করলে **চলতি মাসের বাকি দিনগুলোও আটকে যেত** — দোকান বিক্রি তুলতে পারত না
- `PATCH /finance/settings` দিয়ে period lock **PIN ছাড়া, চিহ্ন না রেখে** মোছা যেত

---

## ২. Finance-এর ৪টা লাল দাগ — শেষ (২৮ জুলাই ২০২৬)

**drift এখন ১০/১০ সবুজ।** যেভাবে হলো:

`radian_finance_doctor.bat` (read-only) খাতার প্রতিটা এন্ট্রি বিচার করে দেখাল
**একটাও আসল লেনদেন নেই** — অর্ডার RAD-D001…D012 (demo seeder), ৭টা একই দিনে,
২ গ্রাহক, ০ ক্রয়, loan-এর নোটে "checked by drift test", খরচের নাম
"ACCESS TEST - delete me"। তাই বেছে বেছে না মুছে **খাতা নতুন করে শুরু**।

1. `radian_books_reset.bat` — ৪৫৩টা সারি গেল (খাতা, অর্ডার, স্টক, খরচ, সম্পদ,
   লোন, পে-রোল, নকল গ্রাহক)। মাস্টার ডেটা অক্ষত। জুনের তালাও খুলল।
   **opening balance-এর জমাট সমস্যাও এতেই মিটল** — reverse করতে হয়নি।
2. `radian_finance_finish.bat` — শেষ লাল দাগ: সরবরাহকারী **Kamal Uddin**-এর
   প্রোফাইলে পড়ে থাকা practice opening due ৳৫,০০০। ওটা লেনদেন নয়, মাস্টার
   ডেটার ঘর, তাই reset ছুঁতে পারেনি। সাথে go-live তারিখ ২০২৬-০৭-২৮ বসল আর
   ৫ জন practice কর্মী গেল।
3. fixed/variable — **আগেই সব বসানো ছিল**, ২৯টা খরচ অ্যাকাউন্টের একটাও বাকি নেই।

### এখনো বাকি — শুধু একটা, আর সেটা কোড নয়
**আসল opening balance** — `/finance/accounts`-এ নগদ · bKash · ব্যাংক · স্টক ·
পাওনা · দেনা বসিয়ে **Post**। drift সবুজ থাকবে ওটা ছাড়াও (শূন্যের সাথে শূন্য
মেলে), কিন্তু ততদিন খাতা শূন্য থেকে শুরু — **লাভ বেশি দেখাবে**।
**Post একবারই হয়**, তাই গুনে নিয়ে তবেই।

### ছোট একটা
**BIN পেলে** `/finance/vat`-এ বসালেই মূসক ৬.৩ চালান ছাপা শুরু। VAT নিবন্ধন
না থাকলে দরকার নেই।

### যে ফাইলগুলো রয়ে গেল (কোড বদলালে আবার চালাও)
`radian_finance_doctor.bat` — read-only, খাতার স্বাস্থ্য + প্রতিটা এন্ট্রির বিচার
`radian_hr_selftest.bat` — HR-এর ৬৫টা যাচাই, নিজের ডেটা বানায় ও মুছে ফেলে
`radian_books_reset.bat` · `radian_finance_finish.bat` — দুটোই preview + confirm

---

## ৩. পরের module — কোনটা

> **হালনাগাদ ২৮ জুলাই:** মালিক **Marketing** বেছেছেন।
> নতুন chat শুরু করার সব কিছু আছে **`RADIAN_MARKETING_KICKOFF.md`**-এ।
> নিচের তুলনার তালিকাটা ইতিহাস হিসেবে রাখা হলো।

`RADIAN_ADMIN_MODULES.md` §৩ অনুযায়ী Phase A-র সব **বানানো হয়ে গেছে**:
Products · Categories · Items · Customers · Suppliers · Orders · POS · Returns ·
Purchases · Offers · Inventory · Assembly · Delivery · Finance.

তাই এখন **Phase B** থেকে বাছতে হবে:

| module | কেন এখন | কেন পরে |
|---|---|---|
| **Settings / Company + Integrations** | Trade License · BIN · VAT · TIN রাখার জায়গা (মূসক ৬.৩ এখন এর জন্য অপেক্ষা করছে), আর SSLCommerz / WhatsApp / Cloudinary key — এগুলো ছাড়া storefront আসল টাকা নিতে পারবে না | ছোট module, ব্যবসায়িক যুক্তি কম |
| **Employee / HR** | Finance-এ staff salary ও advance আছে কিন্তু **Employee master নেই** — নাম এখন টাইপ করা string। কর্মী নিয়োগের আগে দরকার | কর্মী না থাকলে অপেক্ষা করা যায় |
| **CRM / Customer Experience** | occasion reminder = ফুলের দোকানের সবচেয়ে বড় repeat-sales যন্ত্র | আগে অর্ডার প্রবাহ আসল হওয়া দরকার |
| **Content / CMS** | journal · FAQ · legal page এখনো mock | বিক্রিতে সরাসরি প্রভাব কম |
| **Marketing & Growth** | campaign · SEO · loyalty | সবচেয়ে পরে |

**আমার সুপারিশ: Settings / Company + Integrations।**
কারণ দুটো — (ক) payment gateway key ছাড়া storefront আসল টাকা নিতে পারে না, তাই
এটাই এখন সবচেয়ে বড় blocker; (খ) মূসক ৬.৩ ও কোম্পানির কাগজপত্র একই জায়গায় বসবে,
তখন Finance-এর শেষ নির্ভরতাটাও মিটে যাবে।

**দ্বিতীয় পছন্দ: Employee / HR** — কর্মী নিয়োগের পরিকল্পনা কাছাকাছি হলে এটা আগে,
কারণ Finance-এর salary/advance এখন নামের string ধরে চলছে, আসল Employee master নয়।

---

## ৪. পরের chat-এ প্রথম মেসেজ (কপি করো)

```
Radian Business OS — পরের module বানাব।

আগে এই ফাইলগুলো পড়ো:
1. D:\radian\RADIAN_NEXT_CHAT_HANDOFF.md   (এইটা — কোথায় আছি)
2. D:\radian\RADIAN_ADMIN_MODULES.md        (module map + কাজের ছন্দ)
3. D:\radian\RADIAN_ADMIN_PROGRESS.md       (শেষ ৫টা §)

তারপর skills লোড করো: radian-business-context, radian-development-context,
module-design-template, business-rules-writing, architecture-review,
decision-log-writing.

নিয়ম আগের মতোই:
- বাংলায় কথা, কোড ও UI ইংরেজিতে
- এক এক করে প্রশ্ন, আমি লক করার আগে কোড নয়
- আমি টার্মিনাল চালাব না — সব .bat ফাইল, নয়তো তুমি নিজে চালিয়ে দেবে
- schema.prisma শুধু তুমি ছোঁবে
- আমি বললেই মেনে নেবে না — ভুল মনে হলে বলো

module: ______ (Settings/Company · Employee · CRM · CMS · Marketing)
```

---

## ৫. পরিবেশ (মনে রাখার জন্য)

- Postgres · API · web — Docker-এ (`docker compose`), admin panel host-এ `:3001`
- API `:4000` · storefront `:3000` · Postgres host-এ `5433`
- **API-র watcher host-এর ফাইল বদল টের পায় না** — কোড বদলালে `D:\radian\radian_lock_all.bat` (শুধু restart)
- migration লাগলে আলাদা `.bat` লিখতে হবে; কোড লিখে migration না চালালে API boot করবে না (আগে একবার হয়েছে)
- লগইন: `sobuj` / OWNER · টাকার প্রতিটা কাজে ৪ সংখ্যার PIN
