# Radian — চলমান কাজের একমাত্র বোর্ড

> **এটাই একমাত্র জায়গা** যেখানে "কী হয়েছে, কী বাকি" থাকে (CLAUDE.md নিয়ম ১১)。
> প্রতিটা কাজ শুরু/শেষ হলে এই অংশ হালনাগাদ হবে। _সর্বশেষ: ৭ আগস্ট ২০২৬。_
> নিচের A–F অংশ = ২৩ জুলাইয়ের পুরনো backlog — আংশিক শেষ, ধরলে আগে যাচাই。

## নীতি (মালিকের নির্দেশ, ৭ আগস্ট)

**Demo-তে সব থাকবে — সব।** প্রতিটা জিনিস demo-তে sandbox/test মোডে সম্পূর্ণ
পরীক্ষা হবে; real-এ যাওয়া মানে শুধু key/switch বদলানো。 ঝুঁকি সরাসরি real-এ নয়。

## ✅ সদ্য শেষ (৯ আগস্ট রাত) — "purchase করলাম, stock ঢুকল না"

| কাজ | প্রমাণ (deployed demo-তে যাচাই করা) |
|---|---|
| **DEC-INV-016 — গুদাম না থাকলে প্রথম receive নিজেই বানাবে** | PUR-000001 Received+Paid হয়েছিল কিন্তু timeline বলছিল *"No active warehouse — run the inventory seed"*। এটা error-এর ছদ্মবেশে developer-এর নির্দেশ। এখন `ensureWarehouseId()`: সক্রিয় গুদাম → নয়তো soft-deleted `SHOP` জাগাবে (code unique, খালি create করলে সংঘর্ষ) → নয়তো `Main store` বানাবে। **যাচাই:** live-এ এখন একটাই গুদাম, `SHOP / Main store / active` |
| **DEC-PUR-010 — fail-soft মানে অদৃশ্য নয়** | receive hook ইচ্ছাকৃত fail-soft (stock-এর ভুলে committed receipt উল্টে যাবে না), কিন্তু গোটা ঘটনা ছিল শুধু timeline-এর এক লাইনে। এখন — detail-এ প্রতি read-এ per-item ফাঁক, list-এ `stock not posted` ব্যাজ (একটা groupBy, N+1 নয়), আর `POST /purchases/:id/repost-stock` **যা বাকি শুধু তাই** বসায় |
| **PUR-000001 মেরামত** | re-post → `stockGap: null` · InventoryStock: **Paper 20, Sunflower Artificial 50** · দ্বিতীয়বার চাপলে `400 — Stock for this purchase is already posted` (দ্বিগুণ হওয়া অসম্ভব) · list-এর ব্যাজ মিলিয়ে গেছে |

> **কেন নিজে থেকে আবার চেষ্টা করে না:** ভুল auto re-post আসল মাল দ্বিগুণ দেখাবে।
> তাই সিস্টেম ফাঁকটা **দেখায়**, সারায় মালিকের এক চাপে।

## ✅ সদ্য শেষ (৭ আগস্ট)

| কাজ | প্রমাণ |
|---|---|
| Messenger + Instagram DM দুই দিকে | Inbox-এ পরীক্ষিত, নাম-ছবি সহ |
| Duplicate thread / Guest নাম / ছবি inline | migration + কোড, UI-তে যাচাই |
| Privacy policy radianbd.com-এ | live |
| **Meta App Review জমা** | Status: **Review in progress** (৩ permission) |
| WhatsApp ৬ template approve | ⚠️ test WABA-তে — আসল নম্বরে আবার জমা (এক click) |
| SSLCommerz sandbox/live switch স্পষ্ট | SANDBOX \| LIVE দুই ঘর + LIVE-এ confirm |
| Integrations পাতার নতুন নকশা | সমান মাপের পরিষ্কার card, grid — মালিক অনুমোদিত |
| **Tracking: storefront এখন pixel চালায়** | আগে ID বসালেও কিছুই হতো না (কোনো read path ছিল না)। এখন GTM/GA4/Meta Pixel/Clarity/TikTok/Snap/Pinterest inject হয় + PageView·ViewContent·Search·AddToCart·InitiateCheckout·**Purchase** (আসল order নম্বর ও টাকায়, dedupe সহ)। Demo-তে test ID দিয়ে প্রমাণিত। আসল ID বসবে cutover-এ (আগে বসালে ভুয়া ডেটা জমবে) |

