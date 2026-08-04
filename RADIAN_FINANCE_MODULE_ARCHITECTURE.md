# Radian — Finance Module Architecture (ledger)

**Domain:** Finance · **Version:** v1.1 (review-fixed) · **Status:** Pending owner approval
**তারিখ:** 26 Jul 2026 · **উৎস:** `RADIAN_FINANCE_KICKOFF.md` + মালিকের ১১টি রায়
**ভিত্তি:** Sales · POS · Purchase · Supplier · Returns · Inventory · Delivery — সব BUILT ও locked

---

## ০. এক নজরে — যা লক হয়েছে

| # | সিদ্ধান্ত | সারাংশ |
|---|---|---|
| DEC-FIN-001 | হিসাবের গভীরতা | ভেতরে পূর্ণ double-entry + Chart of Accounts, বাইরে সরল ফর্ম। Dr/Cr কখনো UI-তে নয় |
| DEC-FIN-002 | Revenue timing | `delivered`-এ আয়; অগ্রিম টাকা ততক্ষণ **liability** |
| DEC-FIN-003 | COGS | ধরা হবে; `Goods Out for Delivery` holding account দিয়ে — preparing→holding, delivered→COGS |
| DEC-FIN-004 | পার্টনার বেতন | শ্রম-পার্টনারের মাসিক টাকা = **নির্ধারিত বেতন (খরচ, fixed)** — drawings নয় |
| DEC-FIN-005 | লাভ বণ্টন | **Capital-first waterfall**: আগে investor-এর পুঁজি ফেরত, তারপর অনুপাতে ভাগ; labour bonus % (default 0) setting-এ |
| DEC-FIN-006 | v1 সীমা | পুরো event map + partner ledger + auto break-even + delivery cost + prepaid/asset/depreciation + **loan** |
| DEC-FIN-007 | পুরনো ডেটা | go-live তারিখ থেকে শুরু + opening balance; historical replay **নয়** |
| DEC-FIN-008 | Money accounts | Cash · bKash · Nagad · Bank · Card/Gateway settlement · Other wallet — admin master, `PayMethod`/`PaymentMethod`-এ mapped |
| DEC-FIN-009 | Approval | খরচ ≥ threshold হলে approval লাগবে (settings-এ অঙ্ক, নাম-audit) |
| DEC-FIN-010 | Posting মডেল | event-time hook, **fail-soft** + replay queue (Inventory mirror-এর ধাঁচ) |
| DEC-FIN-011 | Reconciliation | হালকা সংস্করণ — counted vs system → পার্থক্য ledger-এ; bank statement import deferred |
| DEC-FIN-012 | Screens | ৯টা (§১১) |
| DEC-FIN-020 | **VAT** | VAT আদায় = দায় (2400 VAT Payable), আয় নয়; input rebate 1500 |
| DEC-FIN-021 | **COD custody** | `1110 Cash with Rider/Courier` — টাকা হাতে আসা পর্যন্ত আলাদা ঘরে; courier চার্জ remittance-এ কাটা |
| DEC-FIN-022 | Supplier posting | একমাত্র উৎস `SupplierPayment`; allocation-জাত `PurchasePayment` post হবে না |
| DEC-FIN-023 | Idempotency | `JournalEntry.sourceKey @unique` — এক ঘটনা এক entry |
| DEC-FIN-024 | Drift guard | `financePostedAt` stamp + বাধ্যতামূলক adjusting entry + রাতের drift checker |
| DEC-FIN-025 | Period close | `lastClosedDate`-এর আগে entry block; override audited |
| DEC-FIN-026 | Approval পরিধি | Expense + supplier payment + নগদ refund + wastage |
| DEC-FIN-027 | নগদের সততা | "নিজের নগদ vs গ্রাহকের অগ্রিম" আলাদা দেখানো |
| DEC-FIN-028 | *(গৃহীত ঝুঁকি)* | লগইন/PIN **Finance-এর পরে** — মালিকের সিদ্ধান্ত। ট্রিগার: **বাইরের কর্মী নিয়োগের আগে অবশ্যই** |

_v1.1 পরিবর্তনের কারণ: `RADIAN_FINANCE_REVIEW.md` (26 Jul 2026) — ৫টি 🔴 + ২টি 🟠 নিষ্পত্তি।_

আগে থেকেই locked (kickoff §✅): Finance = event consumer · টাকা = paisa Int · ledger immutable ·
sequential doc no · report সংখ্যা server-side · admin-configurable · প্রতি entry-তে `branchId`।

---

## ১. Overview

**Core Purpose:**
> Radian-এর প্রতিটি সম্পন্ন ব্যবসায়িক ঘটনাকে টাকার হিসাবে রূপান্তর করে একটাই সত্য খাতা রাখা —
> যাতে লাভ, নগদ অবস্থান, break-even ও দুই পার্টনারের স্থিতি কখনো হাতে হিসাব করতে না হয়।

**Critical Finance Principle (constitution):**
Finance **completed business event consume করে** — operational data কখনো হাতে ঢোকায় না।
প্রতিটি financial record একটা business event বা Finance-এর নিজস্ব manual form থেকে আসে।

**কেন double-entry (DEC-FIN-001):** Radian-এর ডেটায় ইতিমধ্যেই balance-sheet উপাদান আছে —
AVCO inventory (`InventoryMovement.valuePaisa`), receivable (POS বাকি + COD), payable
(supplier due), `CustomerCredit` (liability), `SupplierCredit` (asset)। শুধু cash-in/out
ledger নিলে purchase দুইবার খরচ হিসেবে গোনা হতো (payment-এ একবার, COGS-এ আরেকবার) এবং
P&L নীরবে ভুল হতো — D1-এর ভুলের টাকার সংস্করণ।

---

## ২. Module Responsibilities

### IS Responsible For
- Chart of Accounts · Journal (ledger) · প্রতিটি money account-এর ব্যালেন্স
- Manual Expense · Income · Transfer · Capital/Drawings (Finance-owned entities)
- Partner master + partner subledger + profit distribution waterfall
- Fixed Asset + depreciation · Prepaid/Deposit amortization · Loan + repayment split
- P&L · Cash flow · Receivable/Payable aging · Break-even · পণ্যভিত্তিক লাভ (server-side)
- Reconciliation (counted vs system) — cash over/short entry
- Failed-posting replay queue

### NOT Responsible For
- Order · OrderLine · PaymentTransaction তৈরি → **Sales/POS**
- Purchase · PurchasePayment · SupplierPayment তৈরি → **Purchase/Supplier**
- Stock qty ও AVCO মূল্য নির্ধারণ → **Inventory** (Finance শুধু `valuePaisa` পড়ে)
- Return/Refund সিদ্ধান্ত ও refund cap → **Returns** (Finance শুধু হিসাব বসায়)
- Delivery assignment ও transition → **Delivery/Orders** (DEC-DLV-006 অক্ষত)
- POS shift/cash custody lifecycle → **POS** (locked: executing module owns physical cash;
  Finance শুধু ledger entry + reconciliation)
- Roles/permission → **Administration** (এখন নাম-audit)
- VAT/NBR হিসাব → **Tax module** (locked নয়, D13)

---

## ৩. Chart of Accounts (seeded, admin-extendable)

