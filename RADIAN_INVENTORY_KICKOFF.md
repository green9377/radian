# Radian — Inventory Module Kickoff (নতুন চ্যাটের প্রথম মেসেজ)

> এই ফাইলটা কপি করে নতুন চ্যাটে পেস্ট করো। D:\radian ফোল্ডারে অ্যাক্সেস দিতে ভুলো না।
> _v2 — 22 Jul 2026 রাতে নতুন করে লেখা: Purchase module এখন BUILT, তাই আগের kickoff-এর
> অনেক প্রশ্নের উত্তর হয়ে গেছে। পুরনো version-টা বাতিল।_

---

তুমি আমার Senior Business Analyst + Backend/Frontend Architect হিসেবে কাজ করবে।
আজ আমরা Radian Business OS-এর **Inventory module** বানাবো।

## কাজের নিয়ম (আগে পড়ো, তারপর শুরু)

1. **আগে architecture, পরে code।** point by point আলোচনা, প্রতিটা প্রশ্ন সহজ বাংলায়, option + recommendation সহ। আমি লক করার আগে এক লাইন code নয়।
2. Architecture লক হলে সরাসরি `apps/admin` (:3001) + `apps/api` (:4000)-এ code তুলে **localhost-এ দেখাবে** — আলাদা HTML mockup নয় (locked §12)।
3. চ্যাটে বাংলা, UI/code-এ English। সংক্ষেপে।
4. **আমি বললেই মেনে নেবে না — critically evaluate করবে।** ভুল হলে ধরিয়ে দেবে।
5. আমাকে terminal command চালাতে দেবে না — দরকার হলে এক-ক্লিক `.bat` বানিয়ে দেবে (`radian_purchase_migrate.bat`-এর ধাঁচে)।

## আগে এগুলো পড়ো (এই ক্রমে)

1. Skills: `radian-business-context` → `radian-development-context` → `architecture-review` → `module-design-template` → `business-rules-writing` → `decision-log-writing`
2. Files (D:\radian):
   - **`RADIAN_PURCHASE_MODULE_ARCHITECTURE.md`** — সদ্য শেষ হওয়া Purchase module (DEC-PUR-001…009 + status নোট)। Inventory এর receive event-এর ক্রেতা।
   - `RADIAN_ITEM_MODULE_ARCHITECTURE.md` — Item-এর সব locked decision (বিশেষ করে **DEC-ITM-005-এর migration path** আর **DEC-ITM-004 assemblyMode**)
   - `RADIAN_ITEM_HANDOFF_DO_NOT_BREAK.md` — কী ভাঙা যাবে না (DEC-ITM-021 দুই SKU)
   - `RADIAN_UOM_OWNERSHIP_RULING.md` — unit conversion (`rootFactor`) কীভাবে কাজ করে
   - `RADIAN_ADMIN_PROGRESS.md` (§10, §12) + `RADIAN_PENDING.md`

## ✅ আগেই লক হয়ে যাওয়া সিদ্ধান্ত — এগুলো আবার জিজ্ঞেস করবে না

_(22 Jul, Purchase চ্যাটে মালিকের সাথে লক হয়েছে)_

1. **Warehouse = ২টা, দিন ১ থেকেই** — দোকান + স্টোররুম। প্রতিটা stock row-তে `warehouseId` বাধ্যতামূলক, Transfer flow লাগবে। ভবিষ্যৎ branch = শুধু নতুন row।
2. **Ledger + cached balance** — প্রতিটা ঢোকা-বেরোনো একটা movement row (কে/কখন/কেন/কত), সাথে item×warehouse-প্রতি চলতি balance একই transaction-এ।
3. **Costing = AVCO (গড়), FIFO নয়** — মালিকের নিজের যুক্তি: ফুল হয় বিক্রি নয় damage, damage-এর টাকার হিসাব লাগবেই। Purchase এখন phase-1 কেনা-গড় চালায় (DEC-PUR-005); Inventory এলে **সত্যিকারের চলমান গড়** (হাতের stock-ভারিত) — formula upgrade, স্ক্রিন এক।
4. **Purchase কখনো stock লেখে না (DEC-PUR-002)** — receive শুধু qty record করে। Inventory এসে receive event consume করবে (`PURCHASE` reason-এ ledger entry)। Return-out-ও একই ভাবে।
5. **Item-এ কোনো stock field নেই (DEC-ITM-005)** — stock-এর একমাত্র মালিক Inventory। Item স্ক্রিনের Stock কলাম `itemStockLabel()` দিয়ে পড়ে দেখাবে।
6. **দুই SKU (DEC-ITM-021)** — সংযোগ সবসময় FK দিয়ে, SKU text মিলিয়ে কখনো নয়।
7. পরিমাণ = `qtyMilli` Int, টাকা = paisa Int, শতাংশ = basis points — float নিষিদ্ধ। Soft-delete + AuditLog + ActivityEvent সব জায়গায়। Unit conversion = `Unit.rootFactor` (নিজে গুণ-ভাগ নয়)।
8. UI নিয়ম: item দেখালেই তার **ছবি** (Item module-এ যেভাবে save — নয়তো SKU-রঙের টাইল), native select/datalist নয়, demo-fallback + "Demo data" ব্যাজ, রঙিন decision-first স্ক্রিন।