## ⏳ অপেক্ষা — অন্যের হাতে

| কী | কার হাতে | কতদিন |
|---|---|---|
| App Review-এর ফল | Meta | সাধারণত ≤২০ দিন; email `radianbd360@gmail.com` |

## 🔜 পরের কাজ (ক্রমে)

1. ~~SSLCommerz demo-তে SANDBOX-এ নামানো~~ ✅ করা হয়েছে (৭ আগস্ট রাতে,
   deployed admin-এ যাচাই সহ; আসল key মোছা হয়নি — শুধু মোড)
2. **Steadfast** — মালিক panel থেকে API Key + Secret Key বসাবে; আমি যাচাই করব
3. **Email sending** — ⏸ **cutover পর্যন্ত আটকে** (৭ আগস্ট রাত)। Brevo account
   খোলা, radianbd.com domain Brevo-তে যোগ করা, ৭টা DNS record তৈরি — কিন্তু
   DNS আছে পুরনো hosting-এর (ns1/ns2.hostget.xyz) হাতে, মালিকের সেখানে
   access নেই। **Cutover-দিনে:** registrar থেকে nameserver → Cloudflare (মালিকের
   নিজের, ফ্রি) → Brevo-র record বসানো → sender `order@radianbd.com` →
   API key card-এ → Send test। Provider সিদ্ধান্ত: **BREVO** (৩০০/দিন ফ্রি,
   transactional + marketing এক জায়গায়)
4. ~~SMS sending~~ ✅ **চালু ও পরীক্ষিত** (৭ আগস্ট রাত) — KhudeBarta, মালিকের
   ফোনে test SMS পৌঁছেছে
5. **WhatsApp আসল নম্বর (Coexistence)** — মোবাইল লাগবে (QR scan);
   তারপর template resubmit + advanced access-এর আলাদা submission

## 🗓️ Cutover-দিনের switch-তালিকা

- SSLCommerz → LIVE · WhatsApp আসল নম্বর · privacy-তে checkout clause
  (`RADIAN_PRIVACY_CLAUSES.md`) · Pixel/GA4/Ads ট্যাগ · `NEXT_PUBLIC_*` যাচাই + Redeploy
- **DNS → Cloudflare** (nameserver বদল registrar-এ, মালিকের access আছে) →
  নতুন site-এর record + **Brevo-র ৭টা record** → email চালু

## 🧹 Security (ছোট কিন্তু জরুরি)

- `recovery-codes.txt` repo থেকে সরানো (মালিক) · GitHub PAT rotate

---

# পুরনো backlog (২৩ জুলাই) — আংশিক শেষ

কীভাবে পড়বে: 🔴 = টাকা/ডেটা ভুল হতে পারে, আগে ধরো · 🟠 = গুরুত্বপূর্ণ ফাঁক ·
🟡 = উন্নতি · 🟢 = পরিচ্ছন্নতা।
বিস্তারিত কারণ + কোডের অবস্থান: `RADIAN_SALES_REVIEW.md` (Sales-এর জন্য),
`RADIAN_ADMIN_PROGRESS.md` (module status)।

---

## A. Sales / Orders — deferred (review §2 থেকে)