`isSystem=true` account গুলো posting service-এর জন্য দরকারি — নাম বদলানো যাবে, মোছা যাবে না।

### ASSET
| Code | Account | নোট |
|---|---|---|
| 1000 | Cash Drawer | money · `PayMethod.CASH` |
| 1010 | bKash | money · `BKASH` |
| 1020 | Nagad | money · `NAGAD` |
| 1030 | Other Wallet (Rocket/Upay) | money · `OTHER` |
| 1040 | Bank | money · `BANK` |
| 1050 | Card / Gateway Settlement | money · `CARD` — গেটওয়েতে আটকে থাকা টাকা |
| 1100 | Customer Receivable | COD due + POS বাকি |
| 1110 | **Cash with Rider / Courier** | COD আদায় হয়েছে কিন্তু হাতে আসেনি (DEC-FIN-021) · carrier-ভিত্তিক subledger |
| 1150 | Inventory | AVCO মূল্যে গুদামের মাল |
| 1160 | **Goods Out for Delivery** | "পথে থাকা মাল" (DEC-FIN-003) |
| 1200 | Supplier Advance / Credit | `Purchase.ADVANCE_PAID` + `SupplierCredit` |
| 1300 | Prepaid Expense | অগ্রিম ভাড়া ইত্যাদি (মাসে মাসে ভাগ) |
| 1310 | Security Deposit | ফেরতযোগ্য জামানত (ভাগ হয় না) |
| 1400 | Fixed Asset — Cost | ফ্রিজ · ভ্যান · কম্পিউটার · ডেকোরেশন |
| 1410 | Accumulated Depreciation | contra-asset (ঋণাত্মক) |
| 1500 | **VAT Input (rebate)** | সাপ্লায়ারকে দেওয়া VAT — standard VAT-এ rebate যোগ্য (DEC-FIN-020) |

### LIABILITY
| Code | Account | নোট |
|---|---|---|
| 2000 | Supplier Payable | ক্রয়ের বকেয়া |
| 2100 | Customer Advance | delivered-এর আগে পাওয়া টাকা (DEC-FIN-002) |
| 2110 | Customer Store Credit | `CustomerCredit` ISSUED |
| 2200 | Loan Payable | ব্যাংক/পারিবারিক ধার |
| 2300 | Accrued Expense / Salary Payable | ঘটেছে কিন্তু দেওয়া হয়নি |
| 2400 | **VAT Payable (NBR)** | আদায় করা VAT — সরকারের টাকা, আয় নয় (DEC-FIN-020) |

### EQUITY
| Code | Account | নোট |
|---|---|---|
| 3000 | Partner Capital | per-partner via `JournalLine.partnerId` |
| 3100 | Partner Drawings / Capital Return | per-partner |
| 3200 | Retained Earnings | জমা লাভ |

### INCOME
| Code | Account | নোট |
|---|---|---|
| 4000 | Sales Income | net of offer discount |
| 4010 | Delivery Fee Income | গ্রাহকের কাছ থেকে নেওয়া ডেলিভারি চার্জ |
| 4100 | Sales Return | contra-income |
| 4110 | **Sales Adjustment** | `Order.adjustmentPaisa` + POS দর-কষাকষি — আলাদা রাখলে কে কত ছাড় দিল দেখা যায় |
| 4200 | Other Income | |
| 4300 | Cash Over (gain) | |

### EXPENSE — `costBehavior` ট্যাগসহ (break-even-এর ভিত্তি)
| Code | Account | Behavior |
|---|---|---|
| 5000 | COGS | VARIABLE |
| 5100 | Wastage / Spoilage | VARIABLE |
| 5110 | Gift & Sampling | VARIABLE |
| 5150 | Inventory Adjustment (stocktake) | VARIABLE |
| 5200 | Delivery Cost (courier/rider) | VARIABLE |
| 5300 | Payment Gateway Fee | VARIABLE |
| 5310 | Packaging | VARIABLE |
| 5400 | Shop Rent | FIXED |
| 5410 | Partner Salary | FIXED |
| 5420 | Employee Salary | FIXED |
| 5430 | Utility (বিদ্যুৎ/পানি/গ্যাস) | FIXED |
| 5440 | Internet & Phone | FIXED |
| 5450 | Marketing & Ads | VARIABLE *(বদলানো যাবে)* |
| 5460 | Transport & Conveyance | VARIABLE |
| 5470 | Repair & Maintenance | FIXED |
| 5480 | Bank Charge & Fees | FIXED |
| 5490 | Miscellaneous | FIXED |
| 5500 | Depreciation | FIXED |
| 5600 | Loan Interest | FIXED |
| 5700 | Cash Short (loss) | FIXED |

**DEC-FIN-013 — আলাদা `ExpenseCategory` টেবিল নেই।** খরচের "ধরন" আর "expense account" একই ধারণা;
দুটো master রাখলে One Data One Owner ভাঙে। তাই EXPENSE-type `FinanceAccount`-ই category —
নতুন ধরন যোগ করা = নতুন account যোগ করা। `IncomeCategory`-ও একইভাবে INCOME account।

---

## ৪. Financial Event Source Map (মেরুদণ্ড)

> **নিয়ম:** কোনো ledger entry থাকতে পারবে না যার পেছনে একটা business event বা Finance-owned form নেই।
> সব entry-তে `sourceType` + `sourceId` বসবে — যেকোনো সংখ্যা থেকে মূল ঘটনায় ফেরত যাওয়া যাবে।

