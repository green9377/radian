# Biznify vs Radian Finance — ফাঁক বিশ্লেষণ

**তারিখ:** 26 Jul 2026 · **উৎস:** মালিকের নিজের Biznify account (app.biznify.net) — accounting
module, chart of accounts, transaction screens ও পূর্ণ report তালিকা পড়া হয়েছে (read-only)।

**এক লাইনে:** Biznify = Wave-ঘরানার **সাধারণ হিসাবরক্ষণ** (account description-এ আক্ষরিক
"entered in Wave" লেখা আছে)। প্রশস্ত কিন্তু সাধারণ। Radian Finance = **এই ব্যবসার জন্য বানানো**
সংকীর্ণ কিন্তু গভীর। দুটোর শক্তি দুই জায়গায় — নিচে ধরে ধরে।

---

## ১. ওদের যা আছে, আমাদের নেই — এবং সত্যিই দরকার

| # | কী | কেন দরকার | অগ্রাধিকার |
|---|---|---|---|
| **G1** | **Recurring journal** (মাসে মাসে নিজে বসে) | ভাড়া · ইন্টারনেট · বেতন · গ্যারেজ ভাড়া — প্রতি মাসে হাতে বসানো মানে ভুলে যাওয়া, আর ভুলে গেলে খরচ কম দেখাবে → লাভ মিথ্যা বেশি, break-even মিথ্যা কম | 🔴 |
| **G2** | **কর্মীর অগ্রিম বেতন (advance salary)** | ওদের chart-এ `Advance Salary Rion/Minhaz/Rajib/Rifat/sobuj` — **প্রতি কর্মীর জন্য আলাদা account** বানাতে হয়েছে। মানে বাস্তবে এটা রোজ লাগে। আমাদের কিছুই নেই | 🔴 |
| **G3** | **Account গুচ্ছ (Type → Group → Account)** | ওদের P&L-এ "Operating Expense", "Payroll", "COGS" আলাদা উপ-যোগফল দেখায়। আমাদের ৫১টা account সমতল — রিপোর্ট পড়তে কষ্ট হবে | 🟠 |
| **G4** | **প্রতিটি account-এ ব্যাখ্যা** | "Repairs & Maintenance — মেরামত, কিন্তু মান বাড়ানো নয়" — এই এক লাইনেই ভুল জায়গায় খরচ বসানো বন্ধ হয় | 🟠 |
| **G5** | **Uncategorized Expense** (আশ্রয়-ঘর) | কোন ধরনে ফেলব বুঝতে না পারলে এখানে রাখো, পরে ঠিক করো — entry কখনো আটকায় না | 🟠 |
| **G6** | **Manual Journal (Dr/Cr) screen** | আমরা ইচ্ছাকৃতভাবে Dr/Cr লুকিয়েছি (DEC-FIN-001) — ঠিক আছে। **কিন্তু বছর শেষে হিসাবরক্ষক সমন্বয় entry দিতে চাইলে কোনো দরজাই নেই।** "Accountant mode" হিসেবে লুকানো একটা পাতা লাগবে | 🟠 |
| **G7** | **Multi-currency / FX loss** | ওদের chart-এ `Export Import (Cost)` **এবং** `Loss on Foreign Exchange` — অর্থাৎ বিদেশ থেকে আনা হয়। আমরা শুধু টাকা ধরেছি | 🟡 |
| **G8** | **পূর্ণ HRM + Payroll** | Attendance · OT · Payslip · Salary sheet · Leave · Resign/Rejoin — আমাদের Employee module এখনো বানানোই হয়নি | 🟡 (আলাদা module) |

### ওদের যেসব রিপোর্ট আমাদের তালিকায় নেই
- **Daily / Monthly / Yearly Balance Flow** — প্রতি ঘরের দিন-শুরুর ও দিন-শেষের ব্যালেন্স। নগদ-নির্ভর দোকানে এটাই সবচেয়ে বেশি খোলা হয় ⭐
- **Customer Ledger / Supplier Ledger** — এক গ্রাহক/সরবরাহকারীর সব লেনদেন এক পাতায়
- **General Ledger · Account Balance · Trial Balance · Balance Sheet** (আমাদের ডেটায় সম্ভব, screen বাকি)
- **Invoice-wise profit** (প্রতি অর্ডারে কত লাভ) — আমাদের dimension আছে, রিপোর্ট বাকি
- **Item Stock Valuation** (AVCO যাচাই) · **Expiring Batch** (ফুলে ভয়ানক প্রাসঙ্গিক) · **Low Stock**
- **Comparison on Delivery Charges** — কোন কুরিয়ার সস্তা

---

## ২. আমাদের যা আছে, ওদের নেই — এখানেই Radian এগিয়ে

