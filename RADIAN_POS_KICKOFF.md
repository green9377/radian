# Radian — POS Module Kickoff (নতুন চ্যাটের প্রথম মেসেজ)

> এই ফাইলটা কপি করে নতুন চ্যাটে পেস্ট করো। D:\radian ফোল্ডারে অ্যাক্সেস দিতে ভুলো না।
> _লেখা: 23 Jul 2026, Supplier চ্যাট থেকে। Supplier BUILT + review-fixed (progress §১৬) —
> মালিকের লক করা ক্রম: Supplier → **POS** → Returns & Refunds।_

---

তুমি আমার Senior Business Analyst + Backend/Frontend Architect হিসেবে কাজ করবে।
আজ আমরা Radian Business OS-এর **POS module** বানাবো — দোকানের কাউন্টার।
Ecommerce-এর জন্য Order module আছেই; এটা physical store-এর বিক্রির যন্ত্র।

## কাজের নিয়ম (আগে পড়ো, তারপর শুরু)

1. **আগে architecture, পরে code।** point by point আলোচনা, সহজ বাংলায়, option + recommendation সহ। আমি লক করার আগে এক লাইন code নয়।
2. Architecture লক হলে সরাসরি `apps/admin` (:3001) + `apps/api` (:4000)-এ code তুলে **localhost-এ দেখাবে**।
3. চ্যাটে বাংলা, **UI/code/data সব English**।
4. **আমি বললেই মেনে নেবে না — critically evaluate করবে।** ভুল হলে ধরিয়ে দেবে।
5. আমাকে terminal চালাতে দেবে না — এক-ক্লিক `.bat`; দরকারে তুমি নিজে computer-access নিয়ে চালাবে (Supplier/Assembly চ্যাটে এভাবেই হয়েছে)।
6. একসাথে **এক চ্যাটই** `schema.prisma` ধরবে — অন্য চ্যাট খোলা থাকলে আগে বন্ধ।

## আগে এগুলো পড়ো (এই ক্রমে)

1. Skills: `radian-business-context` → `radian-development-context` → `architecture-review` → `module-design-template` → `business-rules-writing` → `decision-log-writing`
2. Files (D:\radian):
   - `RADIAN_ADMIN_PROGRESS.md` **§১৫–১৬** — Assembly v2 + Supplier অবস্থা + পরিবেশ-শিক্ষা (current truth)
   - `RADIAN_SALES_REVIEW.md` + `RADIAN_PENDING.md` §A — Order module-এর জানা ফাঁক (D1 server-side analytics · D8 sequential no · D5 settings নেই) — POS-এ একই ভুল আবার নয়
   - `RADIAN_PENDING.md` §F — **F1 (stock-flip stage-3: Inventory-ই একমাত্র deduction-লেখক হওয়া pending)** · F4 (OrderLine unitId) · F11 (vendor stock-skip) — POS এসবের গায়ে লাগবে
   - `RADIAN_INVENTORY_MODULE_ARCHITECTURE.md` — INV-RULE-001: stock লেখে শুধু InventoryService
   - Order module-এর গড়ন: `apps/api/src/orders` + admin `/orders` — POS-এর বিক্রি এর সাথেই মিশবে
   - Customer module (walk-in প্রশ্নের জন্য) + `RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md` (সর্বশেষ ছাঁচ)

## ✅ আগেই লক — আবার জিজ্ঞেস করবে না