| # | Business event | Source (existing) | Dr | Cr |
|---|---|---|---|---|
| 1 | **Order delivered** (revenue) | `OrdersService.delivered` | 1100 Receivable | 4000 Sales *(net of discount)* + 4010 Delivery Fee + **2400 VAT Payable** *(`vatPaisa`>0 হলে)* + 4110 Adjustment *(ঋণাত্মক হলে Dr)* |
| 2 | ↳ COGS একই মুহূর্তে | `InventoryMovement` SALE value | 5000 COGS | 1160 Goods Out |
| 3 | ↳ আগে অগ্রিম থাকলে | `PaymentTransaction` ADVANCE | 2100 Customer Advance | 1100 Receivable |
| 4 | **Stock out (preparing)** | `orders/prepare` → InventoryMovement SALE | 1160 Goods Out | 1150 Inventory |
| 5 | **Order fail/cancel — stock revert** | Orders revert | 1150 Inventory | 1160 Goods Out |
| 6 | **COD collected** (DEC-FIN-021) | `PaymentTransaction` COD_COLLECTED | **1110 Cash with Rider/Courier** | 1100 Receivable |
| 6a | ↳ রাইডার ড্রয়ারে জমা দিল | Finance form / delivery handover | 1000 Cash | 1110 |
| 6b | ↳ কুরিয়ার remittance এলো | Finance form (carrier · তারিখ · অঙ্ক) | 1040 Bank + 5200 Delivery Cost | 1110 |
| 7 | **Advance / prepayment** | `addPayment` PAYMENT/ADVANCE | \<money account\> | 2100 Customer Advance |
| 8 | **Gateway settlement** | manual/settlement | 1040 Bank + 5300 Fee | 1050 Card Settlement |
| 9 | **Refund** | `PaymentTransaction` REFUND · `ReturnsService.complete` | 4100 Sales Return | \<money account\> |
| 10 | ↳ restock হলে | `InventoryMovement` SALE_RETURN | 1150 Inventory | 5000 COGS |
| 11 | **Store credit issued** | `CustomerCredit` ISSUED | 4100 Sales Return | 2110 Store Credit |
| 12 | ↳ store credit ব্যবহার | credit REDEEMED | 2110 Store Credit | 1100 Receivable |
| 13 | **POS counter sale** | `PosService.createSale` | \<tender account\> (+1100 বাকি হলে) | 4000 Sales + **2400 VAT Payable** (`vatPaisa`) + 4110 Adjustment |
| 14 | ↳ POS COGS | InventoryMovement SALE | 5000 COGS | 1150 Inventory *(holding লাগে না — তাৎক্ষণিক)* |
| 15 | **POS day-close over/short** | `closeShift.overShortPaisa` | 5700 Cash Short *(বা 1000)* | 1000 Cash *(বা 4300 Cash Over)* |
| 16 | **POS cash drop / payout** | `PosCashMovement` DROP/PAYOUT | 1040 Bank / expense | 1000 Cash |
| 17 | **Wastage** | `StockIssue` WASTAGE | 5100 Wastage | 1150 Inventory |
| 18 | **Gift / sampling** | `StockIssue` GIFT | 5110 Gift | 1150 Inventory |
| 19 | **Stocktake adjustment** | InventoryMovement ADJUSTMENT | 5150 বা 1150 | 1150 বা 5150 |
| 20 | **Purchase received** | `Purchase` RECEIVED | 1150 Inventory | 2000 Supplier Payable |
| 21 | **Purchase advance** | `Purchase` ADVANCE_PAID | 1200 Supplier Advance | \<money account\> |
| 22 | **Supplier payment** (DEC-FIN-022) | `SupplierPayment` **একমাত্র উৎস**; standalone `PurchasePayment` তখনই যখন কোনো allocation তাকে তৈরি করেনি | 2000 Payable | \<money account\> |
| 23 | **Purchase return** | `PurchaseReturn` | 2000 Payable / 1200 Credit | 1150 Inventory |
| 24 | **Delivery cost** | `DeliveryAssignment.costPaisa` *(নতুন field)* | 5200 Delivery Cost | \<money\> / 2000 |
| 25 | **Manual expense** | Finance form | \<expense account\> | \<money account\> |
| 26 | **Manual income** | Finance form | \<money account\> | 4200 Other Income |
| 27 | **Transfer** | Finance form | \<to account\> | \<from account\> |
| 28 | **Partner capital in** | Finance form | \<money account\> | 3000 Capital `[partnerId]` |
| 29 | **Partner salary** | Finance form (মাসিক) | 5410 Partner Salary | \<money account\> |
| 30 | **Partner drawing / capital return** | Finance form | 3100 Drawings `[partnerId]` | \<money account\> |
| 31 | **Loan received** | Finance form | \<money account\> | 2200 Loan Payable |
| 32 | **Loan repayment** | Finance form | 2200 (আসল) + 5600 (সুদ) | \<money account\> |
| 33 | **Fixed asset কেনা** | Finance form | 1400 Fixed Asset | \<money account\> |
| 34 | **মাসিক অবচয়** | scheduled (মাস-শেষে বোতাম) | 5500 Depreciation | 1410 Accum. Depreciation |
| 35 | **Prepaid দেওয়া / জামানত** | Finance form | 1300 Prepaid / 1310 Deposit | \<money account\> |
| 36 | **Prepaid মাসিক ভাগ** | scheduled | \<expense account\> | 1300 Prepaid |
| 37 | **Reconciliation পার্থক্য** | Finance form | 5700 Cash Short *(বা money)* | \<money account\> *(বা 4300)* |
| 38 | **Profit distribution** | Finance form (period-শেষে) | 3200 Retained Earnings | 3000/3100 `[partnerId]` |
| 39 | **VAT জমা (NBR)** | Finance form (মাসিক Mushak 9.1) | 2400 VAT Payable | \<money account\> |
| 40 | **ক্রয়ে VAT (rebate যোগ্য হলে)** | `Purchase` — supplier challan | 1500 VAT Input | 2000 Payable *(inventory অংশ ছাড়া)* |

**যেসব event-এ ledger entry হবে না (ইচ্ছাকৃত):**
Assembly production (component→finished, দুটোই 1150 Inventory — নিট প্রভাব শূন্য; শুধু wastage হলে 5100) ·
Stock transfer (এক warehouse→অন্য, একই account) · Offer/coupon apply (discount আলাদা খরচ নয়,
Sales Income কমে — net revenue নীতি) · Order confirm/prepare ছাড়া বাকি status বদল।

---

## ৫. Business Entities Owned (schema sketch)