| id | সমস্যা | কী করতে হবে |
|---|---|---|
| **D1** 🔴 | **Report · Overview · Payments-এর অঙ্ক শুধু প্রথম ১০০ order থেকে** (`pageSize=100` এনে ব্রাউজারে যোগ করা হয়)। ১০০ ছাড়ালেই revenue · AOV · COD-due **নীরবে ভুল** দেখাবে — অথচ এই সংখ্যা দেখে সিদ্ধান্ত হবে | server-side `GET /orders/analytics?days=` (Product-এর `/products/analytics`-এর ধাঁচে); screen সেখান থেকে পড়বে |
| **D4** 🔴 | **Recovery-র আসল state নেই** — `awaiting_payment` · `payment_failed` · `abandoned` · `flagged_risk`। এখন screen শুধু proxy দেখায় (placed + unpaid)। net চলে গেলে/payment fail করলে **তথ্য হারায়** | storefront-এ **"Place order" চাপার মুহূর্তেই** order save (gateway-এ যাওয়ার আগে) → webhook status বদলাবে → timeout-এ abandoned |
| ~~**D3**~~ ✅ | ~~**Returns & Refunds নেই**~~ — **BUILT 23 Jul** (`RADIAN_RETURNS_MODULE_ARCHITECTURE.md`, DEC-RTN-005..015): staff-initiated, per-reason refund method, partial lines, restock via Inventory (SALE_RETURN), store credit, approval gate, refund ≤ collected। **migration + owner live-verify বাকি** (`radian_returns_migrate.bat`) | done (verify pending) |
| **D2** 🟠 | **Order-এ branch/warehouse নেই** — FBR মডেল ৮৪ branch ধরে, কোন branch পূরণ করছে বোঝা যায় না | `Order.branchId` FK + branch-ভিত্তিক report/stock (migration) |
| **D11** 🟠 | **add-on এখনো "charge", আসল line নয়** — দাম ঠিক যোগ হয়, কিন্তু কোন add-on কত বিক্রি হলো বিশ্লেষণ করা যায় না | `OrderLine.addOnId` optional FK (migration) + `productId` optional করা |
| **D12** 🟠 | **partial / split fulfilment নেই** — এক order-এ ফুল আজ, কেক কাল — এখন একটাই delivery | multi-shipment মডেল |
| **D5** 🟡 | **Settings screen নেই** — order-no format · auto-confirm rule · channel master CRUD · SLA/cut-off | Orders → Settings sub-page (locked: সব admin-configurable) |
| **D6** 🟡 | **invoice/receipt document নেই** — Print পুরো admin page ছাপে | print-only invoice template (gift হলে দাম লুকানোর option) |
| **D7** 🟡 | **notification automation নেই** — এখন শুধু manual WhatsApp/email link | Automation module: order event → template message |
| **D8** 🟡 | **order number random** (`RAD-xxxxx`), sequential নয় — invoice/audit-এর জন্য দুর্বল | DB sequence বা counter table |
| **D9** 🟡 | **timeline API newest-first**, UI গল্পের মতো উপর-নিচ দেখায়; `take` limit নেই | ascending sort + limit |
| **D10** 🟡 | **permission/role নেই** — যে কেউ confirm/cancel/refund পারে | Roles & Permissions module (locked: hardcode নয়, admin-configurable) |
| **D13** 🟡 | **VAT/NBR field নেই** | Tax module lock হলে |
| **D14** 🟢 | live screen এখনো `_data/orders.ts` **mock** থেকে type/meta নেয় | সব `_data/api.ts`-এ সরানো, mock ফাইল মুছে ফেলা |

---

## B. Courier / Delivery

| id | সমস্যা | কী করতে হবে |
|---|---|---|
| **P1** 🟡 | courier **manual** — consignment id হাতে লিখতে হয়, "Copy data entry" দিয়ে paste | Steadfast/Pathao/RedX API integration → এক ক্লিকে consignment তৈরি + auto tracking |
| ~~**P2**~~ ✅ | ~~courier list hardcoded~~ — **CourierService master BUILT 23 Jul** (progress §১৯), seed Steadfast·Pathao·RedX | done (verify pending) |
| ~~**P3**~~ ✅ | ~~method/zone/slot static~~ — **DeliveryMethod+Slot master BUILT 23 Jul** (§১৯); NewOrderForm live; storefront W1-এ | done (verify pending) |
| ~~**P4**~~ ✅ | ~~proof photo upload হয় না~~ — **/delivery/proof BUILT 23 Jul** (data-URL interim, DLV-R08); Cloudinary পরে storage বদলাবে | done (verify pending) |

---

## C. Storefront (`apps/web`)

| id | সমস্যা | কী করতে হবে |
|---|---|---|
| **W1** 🟠 | **web এখনো পুরনো mock-এ** (`_data/orders.ts`, `order.ts`, `auth.ts`) — admin/API নতুন model-এ, web মেলে না | web-কে `:4000` API-তে swap: order · customer (intl phone + recipient book) · checkout |
| **W2** 🟠 | checkout **payment success-এর পরে** order বানায় → D4-এর মূল কারণ | click-এই order তৈরি (D4-এর সাথে একসাথে) |
| **W3** 🟡 | storefront-এ coupon/offer এখনো static | Pricing & Offers API থেকে |

---

## D. Platform / tooling

