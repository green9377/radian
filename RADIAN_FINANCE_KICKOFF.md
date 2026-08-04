# Radian — Finance Module Kickoff (নতুন চ্যাটের প্রথম মেসেজ)

> এই ফাইলটা কপি করে নতুন চ্যাটে পেস্ট করো। D:\radian ফোল্ডারে অ্যাক্সেস দিতে ভুলো না।
> _লেখা: 23 Jul 2026 — Pricing & Offers + Delivery BUILT+verified হওয়ার পরে
> (progress §১৮–২১)। মালিকের সিদ্ধান্ত: গোড়াপত্তন = **Finance (ledger)** দিয়ে শুরু।_

---

তুমি আমার Senior Business Analyst + Backend/Frontend/Finance Architect হিসেবে কাজ করবে।
আজ আমরা Radian Business OS-এর **Finance module (ledger)** বানাবো — সব module-এর
টাকার হিসাব যেখানে জমা হবে।

**Finance-এর মূল নীতি (constitution):** Finance **completed business event consume করে** —
কখনো operational data হাতে ঢোকায় না। প্রতিটা financial record একটা business event থেকে আসে।
Finance **Order/Purchase/Payment owns না** — ওগুলো পড়ে হিসাব বানায় মাত্র। Finance শুধু
নিজে owns: **Account · JournalEntry/Ledger · Expense · Income · (bank) Transfer** —
অর্থাৎ যেসব টাকা কোনো operational module থেকে আসে না (ভাড়া, বেতন, capital, ব্যাংক-ট্রান্সফার)।

## কাজের নিয়ম (আগে পড়ো, তারপর শুরু)

1. **আগে architecture, পরে code।** point by point আলোচনা, সহজ বাংলায়, option + recommendation সহ। আমি লক করার আগে এক লাইন code নয়।
2. Architecture লক হলে সরাসরি `apps/admin` (:3001) + `apps/api` (:4000)-এ code তুলে **localhost-এ দেখাবে**।
3. চ্যাটে বাংলা, **UI/code/data সব English**।
4. **আমি বললেই মেনে নেবে না — critically evaluate করবে।** ভুল হলে ধরিয়ে দেবে।
5. আমাকে terminal চালাতে দেবে না — এক-ক্লিক `.bat`; দরকারে তুমি নিজে computer-access নিয়ে চালাবে (আগের চ্যাটে এভাবেই হয়েছে — File Explorer address bar-এ `.bat`-এর full path)।
6. একসাথে **এক চ্যাটই** `schema.prisma` ধরবে — অন্য চ্যাট খোলা থাকলে আগে বন্ধ।
7. **UI polish এখন নয়** — মালিকের নির্দেশ: আগে গোড়াপত্তন, পরে আলাদা "চিকনি অভিযান"-এ পুরো UI একসাথে পরিষ্কার। তাই field-এ কম text, DEC-ref কখনো rendered-এ নয় (code comment-এ থাকবে)।

## আগে এগুলো পড়ো (এই ক্রমে)

1. Skills: `radian-business-context` → `radian-development-context` → `architecture-review` → `module-design-template` (finance-module template আছে) → `business-rules-writing` → `decision-log-writing`
2. Files (D:\radian):
   - `RADIAN_ADMIN_PROGRESS.md` **§১৮–২১** — সর্বশেষ অবস্থা (Offers · Delivery · cross-module fix · UI cleanup · পরিবেশ-শিক্ষা)
   - **এই ফাইল** — নিচের "Financial Event Source Map" (কোন event কোথা থেকে আসে, কী entry হবে) = কাজের মূল ভিত্তি
   - `RADIAN_PENDING.md` §A/§F/§G — জানা ফাঁক (D1 server-side analytics · D8 sequential no · F1 stock-flip · G-backlog); Finance-এ একই ভুল আবার নয়
   - `apps/api/prisma/schema.prisma` — যেসব টেবিল থেকে event পড়বে: `Order` · `OrderLine` · `PaymentTransaction` · `PosShift`/`PosCashMovement` · `Purchase`/`PurchasePayment` · `Supplier`/`SupplierPayment` · `SalesReturn`/`CustomerCredit` · `InventoryMovement`/`StockIssue`
   - `RADIAN_INVENTORY_MODULE_ARCHITECTURE.md` — AVCO valuation (COGS-এর উৎস: `InventoryMovement.valuePaisa` reason=SALE)
   - সর্বশেষ ছাঁচ: `RADIAN_OFFERS_MODULE_ARCHITECTURE.md` + `RADIAN_DELIVERY_MODULE_ARCHITECTURE.md`

## ✅ আগেই লক — আবার জিজ্ঞেস করবে না