```prisma
enum FinAccountType { ASSET LIABILITY EQUITY INCOME EXPENSE }
enum CostBehavior   { FIXED VARIABLE }
enum FinSourceType  { ORDER PAYMENT RETURN POS_SHIFT INVENTORY PURCHASE SUPPLIER_PAYMENT
                      DELIVERY EXPENSE INCOME TRANSFER PARTNER ASSET PREPAID LOAN
                      RECONCILE PROFIT_DIST OPENING MANUAL }
enum PartnerKind     { CAPITAL LABOUR BOTH }
enum PartnerTxnKind  { CAPITAL_IN CAPITAL_RETURN DRAWING SALARY PROFIT_SHARE BONUS }
enum ApprovalState   { AUTO PENDING APPROVED DECLINED }
enum PostingState    { POSTED FAILED REPLAYED }

model FinanceAccount {
  id            String @id @default(cuid())
  code          String @unique          // "1000"
  name          String
  type          FinAccountType
  isMoneyAccount Boolean @default(false)
  payMethod     String?                 // PayMethod/PaymentMethod mapping (DEC-FIN-008)
  costBehavior  CostBehavior?           // EXPENSE হলেই বাধ্যতামূলক (break-even)
  isSystem      Boolean @default(false) // posting service-এর দরকারি account
  isActive      Boolean @default(true)
  openingBalancePaisa Int @default(0)   // go-live snapshot (DEC-FIN-007)
  sortOrder     Int    @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?                   // isSystem হলে কখনো নয়
}

model JournalEntry {
  id         String   @id @default(cuid())
  entryNo    String   @unique           // JV-000001
  entryDate  DateTime                   // business date (posting time নয়)
  sourceType FinSourceType
  sourceId   String?                    // polymorphic soft-ref
  sourceKey  String?  @unique           // "{sourceType}:{sourceId}:{kind}" — idempotency (DEC-FIN-023)
  carrierId  String?                    // 1110 subledger: কোন rider/courier (DEC-FIN-021)
  narration  String
  branchId   String?                    // DEC-FIN-015
  reversesId String?  @unique           // সংশোধন = reversal
  actorName  String?
  isManual   Boolean  @default(false)
  createdAt  DateTime @default(now())
  lines      JournalLine[]
  @@index([entryDate]) @@index([sourceType, sourceId])
}

model JournalLine {
  id          String @id @default(cuid())
  entryId     String
  accountId   String
  debitPaisa  Int    @default(0)
  creditPaisa Int    @default(0)
  partnerId   String?   // equity subledger (DEC-FIN-017)
  orderId     String?   // dimension — পণ্য/অর্ডারভিত্তিক লাভের জন্য
  itemId      String?
  note        String?
  @@index([entryId]) @@index([accountId]) @@index([partnerId])
}

model Expense {   // EXP-000001
  expenseNo String @unique
  spentAt   DateTime
  accountId String            // EXPENSE account = category (DEC-FIN-013)
  paidFromId String           // money account
  amountPaisa Int
  payeeName String?
  note      String?
  attachmentUrl String?
  approval  ApprovalState @default(AUTO)
  approvedBy String?
  approvedAt DateTime?
  journalEntryId String?      // approve হওয়ার আগে null
  branchId  String?
  actorName String?
  deletedAt DateTime?         // শুধু PENDING/DECLINED-এ
}

model Income  { /* INC-000001 — accountId(INCOME) · receivedInId(money) · … */ }
model Transfer{ /* TRN-000001 — fromId · toId · amountPaisa · feePaisa? · … */ }

model Partner {
  id String @id @default(cuid())
  name String
  kind PartnerKind
  sharePercentBp   Int      @default(0)   // 5000 = 50.00%
  monthlySalaryPaisa Int    @default(0)   // DEC-FIN-004
  joinedAt DateTime
  isActive Boolean @default(true)
  transactions PartnerTransaction[]
}

model PartnerTransaction {
  partnerId String
  kind      PartnerTxnKind
  amountPaisa Int
  happenedAt DateTime
  journalEntryId String?
  note String?
}

model FixedAsset {
  id String @id @default(cuid())
  name String
  assetNo String @unique      // AST-000001
  purchasedAt DateTime
  costPaisa Int
  usefulLifeMonths Int        // ফ্রিজ 48, ভ্যান 60 …
  salvagePaisa Int @default(0)
  lastDepreciatedOn DateTime?
  disposedAt DateTime?
  disposalValuePaisa Int?
}

model PrepaidItem {   // অগ্রিম ভাড়া / জামানত
  id String @id @default(cuid())
  name String
  totalPaisa Int
  startsOn DateTime
  months   Int          // 0 = জামানত (ভাগ হয় না, ফেরতযোগ্য)
  expenseAccountId String?
  refundable Boolean @default(false)
  lastAmortizedOn DateTime?
}

model Loan {
  id String @id @default(cuid())
  loanNo String @unique       // LON-000001
  lenderName String
  kind String                 // BANK | FAMILY | OTHER
  principalPaisa Int
  interestRateBp Int @default(0)
  startsOn DateTime
  termMonths Int?
  payments LoanPayment[]
}
model LoanPayment { loanId, paidAt, principalPaisa, interestPaisa, fromAccountId, journalEntryId }

model AccountReconciliation {
  accountId String
  asOfDate  DateTime
  systemBalancePaisa Int
  countedBalancePaisa Int
  differencePaisa Int
  journalEntryId String?
  actorName String?
  note String?
}

model FinancePostingFailure {   // DEC-FIN-010 replay queue
  sourceType FinSourceType
  sourceId   String
  payload    Json
  error      String
  state      PostingState @default(FAILED)
  retryCount Int @default(0)
  resolvedAt DateTime?
}

model FinanceSetting {          // id = "singleton" (OfferSetting ধাঁচ, cuid নয়)
  goLiveDate DateTime
  fiscalYearStartMonth Int @default(7)      // জুলাই
  defaultCashAccountId String?
  expenseApprovalThresholdPaisa Int @default(5000000)  // ৳50,000
  paymentApprovalThresholdPaisa Int @default(5000000)  // supplier payment (DEC-FIN-026)
  refundApprovalThresholdPaisa  Int @default(1000000)  // নগদ refund
  wastageApprovalThresholdPaisa Int @default(500000)   // নষ্ট/adjustment
  labourBonusPercentBp Int @default(0)      // DEC-FIN-005
  revenueRecognition String @default("DELIVERED")      // locked, তবু explicit
  autoPostEnabled Boolean @default(true)
  lastClosedDate DateTime?                  // period lock (DEC-FIN-025)
  vatEnabled Boolean @default(false)        // DEC-FIN-020 — registration হলে true
  vatRateBps Int @default(1500)             // 15.00%
  vatInclusivePricing Boolean @default(false) // দামের ভেতরে VAT কিনা
  businessBin String?                       // নিজের BIN (Mushak 6.3)
  assetThresholdPaisa Int @default(1000000) // ৳10,000 (FIN-RULE-013)
}

/// DEC-FIN-021 — কোন rider/courier-এর কাছে এই মুহূর্তে কত টাকা (1110-এর subledger view)
model CarrierRemittance {
  id String @id @default(cuid())
  remittanceNo String @unique   // RMT-000001
  carrierType String            // RIDER | COURIER
  carrierId   String
  receivedAt  DateTime
  grossPaisa  Int               // যত COD ধরা ছিল
  chargePaisa Int @default(0)   // courier চার্জ → 5200
  netPaisa    Int               // ব্যাংকে/ড্রয়ারে ঢোকা
  intoAccountId String
  journalEntryId String?
  actorName String?
}
```

**উৎস রেকর্ডে stamp (DEC-FIN-024):** `Order` · `PaymentTransaction` · `SupplierPayment` ·
`StockIssue` — প্রত্যেকটিতে `financePostedAt DateTime?` যোগ হবে। stamp থাকা রেকর্ড
soft-delete/edit হলে service **বাধ্যতামূলক adjusting entry** বানাবে; রাতে drift checker
(order total vs ledger total) না মিললে Ledger screen-এ লাল তালিকা।

**Doc-no pattern:** বিদ্যমান modules-এর মতো `max+1 → padStart(6,'0')`, তবে **`@unique` + retry**
(D8 শিক্ষা — একই সেকেন্ডে দুটো entry হলে সংঘর্ষ; unique constraint ধরবে, service একবার retry করবে)।

---

## ৬. Business Rules

**FIN-RULE-001 — Event ছাড়া entry নয়**
শর্ত: যেকোনো ledger entry · Trigger: posting call · Validation: `sourceType` + (`sourceId` বা `isManual=true`)
Action: entry post · Exception: opening balance (`sourceType=OPENING`, go-live-এ একবার) · Modules: সব

**FIN-RULE-002 — Entry অবশ্যই ভারসাম্যপূর্ণ**
Validation: `Σ debitPaisa == Σ creditPaisa` এবং line ≥ 2 · Action: না মিললে **post হবে না**, failure queue-এ যাবে
Exception: নেই — এটা কখনো শিথিল হবে না

**FIN-RULE-003 — Posted entry immutable**
Action: edit/delete নয়; সংশোধন = নতুন reversal entry (`reversesId`) + নতুন সঠিক entry
Exception: `Expense`/`Income` যতক্ষণ PENDING approval — তখনো journal তৈরি হয়নি, তাই edit/soft-delete চলবে

**FIN-RULE-004 — Revenue শুধু delivered-এ** (DEC-FIN-002)
Trigger: `OrdersService.delivered` · Exception: POS counter sale — বিক্রির মুহূর্তেই delivered ধরা হয়
Modules: Sales · POS · CRM (LTV-র সাথে একই মুহূর্ত)