| id | সমস্যা | কী করতে হবে |
|---|---|---|
| **T1** 🟡 | `package.json#prisma` **deprecated** — Prisma 7-এ কাজ করবে না (এখন শুধু warning) | `prisma.config.ts` বানানো |
| **T2** 🟡 | `.env` **দুই জায়গায়** — root + `apps/api/.env` (Prisma CLI-র জন্য বানানো) | ঠিক আছে, কিন্তু মনে রাখতে হবে: DB পাল্টালে **দুটোই** বদলাতে হবে |
| **T3** 🟠 | root-এ `.gitignore` **ছিল না** — এখন বানানো, কিন্তু **`.env` আগে থেকে git-এ committed থাকতে পারে** | `git rm --cached .env` করে history পরীক্ষা করা; secret ফাঁস হলে key rotate |
| **T4** 🟢 | `seed-orders.js` TS project-এ **JS** ফাইল | ঠিক আছে (ts-node ঝামেলা এড়াতে); চাইলে পরে TS |
| **T5** 🟡 | **কোনো test নেই** — business rule (refund cap · COD · stock) সব manual verify | orders.service-এর rule-গুলোর unit test |

---

## E. পরের module (এখনো শুরু হয়নি)

locked build order: Sales → **Pricing & Offers** → POS → Returns

- ~~**Pricing & Offers**~~ — **BUILT 23 Jul** (progress §১৮, DEC-OFR-001..009): Core-6 engine + quote API + Orders integration। migration bat + মালিক-যাচাই বাকি
- **POS** — দোকানে সরাসরি বিক্রি (আলাদা module, locked)। cash drawer + shift + negotiable price
- **Returns & Refunds** — D3
- **Inventory** — stock এখন Product-এ manual; আসল Inventory module পরে
- **Finance** — ledger; Sales/POS/Delivery-র completed event consume করবে। **NEXT (গোড়াপত্তন) — handoff ready: `RADIAN_FINANCE_KICKOFF.md`** (event-source map + লক-প্রশ্ন সহ; নতুন চ্যাটে হবে)

---

## যেভাবে ধরলে সবচেয়ে কম ব্যথা (সুপারিশ)

1. **D1** — report-এর সংখ্যা বিশ্বাসযোগ্য করা (এখন ভুল দেখাতে পারে)
2. **D4 + W2** একসাথে — checkout-এ click-এই order save (Recovery আসল হবে, তথ্য হারাবে না)
3. **W1** — storefront-কে API-তে আনা (এখন দুই দুনিয়া আলাদা)
4. **D3** — Returns module
5. **D2** — branch
6. তারপর বাকি 🟡/🟢 গুলো ঝাঁকে ঝাঁকে

---

## যা ইতিমধ্যে ঠিক করা হয়েছে (আবার করতে যেও না)

Sales-এর ৪টা critical + ৬টা major বাগ — ভুয়া refund · atomicity/double stock · COD ফাঁকি ·
টাকা বাকি রেখে completed · failed dead-end · negative stock · dead "What's inside" ·
blank channel · double payment। কোডে `REV-*` comment দিয়ে চিহ্নিত, বিস্তারিত
`RADIAN_SALES_REVIEW.md` §1-এ।

**বর্তমান অবস্থা:** API host typecheck **০ error**, admin Orders **০ error**।

---

## F. Cross-module follow-up — Purchase · Inventory · Assembly চক্র থেকে (23 Jul 2026)

_মালিকের নির্দেশ: module বানাতে গিয়ে অন্য module-এ যে বদল দরকার পড়েছে, সেগুলো এখন নয় —
**পরে একসাথে**। এই তালিকাই সেই খাতা। বিস্তারিত: প্রতিটা architecture doc-এর §8/§9।_