1. **Finance = event consumer** (constitution)। operational module-এর completed event থেকে entry; Finance manual insert দিয়ে Order/Purchase বানাবে না।
2. **টাকা = paisa Int** সর্বত্র (bps/milli নীতি বহাল)। এক টাকা float নয়।
3. **Ledger immutable** (InventoryMovement-এর ধাঁচ) — posted entry edit/delete নয়, সংশোধন = reversal entry (`reversesId`)। soft-delete শুধু draft/manual expense-এ।
4. Core: One Data One Owner · AuditLog/ActivityEvent · sequential doc no (D8 শিক্ষা — `JV-000001`/`EXP-000001`) · **report সংখ্যা server-side** (D1 শিক্ষা — client math নয়) · admin-configurable (chart of accounts / category hardcode নয়)।
5. **branchId প্রতি entry-তে** (nullable, soft-ref) — multi-branch (D2/FBR) এলে branch-ভিত্তিক P&L; এখন single branch হলেও field রাখো।
6. **পরিবেশ (সময় বাঁচবে):** API container source baked + `nest start --watch`; **backend বদল = `docker compose up -d --build api`**; **প্রতি schema বদলে** migrate → `docker compose exec api npx prisma generate` → `restart api` (anonymous node_modules volume নতুন client ঢাকে — §১৬ শিক্ষা)। খালি array-তে explicit type (`const rows: X[] = []`)। PowerShell-এ `cd /d` চলে না। এক-ক্লিক bat বানাও (`radian_finance_migrate.bat` ধাঁচ: migrate+build+generate+restart)।

---

## 🔑 Financial Event Source Map (আমার audit থেকে — কোন event → কী entry)

_এটাই Finance-এর মেরুদণ্ড। প্রতিটা সারি: বাস্তবে existing code/table → Finance কী post করবে।
double-entry নিলে Dr/Cr; simplified নিলে account in/out + category._

| Business event | কোথায় (existing) | টাকার প্রভাব | Account / category |
|---|---|---|---|
| **Online order delivered** | `OrdersService.delivered` → Order.totalPaisa, salesStatus=completed | Revenue recognized (delivered-এ, LTV-র সাথে মিল) | Dr Cash/Receivable · Cr Sales income |
| **COD collected** | `delivered` → PaymentTransaction kind=COD_COLLECTED | Cash in | Dr Cash · Cr Receivable |
| **Order payment/advance** | `addPayment` → PaymentTransaction PAYMENT/ADVANCE, method=online/cod/bkash/… | Cash/gateway in (advance = liability until delivered — সিদ্ধান্ত লাগবে) | Dr <method account> · Cr Receivable/Advance |
| **Order/Return refund** | PaymentTransaction kind=REFUND · `ReturnsService.complete` refundPaisa | Cash out | Dr Sales returns · Cr <method account> |
| **Store credit issued** | `ReturnsService.complete` storeCreditPaisa → CustomerCredit ISSUED | Liability বাড়ে (টাকা বেরোয়নি) | Cr Customer-credit liability |
| **POS counter sale** | `PosService.createSale` → Order(fulfillment=COUNTER) + split PaymentTransaction | Revenue + cash/tender in | Dr <tender> · Cr Sales income |
| **POS due (baki) sale** | createSale duePaisa>0 (identified customer) | Receivable বাড়ে | Dr Customer receivable · Cr Sales |
| **POS day-close over/short** | `PosService.closeShift` overShortPaisa | ছোট gain/loss | Dr/Cr Cash-over-short |
| **COGS (বিক্রির খরচ)** | `InventoryMovement` reason=SALE, `valuePaisa` (AVCO) | পণ্যের খরচ — profit সত্যি করতে | Dr COGS · Cr Inventory |
| **Wastage / Gift** | `StockIssue` kind=WASTAGE/GIFT, totalValuePaisa | Loss/marketing expense | Dr Wastage/Gift expense · Cr Inventory |
| **Purchase received** | `Purchase` grandTotalPaisa (RECEIVED) | Inventory asset বাড়ে + payable | Dr Inventory · Cr Supplier payable |
| **Supplier payment** | `SupplierPayment` / `PurchasePayment` | Cash out, payable কমে | Dr Payable · Cr <method account> |
| **Supplier credit** | `SupplierCredit` (over-payment/return) | Asset (তারা পণ্য/সমন্বয় দেবে) | Dr Supplier-credit asset |
| **Manual expense** | **Finance owns** (নতুন) — ভাড়া, বেতন, বিদ্যুৎ, marketing | Cash out | Dr Expense(category) · Cr <account> |
| **Manual/other income** | **Finance owns** — scrap, misc | Cash in | Dr <account> · Cr Other income |
| **Bank/wallet transfer** | **Finance owns** — cash→bank, bKash→cash | account ভেতরে সরে | Dr <to> · Cr <from> |
| **Capital / drawings** | **Finance owns** — মালিকের পুঁজি/টাকা তোলা | equity | Dr/Cr Owner equity |