**FIN-RULE-005 — অগ্রিম = liability**
delivered-এর আগে পাওয়া সব টাকা 2100 Customer Advance-এ; delivered-এ receivable-এর বিপরীতে ছাড়ে
Exception: POS (অগ্রিম ধারণা নেই)

**FIN-RULE-006 — COGS holding দিয়ে** (DEC-FIN-003)
preparing → 1160; delivered → 5000; revert/cancel/fail → 1150। কোনো ধাপে P&L স্পর্শ হয় না delivered ছাড়া
Exception: POS — এক ধাপে 5000/1150 · নষ্ট হলে 1160 থেকে 5100-এ (ফেরত আসেনি বলে)

**FIN-RULE-007 — Posting fail-soft** (DEC-FIN-010)
Finance posting ব্যর্থ হলেও operational transaction **কখনো rollback হবে না**; `FinancePostingFailure`-এ
সারি + timeline-এ ⚠; Ledger screen থেকে এক ক্লিকে replay · Exception: manual Finance form — সেখানে
ব্যর্থ হলে ব্যবহারকারীকে error দেখাবে (তখন ledger-ই মূল কাজ)

**FIN-RULE-008 — Balance সবসময় derived**
কোনো account-এ stored balance থাকবে না; ব্যালেন্স = opening + Σ ledger। Money account সরাসরি
edit করা যাবে না · Exception: নেই — ফারাক হলে reconciliation entry (FIN-RULE-012)

**FIN-RULE-009 — Approval threshold** (DEC-FIN-009)
`amountPaisa ≥ threshold` হলে `approval=PENDING`, journal তৈরি **হবে না** যতক্ষণ approve না হয়
Exception: auto-posted event (বিক্রি/ক্রয়) কখনো approval-এ আটকাবে না — ওগুলো ইতিমধ্যে ঘটে গেছে

**FIN-RULE-010 — বেতন ≠ উত্তোলন** (DEC-FIN-004)
Partner salary → 5410 (EXPENSE, FIXED)। Drawings/capital return → 3100 (EQUITY)। একই ফর্মে
kind বেছে নিতে হবে; সিস্টেম কখনো নিজে অনুমান করবে না · Exception: নেই

**FIN-RULE-011 — Capital-first waterfall** (DEC-FIN-005)
period লাভ → (ক) `labourBonusPercentBp` অংশ শ্রম-পার্টনারকে BONUS → (খ) বাকিটা investor-এর
অনাদায়ী পুঁজিতে (CAPITAL_RETURN) → (গ) পুঁজি ০ হলে তারপর `sharePercentBp` অনুপাতে PROFIT_SHARE
Validation: বণ্টিত টাকা ≤ (Retained Earnings ∧ money account balance) — নগদ না থাকলে block
Exception: লোকসানের period-এ কোনো বণ্টন নয়; শুধু Retained Earnings ঋণাত্মক হয়

**FIN-RULE-012 — Reconciliation পার্থক্য দৃশ্যমান** (DEC-FIN-011)
counted ≠ system হলে পার্থক্য 5700/4300-তে entry হয়ে ব্যালেন্স মেলে · Exception: পার্থক্য ০ হলে entry নয়
কারণ: নীরবে ব্যালেন্স বদলানো = audit trail ধ্বংস

**FIN-RULE-013 — সম্পদ এককালীন খরচ নয়**
`costPaisa ≥ assetThreshold` (setting, default ৳১০,০০০) ও আয়ু > ১২ মাস হলে 1400-এ, মাসিক 5500
Exception: তার নিচে সরাসরি খরচ

**FIN-RULE-014 — Prepaid ভাগ, deposit ভাগ নয়**
`months>0` হলে মাসে মাসে expense-এ; `months=0 ∧ refundable` হলে 1310-এ বসে থাকে, ফেরত পেলে money-তে
Exception: চুক্তি ভেঙে জামানত বাজেয়াপ্ত হলে তখন খরচ

**FIN-RULE-015 — কিস্তিতে আসল ও সুদ আলাদা**
প্রতি `LoanPayment`-এ principal→2200, interest→5600 · Exception: সুদমুক্ত পারিবারিক ধার হলে interest=0

**FIN-RULE-016 — সব রিপোর্ট server-side** (D1 শিক্ষা)
break-even · P&L · aging — সব API-তে হিসাব হবে, browser-এ কখনো নয় · Exception: নেই

**FIN-RULE-017 — Finance operational নিয়ম পুনঃপ্রয়োগ করবে না**
refund cap · stock policy · offer limit — যে module-এর নিয়ম সেই module-এ; Finance শুধু ফলাফল বসায়
Exception: FIN-RULE-002 (ভারসাম্য) — এটা Finance-এর নিজের নিয়ম

**FIN-RULE-018 — branchId বহন** (DEC-FIN-015)
event-এ branch জানা থাকলে entry-তে বসবে · Exception: manual entry — ফাঁকা রাখা যাবে

**FIN-RULE-019 — VAT কখনো আয় নয়** (DEC-FIN-020)
`Order.vatPaisa > 0` হলে ওই অংশ 2400 VAT Payable-এ; Sales Income-এ কখনো নয়। refund/return-এ
VAT অংশও ফেরত (Dr 2400) · Exception: `vatEnabled=false` হলে entry-ও নেই (তখন `vatPaisa` ০ থাকার কথা —
না হলে drift checker ধরবে)

**FIN-RULE-020 — COD টাকা হাতে না আসা পর্যন্ত ক্যাশ নয়** (DEC-FIN-021)
Trigger: COD_COLLECTED · Action: 1110-তে carrier-ভিত্তিক · হাতে এলে remittance entry
Validation: remittance ≤ ওই carrier-এর বকেয়া 1110 · Exception: POS counter (তাৎক্ষণিক ড্রয়ার)

**FIN-RULE-021 — এক ঘটনা এক entry** (DEC-FIN-023)
`sourceKey` ইতিমধ্যে থাকলে নতুন post **চুপচাপ skip**, ত্রুটি নয় · Exception: ইচ্ছাকৃত reversal
(`reversesId` থাকলে key-তে suffix)

**FIN-RULE-022 — posted উৎস বদলালে adjusting entry বাধ্যতামূলক** (DEC-FIN-024)
`financePostedAt` থাকা রেকর্ড edit/soft-delete হলে reversal + নতুন entry; নীরবে কখনো নয়
Exception: নেই — না পারলে edit-ই block হবে

**FIN-RULE-023 — বন্ধ period-এ entry নয়** (DEC-FIN-025)
`entryDate ≤ lastClosedDate` হলে block · Exception: override — কারণ লিখতে হবে, দুই পার্টনারের
নাম audit-এ, আর override হলে ওই period-এর profit distribution "stale" চিহ্নিত হবে

**FIN-RULE-024 — বড় টাকা বেরোনোর সব পথে approval** (DEC-FIN-026)
Expense · supplier payment · নগদ refund · wastage/adjustment — নিজ নিজ threshold
Exception: auto-posted completed event কখনো আটকাবে না (ঘটে যাওয়া ঘটনা)

---

## ৭. Workflows