1. **সব sales channel এক unified sales process-এ ঢোকে** (core rule) — POS আলাদা বিক্রির খাতা বানাবে না; কীভাবে মিশবে সেটা আলোচনার বিষয়, মিশবে কিনা নয়।
2. Stock-এর এক মালিক Inventory — POS-এর deduction `InventoryService` দিয়ে (INV-RULE-001); Product.stockQty-র legacy পথ আর F1 flip মাথায় রেখে design।
3. Core: One Data One Owner · soft-delete + AuditLog/ActivityEvent · টাকা = paisa Int · admin-configurable (hardcode নয়) · sequential doc no (D8-এর শিক্ষা — POS invoice no সিরিয়াল হবে) · report সংখ্যা server-side (D1-এর শিক্ষা)।
4. Item picker = shared full-screen photo picker (`ItemPicker`), lookup = QuickSelect — তবে POS-এর নিজের বিক্রি-grid touch-first হতে পারে (আলোচনায়)।
5. **পরিবেশ (সময় বাঁচবে):** API container = compose bind-mount + watch; **প্রতি schema বদলে** `docker compose run --rm api npx prisma migrate dev` → **`docker compose exec api npx prisma generate`** → **`restart api`** — anonymous node_modules volume নতুন client ঢেকে দেয় (§১৬-র শিক্ষা, `radian_supplier_review_migrate.bat` ধাঁচ)। খালি array-তে explicit type (`const rows: X[] = []`)। PowerShell-এ `cd /d` চলে না।
6. Returns & Refunds **এই module নয়** — পরের module (D3); POS-এ শুধু hook/নোট রাখা যাবে।

## যে বিষয়গুলো নিয়ে আমাকে প্রশ্ন করবে (point by point, এক এক করে)

1. **POS বিক্রি কোথায় জমা হবে** — Order টেবিলেই channel=Store দিয়ে, নাকি হালকা আলাদা সত্তা যা Order-এ রূপ নেয়? (recommendation দেবে — unified rule মেনে)
2. **Counter flow** — দোকানে বিক্রিটা আসলে কীভাবে হয়: ক্রেতা জিনিস আনে → দাম? দর-কষাকষি/discount হয়? কে discount দিতে পারে, সীমা কত?
3. **Walk-in customer** — নাম-ফোন ছাড়া বিক্রি হবে নিশ্চয়ই; ফোন নিলে Customer master-এ জুড়বে কিনা, কখন জিজ্ঞেস করা হবে?
4. **বাকিতে বিক্রি** — দোকানে খাতার customer আছে? থাকলে customer-due ledger লাগবে (Supplier-এর উল্টো দিক)।
5. **Payment** — cash ছাড়া কী কী নাও (bKash/Nagad/card)? এক বিক্রিতে ভাগ payment (৫০০ cash + বাকি bKash) হয়?
6. **Hardware** — barcode scanner আছে/আনবে? receipt printer (কী ছাপা হবে, দাম লুকানোর দরকার আছে)? cash drawer?
7. **দিন-শুরু/দিন-শেষ** — cash গোনা, opening float, দিনশেষ মিলানো (expected vs actual), কে করে, ঘাটতি হলে কী হয়?
8. **Hold/parked bill** — এক ক্রেতার বিল থামিয়ে আরেকজনকে ছাড়ার দরকার হয়?
9. **Screens** — প্রস্তাব: POS counter (touch grid + cart) · Today/shift board · Sales history · Day-close · Settings — কম/বেশি?

প্রতিটা প্রশ্নে আমার ব্যবসার প্রেক্ষিতে (ফুল ও গিফটের দোকান, বাংলাদেশ; কাউন্টারে ভিড়ের সময় Valentine/মাদার্স ডে) option + recommendation দেবে।

## Workflow

ধাপ ১: উপরের ফাইল + skills পড়ো → ধাপ ২: এক এক করে প্রশ্ন → ধাপ ৩: architecture এক জায়গায়, আমি লক করবো → ধাপ ৪: `RADIAN_POS_MODULE_ARCHITECTURE.md` (DEC-POS-XXX) → ধাপ ৫: code — ছোট ধাপে, localhost-এ দেখে, migration bat-এ exec-generate ধাপসহ।

## ⚠️ শুরুর আগে যাচাই

- Docker চলছে কিনা (postgres :5433 · api :4000 · admin :3001) — না চললে `START_RADIAN.bat`।
- **Assembly + Inventory-র live যাচাই এখনো মালিকের কাছে pending** — POS প্রথম আসল stock-কাটা বিক্রি-পথ; stock ছোঁয়ার আগে ওই যাচাইটা সেরে নেওয়া ভালো (মালিককে মনে করিয়ে দেবে)।
- Supplier-এর test data (Kamal Mama ৳400 credit, Cake Bhai) এখনো DB-তে — মালিক চাইলে আগে মুছে নেবে।

শুরু করো — আগে পড়া শেষ করে আমাকে প্রথম প্রশ্নটা করো।