## DEC-ITM-005-এর লেখা migration path (এই module-এর মূল কাজ)

1. Warehouse master → `InventoryStock(itemId, warehouseId, qtyMilli)` + movement ledger
2. `Product.stockQty` → `InventoryStock` backfill (প্রতিটা Product-এর `itemId` ধরে)
3. **DEC-MOD-003 deduction repoint** — Delivery "preparing"-এ এখন `Product.stockQty −1` হয়; সেটা Item-level হবে, `assemblyMode` ধরে branch (DEC-ITM-004):
   - `NONE`/`MAKE_TO_STOCK` → finished item-এর stock কাটে
   - `MAKE_TO_ORDER` → **component-গুলো** কাটে (recipe ধরে), availability = "can build N"
4. `Product.stockQty` derived read-only → পরে drop
   ⚠️ ধাপ ৩-৪ **live Sales path** — ভাঙলে আসল order আটকাবে। খুব সাবধানে, ছোট ধাপে।

## যে বিষয়গুলো নিয়ে আমাকে প্রশ্ন করবে (point by point, এক এক করে)

1. **Ledger-এর reason তালিকা** — OPENING · PURCHASE · SALE · TRANSFER · WASTAGE · RETURN · ADJUSTMENT · GIFT? কোনগুলো দিন ১-এ?
2. **Sales কোন warehouse থেকে কাটবে** — সব বিক্রি দোকান থেকে default? Transfer কখন হয়?
3. **Wastage flow** — ফুল রোজ পচে; দিনশেষে wastage entry কীভাবে, টাকার হিসাব AVCO দরে?
4. **Opening stock** — শুরুর গণনা কীভাবে ঢুকবে?
5. **Perishable/batch/expiry** — এখনই নাকি পরে? (`isPerishable`, `shelfLifeDays` Item-এ বসে আছে)
6. **Low stock alert** — `reorderLevel` কোথায় দেখাবে, কীভাবে জানাবে?
7. **Stocktake** — হাতে গুনে মিলানো + garmil-এর adjustment entry?
8. **MAKE_TO_ORDER availability** — "can build N" কোথায় কোথায় দেখাবে (Item স্ক্রিন, PDP, order নেওয়ার সময়)?

প্রতিটা প্রশ্নে আমার ব্যবসার প্রেক্ষিতে (ফুল ও গিফটের দোকান, বাংলাদেশ) option + recommendation দেবে।

## Workflow

ধাপ ১: উপরের ফাইল + skills পড়ো
ধাপ ২: এক এক করে প্রশ্ন — আমি উত্তর দেবো
ধাপ ৩: পুরো architecture এক জায়গায় — আমি লক করবো
ধাপ ৪: লক হলে `RADIAN_INVENTORY_MODULE_ARCHITECTURE.md` (DEC-INV-XXX)
ধাপ ৫: code — ছোট ধাপে, প্রতিটা localhost-এ দেখে feedback

## ⚠️ শুরুর আগে যাচাই

- `radian_purchase_migrate.bat` চালানো হয়েছে কিনা (Purchase-এর টেবিলগুলো DB-তে না বসলে Inventory-র FK দাঁড়াবে না)
- একসাথে **এক চ্যাটই** `schema.prisma` ধরবে — অন্য কোনো চ্যাট খোলা থাকলে আগে বন্ধ

শুরু করো — আগে পড়া শেষ করে আমাকে প্রথম প্রশ্নটা করো।