**W1 — অর্ডার ডেলিভারি (সবচেয়ে গুরুত্বপূর্ণ)**
`delivered` → OrdersService নিজের কাজ শেষ করে → `FinanceService.postEvent(ORDER_DELIVERED)` →
(১) revenue entry (২) COGS entry 1160→5000 (৩) অগ্রিম থাকলে liability ছাড় (৪) COD হলে cash entry।
End state: order timeline-এ "৳X ledger-এ বসেছে"। ব্যর্থ হলে ⚠ + replay queue (FIN-RULE-007)।

**W2 — হাতে খরচ**
ফর্ম (তারিখ · ধরন · অঙ্ক · কোন ঘর থেকে · রসিদ) → threshold-এর নিচে হলে সাথে সাথে post;
উপরে হলে PENDING → অন্য পার্টনার approve → তখন journal। End state: EXP-NNNNNN + ledger লাইন।

**W3 — মাস-শেষ (এক বোতাম)**
depreciation → prepaid amortization → partner salary (auto-draft, edit করে confirm) →
period lock (ঐচ্ছিক) → P&L + break-even snapshot। End state: মাসের সংখ্যা চূড়ান্ত।

**W4 — লাভ বণ্টন**
period বেছে নাও → সিস্টেম দেখায়: লাভ কত · investor-এর অনাদায়ী পুঁজি কত · waterfall অনুযায়ী কে কত
পাবে → confirm → PartnerTransaction + journal + money out। End state: পার্টনার স্থিতি হালনাগাদ।

**W5 — ঘর মেলানো**
account বেছে → সিস্টেম বলে "৳১২,৪০০" → তুমি গুনে বসাও "৳১২,১০০" → পার্থক্য ৳৩০০ Cash Short-এ →
ব্যালেন্স মিলে গেল। End state: `AccountReconciliation` সারি + entry।

**W6 — go-live (একবার)**
তারিখ ঠিক → প্রতিটি money account-এ বর্তমান অঙ্ক · গুদামের মাল (Inventory থেকে auto) · কাস্টমার পাওনা
(Orders থেকে auto) · সাপ্লায়ার দেনা (Purchase থেকে auto) · পার্টনারের এযাবৎ ঢালা পুঁজি (হাতে) ·
সম্পদ ও ধার (হাতে) → একটাই OPENING entry (ভারসাম্য না মিললে পার্থক্য 3200-এ)।

---

## ৮. Module Relationships

**Receives events from:** Sales/Orders (delivered · payment · refund · cancel) · POS (sale · shift close ·
cash movement) · Purchase (received · payment · return) · Supplier (payment · credit) · Returns (complete ·
store credit) · Inventory (SALE · SALE_RETURN · WASTAGE · GIFT · ADJUSTMENT) · Delivery (cost)

**Provides data to:** Intelligence/Dashboard (P&L · cash · break-even) · Sales (order-এ "ledger posted" চিহ্ন) ·
Partner screen · ভবিষ্যৎ Tax module

**Direction:** finance → (orders, inventory, purchases, pos, returns, delivery) **read-only**।
কোনো module `FinanceService` import করবে না — উল্টো Finance একটা `onEvent()` hook দেবে যা ওই service গুলো
call করবে (Inventory mirror-এর ধাঁচ, INV-RULE-001)। **DAG অক্ষত, cycle নেই।**

**Cross-module পরিবর্তন যা Finance-এর জন্য দরকার (F-backlog-এ যাবে):**
- **F14** 🔴 `Order`·`PaymentTransaction`·`SupplierPayment`·`StockIssue`-এ `financePostedAt` (DEC-FIN-024)
- **F15** 🟠 `Order.buyerBin` + Mushak 6.3 challan প্রিন্ট (কর্পোরেট বিক্রি)
- **F16** 🟠 `DeliveryAssignment`-এ COD handover/remittance রেফারেন্স (DEC-FIN-021-এর সাথে জোড়া)
- **F12** 🟠 `DeliveryAssignment.costPaisa` + `costPaidFromId` — এখন কুরিয়ার/রাইডার খরচ **কোথাও নেই**
  (যাচাই করা হয়েছে: schema-তে field নেই)। মালিকানা Delivery-র, Finance শুধু consume করবে
- **F8 নিষ্পত্তি** — `PayMethod` enum এখন Finance money account-এ mapped (DEC-FIN-008); enum বহাল,
  mapping table Finance-owned
- **F13** 🟡 `Employee` module এলে 5420 Employee Salary employee-ভিত্তিক হবে; এখন manual

---

## ৯. Reports & Analytics

| রিপোর্ট | কী দেখায় | সূত্র |
|---|---|---|
| **লাভ-ক্ষতি (P&L)** | আয় − COGS = gross profit − খরচ = net profit | ledger, period-ভিত্তিক |
| **Break-even** | fixed খরচ ÷ contribution margin % | `costBehavior` ট্যাগ (FIN-RULE-016) |
| **নগদ অবস্থান** | প্রতিটি ঘরে কত + মোট | derived balance |
| **নগদ প্রবাহ** | কোথা থেকে এলো, কোথায় গেল | ledger by money account |
| **পাওনার বয়স** | কার কাছে কত, কত দিন ধরে | 1100 + Order/POS due |
| **দেনার বয়স** | কোন সাপ্লায়ারকে কত, কবে থেকে | 2000 + Purchase |
| **পার্টনার স্থিতি** | পুঁজি · উত্তোলন · বেতন · ভাগ · অনাদায়ী পুঁজি | partner subledger |
| **পুঁজি ফেরতের মিটার** | "৳২০ লাখের ৭.৪ লাখ উঠেছে · বর্তমান গতিতে আরও ~১৯ মাস" | waterfall + গড় মাসিক লাভ |
| **পণ্যভিত্তিক লাভ** | কোন পণ্য/ক্যাটেগরিতে আসল মার্জিন | `JournalLine.itemId/orderId` dimension |
| **নষ্টের হার** | নষ্ট ÷ ক্রয় (%) — ফুল ব্যবসার নীরব ক্ষতি | 5100 ÷ purchase |
| **Trial Balance** | সব account মিলছে কিনা (নিজের স্বাস্থ্য পরীক্ষা) | ledger |
| **Balance Sheet** | সম্পদ = দায় + পুঁজি | ledger *(v1-এ পাওয়া যাবে, screen পরে)* |
| **কার কাছে কত টাকা** | rider/courier-ভিত্তিক অনাদায়ী COD + কত দিন ধরে | 1110 subledger |
| **নিজের নগদ vs গ্রাহকের অগ্রিম** | নগদ − 2100 = আসলে খরচযোগ্য কত (DEC-FIN-027) | money accounts − 2100 |
| **নগদ কতদিন চলবে** | (খরচযোগ্য নগদ ÷ দৈনিক স্থির খরচ) | fixed cost + cash |
| **VAT অবস্থান** | মাসে আদায় (2400) − rebate (1500) = জমা দিতে হবে কত | ledger |
| **VAT পরিস্থিতি সুইচ** | "VAT চালু হলে break-even কত হবে" — inclusive/exclusive দুই ধারায় | break-even engine |
| **উৎসব-ভিত্তিক লাভ** | ভ্যালেন্টাইন · মা দিবস · ফাল্গুন — বিক্রি, COGS, নষ্ট, নিট | `OccasionType` + order dimension |
| **জোন-ভিত্তিক লাভ** | কুরিয়ার খরচ ধরার পরে কোন এলাকা লোকসানি | `Order.zone` + 5200 |
| **চ্যানেল-ভিত্তিক লাভ** | Facebook/website/POS — বিজ্ঞাপন খরচ ধরে | `Channel` + 5450 |