| id | কোথা থেকে | কী করতে হবে | কখন |
|---|---|---|---|
| **F1** 🔴 | Inventory DEC-INV-015 | **stage-3 flip**: deduction-এর একমাত্র লেখক Inventory হবে, `Product.stockQty` derived → পরে column drop। **যাচাই-শর্ত পূরণ 23 Jul** (Assembly full-cycle Claude-verified, progress §১৫) — flip এখন করা যায়; POS/Sales পাসে একসাথে | POS পাস |
| **F2** 🟠 | Assembly DEC-ASM-011 | composition এখন দুই ঘরে: `AssemblyTemplate` (produced goods) + `ItemComponent` (MAKE_TO_ORDER) — architecture project-এ এই বিভাজন master Decision Log-এ তুলতে হবে; MTS item-এর recipe-AUTO costing (DEC-ITM-008) এখন কার্যত অব্যবহৃত — রায় লাগবে | architecture sync |
| **F3** ✅ | Purchase DEC-PUR-003 | ~~Supplier module~~ — **হয়ে গেছে 23 Jul** (`RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md`, progress §১৬): FK + auto-link + link tool + credit ledger + apply flow | done |
| **F4** 🟠 | UOM ruling §5.3 | `OrderLine`-এ `unitId` + `factorSnapshot` (Purchase line-এর মতো) | Sales পরের পাস |
| **F5** ✅ | Returns (D3) | ~~`SALE_RETURN` reason reserved~~ — **consumed 23 Jul** by `InventoryService.postSaleReturn` (restock lines only, fail-soft) | done |
| **F6** 🟡 | Assembly deferred | dismantle/un-build · deadline+partial % · team master (Employee) · approval (Roles) · build-form wastage কলাম (stocktake-এ ভুলে-যাওয়া ধরা পড়লে) | নিজ নিজ trigger |
| **F7** 🟡 | Inventory §8 | per-branch AVCO + in-transit transfer (প্রথম branch) · low-stock WhatsApp (Automation D7) · Warehouse master-এর মালিকানা Warehouse module নেবে (টেবিল adopt, নতুন নয়) | branch/module trigger |
| **F8** 🟡 | Purchase §9 | `PayMethod` enum → Finance-owned master · Requisition/PO UI (প্রথম branch বা দ্বিতীয় ক্রেতা-সিদ্ধান্তগ্রহণকারী) | Finance/branch |
| **F9** 🟡 | সব module | DEC-ITM/PRD/CUS/SAL/PUR/INV/ASM provisional id গুলো architecture project-এর master Decision Log-এ registration | architecture sync |
| **F10** 🟢 | সব master data | soft-deleted restore (Trash) — Item/Brand/Unit/Template একসাথে এক প্যাটার্নে | এক পাসে |
| **F11** 🟠 | Supplier DEC-SUP-003/004 | **Fulfillment vendor order flow**: cake-জাতীয় item বিক্রিতে stock-skip নিয়ম (Sales/Inventory) · order এলে vendor-কে AUTO SMS/WhatsApp (Automation D7, gateway লাগবে; message-এ customer info কখনো নয় — SUP-R07) · order ↔ vendor sourcing link। Supplier master + `Item.supplierId` + manual send এখনই আছে | Sales flow পাস / Automation D7 |

---

## G. Deferred cross-module UPDATE গুলো (মালিকের নির্দেশ 23 Jul: Pricing & Offers + Delivery-র **পরে** একসাথে ধরা হবে)

_পরের module বানাতে গিয়ে আগের module-এ যে সিদ্ধান্ত নেওয়া হয়েছিল কিন্তু implement হয়নি — সেই খাতা।_

| id | কোথায় | কী করতে হবে |
|---|---|---|
| **G1** 🟠 | Product editor | **"এটা আমাদের নাকি supplier-এর" দেখানো** — Supplier module-এর পরের সিদ্ধান্ত। Item→`supplierId` (DEC-SUP-004) আছে; Product editor/list-এ vendor-sourced badge + supplier name দেখাতে হবে (Item link হয়ে) |
| **G2** 🟠 | Product editor | **SKU field UI-তে নেই** অথচ সিদ্ধান্ত আছে (DEC-ITM-021: `Product.sku` = ecommerce code, `Item.sku` = stockroom code)। Product form-এ SKU input + list-এ কলাম |
| **G3** 🟡 | Audit-এ ধরা (AUD-1 🔴) | Order edit-এ preparing-এর পরে line add করলে stock কাটে না, কিন্তু cancel-এ revert হয় → phantom stock। fix: add-এ deduct+mirror, না হলে addItems gate বন্ধ |
| **G4** 🟡 | Audit-এ ধরা (AUD-2) | POS sale online Orders list/KPI-তে মেশে — `GET /orders`-এ `fulfillmentType` filter + screen আলাদা |
| **G5** 🟡 | সব module | আরো যা যা মালিকের মনে পড়বে — এখানে যোগ হবে (এই তালিকা খোলা) |

---

**23 Jul নোট:** DB reset হয়েছে (drift; মালিক-অনুমোদিত) — A/D অংশের কিছু পুরনো ধরে-নেওয়া অচল হতে পারে।
API container: source baked + `nest start --watch` — **backend বদল = `docker compose up -d --build api`**।
নতুন কোডে খালি array-তে explicit type লিখো (`const rows: X[] = []`) — container TS নাহলে never[] ধরে।