**Money accounts (balance রাখতে হবে):** Cash drawer · bKash · Nagad · Card-settlement · Bank ·
(gateway online)। PaymentTransaction.method / PayMethod enum-এর সাথে ম্যাপ।

---

## ❓ যে সিদ্ধান্তগুলো নিয়ে আমাকে প্রশ্ন করবে (এক এক করে, option+recommendation সহ)

1. **হিসাবের গভীরতা** — (ক) পূর্ণ **double-entry + Chart of Accounts** (Dr/Cr, balance sheet + P&L — "সঠিক" কিন্তু জটিল), নাকি (খ) **simplified money-account ledger** (account + category-ভিত্তিক in/out → P&L + cash position, balance-sheet নয়)? দোকানের বাস্তবতায় recommendation দেবে। ⚠ constitution "প্রতি transaction-এ accounting entry" চায় — কিন্তু মালিক accountant নন, তাই trade-off স্পষ্ট করবে।
2. **Revenue কখন ধরা হবে** — delivered/completed-এ (Sales LTV-র সাথে মিল — recommend), নাকি payment-এ? advance নেওয়া টাকা কি delivered-এর আগে income নাকি liability?
3. **COGS ধরব কি v1-এ** — Inventory AVCO (`InventoryMovement.valuePaisa`) থেকে বিক্রির খরচ post করলে profit সত্যি হয়; না ধরলে শুধু revenue। recommend: ধরা।
4. **v1-এ কোন event auto-post হবে** — উপরের ম্যাপের সব, নাকি প্রথমে core (sale · purchase-payment · supplier-payment · manual expense/income · refund · wastage) তারপর বাকি?
5. **Money accounts master** — Cash/bKash/Nagad/Card/Bank — কয়টা, opening balance কীভাবে বসবে?
6. **Manual Expense/Income category master** — admin-configurable (ভাড়া/বেতন/বিদ্যুৎ/marketing/…); approval threshold লাগবে কিনা (Roles নেই, তাই এখন নাম-audit)।
7. **Reconciliation** — POS day-close over/short auto-post; ব্যাংক reconciliation v1-এ নাকি পরে?
8. **কোন module-এর event এখন "completed" ধরে নেওয়া নিরাপদ** — Sales delivered · POS sale · Purchase received · Supplier/Order payment · Return complete · StockIssue। এগুলো hook করব নাকি nightly batch পড়বে? (recommend: event-time hook, fail-soft — Inventory mirror-এর ধাঁচ, INV-RULE-001-এর মতো FinanceService দিয়ে)।
9. **Screens** — প্রস্তাব: Overview (P&L + cash position) · Ledger/Journal · Accounts (balances) · Expenses · Income · Reports (P&L, cash flow, receivable/payable) · Settings (accounts + categories)। কম/বেশি?

## প্রস্তাবিত schema sketch (আলোচনার শুরু, লক নয়)

- `FinanceAccount` (Cash/bKash/Nagad/Bank/Card · type · openingBalancePaisa · isActive)
- `JournalEntry` (JV-NNNNNN · date · sourceType+sourceId polymorphic · narration · branchId · reversesId · immutable) + `JournalLine` (accountId · debitPaisa/creditPaisa · category)
  — double-entry নিলে; simplified নিলে এক `LedgerEntry` (account · direction · category · sourceType/Id)।
- `ExpenseCategory` / `IncomeCategory` (admin master) · `Expense` / `Income` (manual, Finance-owned, EXP-/INC- sequential)
- `FinanceSetting` (singleton — fiscal start, default cash account, revenue-recognition mode)
- Posting service: `FinanceService.postEvent(...)` — Orders/POS/Purchase/Returns/Inventory fail-soft ভাবে call করবে (মূল flow কখনো আটকাবে না; ব্যর্থ হলে timeline-এ ⚠, পরে replay)।

## Workflow

ধাপ ১: উপরের ফাইল + skills পড়ো → ধাপ ২: এক এক করে ৯টা প্রশ্ন (গভীরতা আগে) → ধাপ ৩: architecture এক জায়গায়, আমি লক করবো → ধাপ ৪: `RADIAN_FINANCE_MODULE_ARCHITECTURE.md` (DEC-FIN-XXX) → ধাপ ৫: code — schema → FinanceService posting hooks (fail-soft) → admin screens; migration bat-এ generate+restart ধাপসহ; localhost-এ দেখে।

## ⚠️ শুরুর আগে যাচাই
- অন্য কোনো চ্যাট `schema.prisma` ধরে আছে কিনা (একসাথে দুই চ্যাট = schema ভাঙে)।
- API container up: `http://localhost:4000/orders` JSON দেয় কিনা।
- সর্বশেষ rebuild হয়েছে (AUD-1/AUD-2 fix live — POS আর `/orders`-এ নেই)।