### চুরি-সনাক্ত রিপোর্টগুচ্ছ (মালিকের অনুমোদিত, v1)
| রিপোর্ট | কী ধরে |
|---|---|
| **1160 aging** | ৭ দিনের বেশি "পথে" ঝুলে থাকা মাল — হারানো/সরানো |
| **কে কত নষ্ট দেখাল** | actor-ভিত্তিক wastage %, মাসিক সীমা ছাড়ালে সতর্কতা |
| **কে কত ছাড় দিল** | `adjustmentPaisa` + POS discount, cashier-ভিত্তিক (4110) |
| **Store credit গতিবিধি** | কাকে কত দেওয়া হলো, কে ব্যবহার করল (2110) |
| **ক্রয়মূল্যের ওঠানামা** | একই আইটেম আগের চেয়ে বেশি দামে কেনা হলে |
| **নগদ refund তালিকা** | দৈনিক — কে, কত, কোন অর্ডারে |
| **Drift তালিকা** | ledger vs order/purchase অমিল (FIN-RULE-022) |

**KPI (dashboard):** আজকের নগদ · এ মাসের net profit · **break-even অগ্রগতি %** · gross margin % ·
পাওনা/দেনা · নষ্টের হার · অনাদায়ী পুঁজি।

---

## ১০. Settings

go-live তারিখ · অর্থবছর শুরুর মাস · default cash account · **৪টি অনুমোদন সীমা**
(খরচ · supplier payment · নগদ refund · wastage) · **labour bonus %** · asset threshold ·
account master (কোডসহ, `costBehavior` ট্যাগ) · partner master (share % · মাসিক বেতন) ·
auto-post চালু/বন্ধ · **period close তারিখ** · **VAT** (চালু/বন্ধ · হার · দামের ভেতরে কিনা · BIN) ·
carrier remittance ডিফল্ট account।

## ১১. Screens (৯টা — DEC-FIN-012)

`/finance` সারসংক্ষেপ · `/finance/ledger` খাতা · `/finance/accounts` টাকার ঘর+মেলানো ·
`/finance/expenses` · `/finance/income` · `/finance/partners` · `/finance/assets` (সম্পদ·prepaid·ধার) ·
`/finance/reports` · `/finance/settings`

UI polish এখন নয় (kickoff §7) — DEC-ref কখনো rendered-এ নয়, শুধু code comment-এ।

---

## ১২. Non-goals (v1-এ ইচ্ছাকৃতভাবে নেই)

পূর্ণ bank statement import reconciliation · budget vs actual · multi-currency ·
payroll module (বেতন এখন manual expense) · cost center · historical replay (DEC-FIN-007) ·
forecasting/AI insight · EFD/SDC যন্ত্রের সরাসরি সংযোগ (ডেটা রপ্তানিযোগ্য রাখা হবে, সংযোগ পরে) ·
পূর্ণ Tax module (Mushak 9.1 auto-return) — v1-এ শুধু VAT দায় হিসাব + **Mushak 6.3 challan
প্রিন্ট + `Order.buyerBin`** (কর্পোরেট বিক্রির জন্য, মালিক-অনুমোদিত)।

**গৃহীত ঝুঁকি — লগইন (DEC-FIN-028):** এখন `actorName` শুধু টাইপ করা লেখা; যাচাইযোগ্য পরিচয় নেই।
দুই পার্টনারই একমাত্র ব্যবহারকারী বলে মালিক এটা Finance-এর পরে রাখার সিদ্ধান্ত নিয়েছেন।
**ট্রিগার: বাইরের কর্মী/ক্যাশিয়ার নিয়োগের আগে PIN-লগইন বসাতেই হবে** — নইলে §৫-এর
অর্ধেক চুরি-প্রতিকার অকেজো (`RADIAN_FINANCE_REVIEW.md` M3)।

---

## ১৩. যা মালিকের কাছ থেকে লাগবে (go-live-এর দিন)

1. **go-live তারিখ** ও অর্থবছর শুরুর মাস
2. প্রতিটি ঘরের **বর্তমান ব্যালেন্স** (ক্যাশ · বিকাশ · নগদ · ব্যাংক · ওয়ালেট · গেটওয়েতে আটকে থাকা)
3. **পার্টনার তথ্য** — দুজনের নাম · কে কত পুঁজি দিয়েছে (মোট) · share % · শ্রম-পার্টনারের মাসিক বেতন
4. **labour bonus %** (0 = বিশুদ্ধ capital-first)
5. **খরচ অনুমোদনের সীমা** (প্রস্তাব ৳৫০,০০০)
6. **সম্পদের তালিকা** — ফ্রিজ/ভ্যান/কম্পিউটার: দাম · কেনার তারিখ · আনুমানিক আয়ু
7. **জামানত/অগ্রিম ভাড়া** — অঙ্ক · কত মাসের
8. **ধার** — কার কাছে · কত · সুদের হার · কিস্তি
9. খরচের ধরনের তালিকায় কিছু যোগ/বাদ দিতে চাও কিনা
10. **VAT registration আছে কিনা** — থাকলে BIN ও হার; না থাকলে `vatEnabled=false` (তখন POS-এর
    `defaultTaxRateBps`-ও ০ হওয়া উচিত — এখন কত আছে যাচাই করতে হবে)
11. **কুরিয়ারের চার্জ কাঠামো** — Steadfast/Pathao/RedX প্রতি পার্সেলে কত, COD চার্জ কত %,
    remittance কত দিনে (1110 হিসাব ঠিক রাখতে)
12. **রাইডারের হাতে সর্বোচ্চ কত টাকা** থাকতে পারে (সীমা ছাড়ালে সতর্কতা)

---

## ১৪. Build order (লক হওয়ার পরে)

১. schema (উপরের entity গুলো) + `radian_finance_migrate.bat` (migrate → build → prisma generate → restart)
২. seed: Chart of Accounts + FinanceSetting singleton
৩. `FinanceService` — `postEvent()` + balance/report engine (server-side)
৪. hook বসানো: Orders (delivered · payment · refund · cancel) → POS → Purchase/Supplier → Returns →
   Inventory (issue/adjust) → Delivery(cost)। প্রতিটির পরে localhost-এ যাচাই
৫. admin screens ৯টা (সারসংক্ষেপ ও খরচ আগে — সবচেয়ে বেশি ব্যবহৃত)
৬. self-review pass (architecture-review skill) → মালিকের live যাচাই

**ঝুঁকি যা আগেই ধরা:** (ক) doc-no race → unique+retry · (খ) খালি array-তে explicit type
(`const rows: JournalLine[] = []`) — container TS নাহলে `never[]` ধরে (§১৬ শিক্ষা) ·
(গ) প্রতি schema বদলে `prisma generate` + `restart api` বাধ্যতামূলক · (ঘ) fail-soft posting-এ
নীরব ব্যর্থতা যেন লুকিয়ে না থাকে — Ledger screen-এ লাল ব্যাজ + গোনা।