| # | কী | কেন এটা বড় ব্যাপার |
|---|---|---|
| **R1** | **COD custody** (`1110 Cash with Rider/Courier` + remittance, চার্জ কেটে) | Biznify-তে এই ধারণাই নেই। ডেলিভারিতেই টাকা "পাওয়া গেছে" ধরে নেয় → **BD-র ডেলিভারি-নির্ভর ব্যবসায় নগদের অঙ্ক সবচেয়ে বড় মিথ্যা এখানেই হয়** |
| **R2** | **`Goods Out for Delivery` holding** | preparing→delivered-এর মাঝখানের মাল। ফেল/ফেরতে লাভ-ক্ষতিতে দাগ পড়ে না, আর "পথে ঝুলে থাকা মাল" চুরি ধরার যন্ত্র |
| **R3** | **পার্টনার খাতা + capital-first waterfall** | ওদের Owner's Equity মাত্র ৫টা সাধারণ account — কে কত ঢেলেছে, কত ফেরত বাকি, লাভ কীভাবে ভাগ হবে — কিছুই নেই |
| **R4** | **fixed/variable ট্যাগ → auto break-even** | ওদের ৫০টা expense account-এ cost-behaviour ঘরই নেই, তাই break-even হিসাব করাই অসম্ভব |
| **R5** | **ledger immutable + idempotency + drift checker** | ওদের journal সম্পাদনযোগ্য (সাধারণ ধারা)। আমাদের সংশোধন = reversal, আর এক ঘটনা এক entry |
| **R6** | **প্রতি ledger লাইনে occasion · zone · channel dimension** | ভ্যালেন্টাইনে আসল লাভ কত, কোন এলাকায় লোকসান, Facebook থেকে আসা অর্ডারে মার্জিন — ওদের শুধু item/customer wise |
| **R7** | **টাকা বেরোনোর ৪টা পথে approval threshold** | ওদের approval নেই |
| **R8** | **নিজের Orders/POS/Inventory-র সাথে সরাসরি জোড়া (AVCO COGS)** | Biznify আলাদা সিস্টেম হলে দুবার এন্ট্রি বা import — সেখানেই সংখ্যা আলাদা হয়ে যায় |

---

## ৩. ওদের ডেটা দেখে যে শিক্ষা (একই ভুল যেন আমরা না করি)

1. **কর্মী-প্রতি আলাদা account** (`Advance Salary Rion`, `…Minhaz`, `…Rajib`, `…Rifat`, `…sobuj`)
   → chart of accounts আবর্জনায় ভরে যায়। **সঠিক পথ:** একটাই account `1210 Employee Advance`,
   আর কে সেটা `JournalLine`-এর dimension-এ (আমাদের `partnerId`-এর মতো `employeeId`)।
2. **কোড ছাড়া account** (Branding & Design · Shop Nasta · Others Cost — কোনো নম্বর নেই)
   → রিপোর্টে সাজানো যায় না। আমাদের code বাধ্যতামূলক ✓
3. **একই কোড দুইবার** — `5022` একবার "Cost of Goods Sold", আরেকবার "Purchase"।
   আমাদের `code @unique` ✓
4. **"Old Expense" / "Others Cost" / "Adjustment"-এর ছড়াছড়ি** → শ্রেণিবিন্যাস ভেঙে পড়ার লক্ষণ।
   G4 (ব্যাখ্যা) + G5 (Uncategorized) থাকলে এটা কমে।

**তবে ওদের কাছ থেকে সরাসরি নেওয়ার মতো account নাম** (আমাদের chart-এ যোগ করা উচিত — এগুলো
তোমাদের বাস্তব খরচ): Branding & Design · Event cost · Export/Import cost · Temporary Worker Cost ·
Transportation cost · Website development · Shop Nasta (কর্মীর নাশতা) · Additional Charges ·
Professional/Accounting fees · Insurance · Meals & Entertainment।

---

## ৪. সুপারিশ — কী করব

### এখনই (ধাপ ২-এর সাথে)
- **A1 · Recurring expense** — ধরন · অঙ্ক · কোন ঘর থেকে · প্রতি মাসের কত তারিখে → মাস এলে
  খসড়া তৈরি, এক ক্লিকে পোস্ট (নীরবে নয় — মালিক দেখে নিশ্চিত করবেন)
- **A2 · কর্মীর অগ্রিম বেতন** — `1210 Employee Advance` (asset) + বেতনের সময় কাটা।
  Employee master নেই বলে আপাতত নাম snapshot, module এলে FK
- **A3 · Account গুচ্ছ + ব্যাখ্যা + Uncategorized** — `FinanceAccount.groupName` + `note` ভরা +
  `5499 Uncategorized Expense`
- **A4 · ওদের তালিকা থেকে ৮–১০টা বাস্তব খরচের ধরন যোগ**

### ধাপ ৩-এর রিপোর্টে যোগ
- **Daily/Monthly balance flow** (⭐ সবচেয়ে বেশি কাজে লাগবে) · Customer ledger · Supplier ledger ·
  Trial Balance · Balance Sheet · General Ledger · Invoice-wise profit

### পরে
- **A5 · Accountant-mode manual journal** (লুকানো পাতা, Dr/Cr — বছর শেষের সমন্বয়ের জন্য)
- **A6 · Multi-currency** (import করলে) · **A7 · HRM/Payroll module**

---

## ৫. মালিকের সিদ্ধান্ত লাগবে

1. **Biznify কি চালু থাকবে, নাকি Radian-এ সরে আসবে?** — সরে এলে ওখানকার বর্তমান ব্যালেন্স
   (নগদ · ব্যাংক · সাপ্লায়ার দেনা · কর্মীর অগ্রিম · পুঁজি) go-live opening balance হিসেবে বসাতে হবে।
2. **কর্মী কতজন, অগ্রিম বেতন কি নিয়মিত?** — A2-এর নকশা এর উপর নির্ভর করে।
3. **আমদানি (Export/Import cost) কি চলছে?** — হলে multi-currency কবে লাগবে।