---

## ১৫. Decision Log — DEC-FIN-001 … 019

| ID | সিদ্ধান্ত | কারণ | বিকল্প যা বাদ |
|---|---|---|---|
| **001** | ভেতরে double-entry, বাইরে সরল UI | AVCO/receivable/payable/store-credit ইতিমধ্যেই আছে — cash-ledger নিলে P&L নীরবে ভুল | পূর্ণ accounting UI (মালিক accountant নন) · simplified cash ledger (হিসাব ভুল) |
| **002** | Revenue at `delivered`; অগ্রিম = liability | CRM LTV একই মুহূর্তে আপডেট হয় — দুই জায়গার সংখ্যা চিরকাল মিলবে | payment-এ (আয়-খরচ ভিন্ন মাসে পড়ে) |
| **003** | COGS via `Goods Out for Delivery` (1160) | stock কাটে preparing-এ (DEC-MOD-003) কিন্তু আয় delivered-এ — holding না রাখলে মাসের সন্ধিক্ষণে অমিল + প্রতি fail-এ reversal | preparing-এ COGS · COGS বাদ |
| **004** | শ্রম-পার্টনারের মাসিক টাকা = বেতন (FIXED expense) | নিজের শ্রমের দাম না ধরলে লাভ মিথ্যা বেশি ও break-even ভুল কম | সবটা drawings · সবটা লাভের অগ্রিম |
| **005** | Capital-first waterfall + ঐচ্ছিক labour bonus % | পুঁজি ঝুঁকিতে বসে আছে — আগে ফেরত ন্যায্য; bonus শ্রম-পার্টনারের উৎসাহ রাখে | শুরু থেকেই অনুপাতে ভাগ · অর্ধেক-অর্ধেক |
| **006** | v1 = পুরো map + partner + break-even + delivery cost + asset/prepaid + loan | অর্ধেক ledger বিপজ্জনক (দেখতে নির্ভুল, আসলে ভুল); সব source table আগে থেকেই built | পর্যায়ক্রমে core আগে |
| **007** | go-live opening balance, replay নয় | DB-তে demo/test order আছে — replay করলে হিসাব নোংরা | সব ইতিহাস replay |
| **008** | Money account master + PayMethod mapping | একাধিক ব্যাংক/ওয়ালেট/ব্রাঞ্চ ড্রয়ার আসবে; enum hardcode চলবে না (F8 নিষ্পত্তি) | enum-ই যথেষ্ট |
| **009** | Expense approval threshold | দুই-পার্টনার ব্যবসায় বড় খরচে স্বচ্ছতা; Roles নেই তাই নাম-audit | approval নেই · সব খরচে approval |
| **010** | Event-time hook, fail-soft + replay queue | ledger সবসময় তাজা; কিন্তু হিসাব কখনো বিক্রি/ডেলিভারি আটকাবে না (INV-RULE-001 ধাঁচ) | nightly batch (দিনভর ভুল ব্যালেন্স) · hard-fail (অর্ডার আটকাবে) |
| **011** | হালকা reconciliation | ৯০% উপকার ১০% খাটুনিতে; bank import পরে | পূর্ণ statement import · কিছুই না |
| **012** | ৯টা screen | প্রতিটি আলাদা কাজ; কম করলে খরচ/পার্টনার একসাথে গুলিয়ে যায় | ৪-৫টা |
| **013** | ExpenseCategory ≡ FinanceAccount | "ধরন" আর "expense account" একই ধারণা — দুই master রাখলে One Data One Owner ভাঙে | আলাদা category টেবিল (kickoff sketch) |
| **014** | Ledger immutable, সংশোধন = reversal | audit trail অক্ষত (InventoryMovement ধাঁচ) | edit/delete |
| **015** | প্রতি entry-তে `branchId` (nullable) | FBR ৮৪ branch এলে branch-ভিত্তিক P&L বিনা migration-এ | পরে যোগ করা |
| **016** | সব সংখ্যা server-side | D1 শিক্ষা — client math নীরবে ভুল দেখায় | client-এ যোগ |
| **017** | Partner equity = `JournalLine.partnerId` subledger | পার্টনার বাড়লে নতুন account লাগবে না | per-partner আলাদা account |
| **018** | doc-no `max+1` + unique + retry | বিদ্যমান modules-এর সাথে সঙ্গতি, D8 শিক্ষা (sequential) | random no · DB sequence (Prisma-তে ঝামেলা) |
| **019** | Finance operational নিয়ম পুনঃপ্রয়োগ করবে না | rule duplicate হলে দুই জায়গায় বদলাতে হয় → drift | Finance-এ নিজস্ব validation |
| **020** | VAT = দায় (2400), আয় নয় · input 1500 | POS ইতিমধ্যেই `vatPaisa` আদায় করছে; আয়ে ধরলে লাভ VAT-এর সমান বেশি দেখাবে ও NBR দায় অদৃশ্য থাকবে | VAT পরে ধরা (v1.0-এর ভুল) |
| **021** | `1110 Cash with Rider/Courier` | কুরিয়ার ৩–৭ দিন পরে চার্জ কেটে পাঠায়; delivered-এ ক্যাশ ধরলে নগদ অবস্থান মিথ্যা ও রাইডারের হাতের টাকা অদৃশ্য | delivered-এ সরাসরি Cash (v1.0-এর ভুল) |
| **022** | Supplier posting-এর একমাত্র উৎস `SupplierPayment` | `suppliers.service.ts:767` allocation থেকে `PurchasePayment` বানায় — দুটোই hook করলে একই টাকা দুইবার | দুটোই post করা |
| **023** | `sourceKey @unique` idempotency | replay/concurrent hook-এ দ্বিগুণ entry; ledger immutable বলে মোছাও যায় না | শুধু retry গোনা |
| **024** | `financePostedAt` + adjusting entry + drift checker | `PaymentTransaction.deletedAt` ও delivered order edit — ledger নীরবে আলাদা হয়ে যেতে পারে | উৎস freeze করা (operational flow ভাঙে) |
| **025** | Period close | বণ্টনের পরে পিছনের তারিখে entry = ইতিমধ্যে ভাগ হওয়া লাভ বদলে যাওয়া → পার্টনার বিরোধ | কোনো lock নেই (v1.0-এর ভুল) |
| **026** | Approval পরিধি বাড়ানো | টাকা সবচেয়ে বেশি বেরোয় supplier payment · নগদ refund · wastage দিয়ে, খরচ ফর্ম দিয়ে নয় | শুধু Expense-এ |
| **027** | নিজের নগদ vs গ্রাহকের অগ্রিম | মৌসুমি অগ্রিম খরচ করে ফেললে ডেলিভারির দিন ফুল কেনার টাকা থাকবে না | এক নগদ সংখ্যা |
| **028** | লগইন Finance-এর **পরে** *(গৃহীত ঝুঁকি)* | এখন দুই পার্টনারই একমাত্র ব্যবহারকারী; মালিকের অগ্রাধিকার গোড়াপত্তন | আগে PIN লগইন (সুপারিশ ছিল) — **ট্রিগার: কর্মী নিয়োগের আগে** |

---

_পরবর্তী ধাপ: মালিকের অনুমোদন → schema → FinanceService → hooks → screens → localhost যাচাই।_
