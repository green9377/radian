# Radian Admin — Progress & Handoff (Product + Customer + Sales done → Pricing & Offers next)

_শেষ আপডেট: 17 July 2026। নতুন chat শুরুতে **এই ফাইল আগে পড়ো**, তারপর নিচের skill লোড করো।_

---

## ১. এখন পর্যন্ত কী হয়েছে

**Product Management module-এর admin panel তৈরি (frontend, mock)।** Backend এখনো wire করা হয়নি — Save/Publish শুধু prototype alert। কোডে `⇄ SWAP HERE` কমেন্টে চিহ্নিত কোথায় API বসবে।

### Admin আলাদা app হিসেবে বানানো
| Port | App | কাজ |
|---|---|---|
| :3000 | `apps/web` | storefront (গ্রাহক) |
| **:3001** | **`apps/admin`** | **admin panel (নতুন — এখানেই সব module বসবে)** |
| :4000 | `apps/api` | NestJS + Prisma API (infra only, কোনো model নেই) |

চালাতে: `cd D:\radian\apps\admin` → `npm run dev` → `http://localhost:3001`
(PowerShell-এ `cd /d` নয়, শুধু `cd`।)

### apps/admin-এর গঠন
- `app/layout.tsx` — shell (বাঁয়ে sidebar), Fraunces/Jost font, `globals.css`
- `app/page.tsx` → `/products`-এ redirect
- `app/products/` — `page.tsx` (list) · `new/page.tsx` · `[slug]/page.tsx` (edit)
- `app/_components/` — `AdminSidebar.tsx` · `ProductListView.tsx` · `ProductEditor.tsx` · `Icon.tsx`
- `app/_data/` — `products.ts` · `productDetails.ts` · `promo.ts` (web থেকে কপি করা mock; Zone type inline। API এলে সরবে)

### UI convention (সব module-এ মানতে হবে)
- **Admin-এর সব লেখা English** (panel-এ বাংলা নয়)। চ্যাটে উত্তর বাংলা, কোড/term English।
- Brand token: `globals.css` — purple `#470066`, orchid `#cf43ea`, lavender, rosegold; serif = Fraunces (`font-display`), ui = Jost।
- **`.ipt`** = shared input/select/textarea class (সাদা box, বেগুনি border, padding 8px, min-height 40px)। নতুন field-এ এটাই ব্যবহার করো।
- Editor layout: বাঁয়ে **vertical section-nav** (icon সহ), মাঝে section, ডানে **Live storefront preview** (state থেকে live)।
- Row editor = **CSS grid** (flex নয় — `.ipt` width:100% flex-এ চাপে), প্রতি column-এর উপরে guide-নাম।
- **Template pattern:** category select → "Load" → row ভরে যায় → edit। (এখন preset = `productDetails.ts` থেকে; নিজের template save backend-এ।)
- Icon = `Icon.tsx` inline set (বাইরের lib নেই)।
- List = stat card + search/filter + polished table।

---

## ২. Product module-এ যেসব সিদ্ধান্ত locked (schema/API-তে enforce হবে)

- **টাকা = paisa integer** (input টাকায়, store paisa)।
- `productType`: **READYMADE | CRAFTED** — cancel/advance নিয়ম আলাদা।
- `stockMode`: **MANUAL | TRACKED** (এখন default MANUAL, Inventory পরে)। **Manual stock Product-owned; প্রতি order-এ ১ কমবে, cancel-এ ফেরত** (fake হলেও আসল দেখাতে)। `showStock` toggle আলাদা।
- `salesCount`: manual seed, **প্রতি order-এ ১ বাড়বে** (auto-count)। "N orders this month" হয়ে দেখায়।
- **Pricing:** cost · sellingPrice · discount (flat/%) → offer price + margin। Coupon/campaign = **Pricing & Offers module** (আলাদা, এখানে নয়)।
- **Payment override (Product-level):** `advanceRequired` + `advanceType` (FULL/PARTIAL) + কত % / কত ৳ upfront। বেস self/gift নিয়ম = checkout/Sales।
- **Delivery:** `zone` (DHAKA | NATIONWIDE)। speed **zone-ভিত্তিক** (Dhaka: 2-hour/same-day/midnight; National: courier)। badge পরে Delivery module থেকে derive।
- **Variant** (রঙ/flavour) = আলাদা product, `variantGroupId` FK, নিজের ছবি। **Size** = একই product, শুধু দাম। **Upgrade product** = নিজের নাম+ছবি+দাম। **Add-on** (+chocolate) = **Ecommerce module** (এখানে নয়)।
- **PDP "story" (Product owns):** `shortDesc` (title-এর নিচে), `type` (free text), nature label, images/gallery (Cloudinary পরে), video (YouTube), trust badges (category template; নিজের icon upload পরে), what's-inside (components, template), **FAQ → product page-এ "Before You Order" section-এ দেখায়** (template + common merge), nationwide-unavailable message।
- **Tags:** occasion + recipient = **Tag master**, many-to-many।
- **সবসময়:** One Data One Owner · soft-delete (`deletedAt`) · audit + activity timeline · locked module-ই কেবল।

---

## ৩. Customer Management — DONE (admin mock) ✅

`apps/admin`-এ "Customers" section তৈরি (Product-এর মতোই frontend mock, `⇄ SWAP HERE` marker সহ)। sidebar-এ live link।

### ফাইল
- `app/_data/customers.ts` — Customer + Recipient + Segment model, ৫ demo customer (২ NRB: USA/KSA), helper (initials/tier/isAbroad/shortDate/ago/occasionDate)
- `app/_data/countryCodes.ts` — dial-code list (BD first, ২৪ দেশ) + `splitPhone`/`joinPhone`
- `app/_components/CustomerListView.tsx` — stat card + search/country/segment/status filter + table
- `app/_components/CustomerEditor.tsx` — section-nav (Profile · Recipients · Segments & notes · Orders · Activity) + ডানে live "My Account" preview
- `app/_components/PhoneField.tsx` — **searchable** country-code dropdown + number (flag সহ)
- `app/customers/` — `page.tsx` · `new/page.tsx` · `[id]/page.tsx`

### Customer decisions locked (schema/API-তে enforce হবে)
- **Phone = identity key, INTERNATIONAL** — যেকোনো country code (WhatsApp OTP login, no password)। BD বাধ্যতা নেই। PhoneField = searchable dial-code dropdown; store একক string `+8801…`।
- **Recipient book = customer-owned sub-entity** (আলাদা Customer নয় — list ভুয়া রেকর্ডে ভরবে না, One Data One Owner)। প্রতি recipient: name · phone (any country) · relationship · delivery zone+address · occasions (birthday/anniversary/custom, `MM-DD` recurring → reminder) · favourite · deliveriesCount (read-only)।
- **country** field customer-এ (residence; ≠ Bangladesh হলে NRB/abroad)। list-এ Country column + Bangladesh/Abroad filter।
- **Segments** = admin master, many-to-many (VIP/Corporate/Birthday/Anniversary/Wholesale) — Product Tag master-এর মতো।
- **Orders / LTV / AOV / deliveries = OWNED BY SALES** — Customer শুধু **read-only reference** (One Data One Owner)। New/Repeat = order-count থেকে **derived**, stored field নয়।
- **Block ≠ Delete**: block = login/order বন্ধ কিন্তু data থাকে; delete = soft-hide। audit everywhere · টাকা = paisa (`ltvPaisa`)।

⚠️ storefront (`apps/web`) এখনো পুরনো mock (`auth.ts` = phone/email/addresses)। schema/API lock হলে web-ও এই নতুন model-এ (intl phone + recipient book) swap হবে — checkout/account মিলিয়ে।

---

## ৪. Sales / Orders — DONE (admin mock) ✅

`apps/admin`-এ "Orders" section তৈরি (Product/Customer-এর মতোই frontend mock, `⇄ SWAP HERE` marker সহ)। sidebar-এ live link। এটা **Online Sales** — POS আলাদা module।

### ফাইল
- `app/_data/orders.ts` — Order model + ৬ demo order। **দুই status track**, payment status, `customerId`/line-এর `productId` FK, `channel`, per-line `productType`, per-line refund, `prepPhoto`/`deliveryPhoto`, `internalNote`, `editableFields()` guard, helper (formatTaka/shortDate/ago/clockTime/hasCrafted/customerName)
- `app/_components/OrderListView.tsx` — stat card (Needs action/Preparing/Delivered/Revenue/COD due) + search/filter + table (আলাদা Sales chip ও Delivery chip)
- `app/_components/OrderEditor.tsx` — **detail, READ-ONLY**, tab-by-tab (Summary·Customer·Items·Delivery·Photos·Payment·Activity) + ডানে live customer tracker। উপরে **bold labelled status band** (Order status/Payment/Fulfilment/Total)। nav-এ badge (item count, due ৳, photos ✓)। Customer/Recipient phone-এ Call link। "Edit order" → edit page-এ যায়
- `app/_components/OrderEditForm.tsx` — **এক Edit page-এ সব edit** (recipient/delivery address+phone/date/slot/note · item add/remove/qty · per-line discount · order adjustment · internal note) + ডানে **bold live summary** (Total বড়, Due/Refund রঙিন box)
- `app/_components/ProductPicker.tsx` — searchable list, প্রতি product-এ **ছবি+নাম+দাম**, click করে add
- `app/_components/CustomerSelect.tsx` — **customer dropdown combobox** (search + list নাম(ফোন)·orders·LTV) + নিচে "Create new customer"
- `app/orders/` — `page.tsx` (list) · `[id]/page.tsx` (detail) · `[id]/edit/page.tsx` (edit) · `new/page.tsx` (staff/phone order create — working mock form)

### Sales decisions locked (schema/API-তে enforce হবে)
- **দুই status track (One Data One Owner):** `salesStatus` (placed/confirmed/completed/cancelled — Sales-owned) + `deliveryStatus` (unassigned/preparing/out_for_delivery/delivered/failed/stock_reverted — Delivery-owned)। গ্রাহক merged 5-step tracker দেখে; ভেতরে আলাদা।
- **DEC-MOD-003:** stock −1 **Delivery "preparing"-এ**, confirm-এ নয়।
- **salesCount +1 আর Customer ltvPaisa/ordersCount → DELIVERED-এ বাড়ে** (sobuj 16 Jul)। cancel-before-delivered = গোনা হয় না।
- **Cancellation refund = PER LINE:** readymade পুরো ফেরত, crafted advance forfeit (preparing হয়ে গেলে)।
- **Payment status enum:** unpaid/advance_paid/paid/cod_collected/partially_refunded/refunded। COD শুধু self + no-crafted; gift-এ কখনো COD নয় (`payment.ts` rule)।
- **FK:** order → `customerId`; line → `productId`। `sender` snapshot = frozen রসিদ (contract)। material/what's-inside Product থেকে **read** (`getProductDetail().spec`) — order কপি রাখে না।
- **productType per line** (readymade/crafted) — cancel/advance branch।
- **channel** = online sub-channel (website/facebook/whatsapp/phone/…); **admin-configurable Channel master** (dropdown + "Custom"); POS আলাদা module।
- **Proof photo** (prep + delivery) = **Delivery-owned**, Sales শুধু দেখায়।
- **Edit guardrail (`editableFields`):** item add/remove lock at preparing (stock committed); address/recipient lock at out_for_delivery; **money edit (line discount + order adjustment) খোলা order-close পর্যন্ত**। raw unit price rewrite নয় — Product-ই price owner; discount/adjustment = audited record।
- Money collection/refund Radian record করে; **ledger entry Finance-owned** (completed event থেকে post)।
- "Return Order" (Sales) ≠ "Stock Reverted" (Delivery) — আলাদা।
- সবসময়: One Data One Owner · soft-delete (`deletedAt`) + audit/activity timeline · টাকা = paisa।

### ★ DESIGN RULE (সব module, সবসময় — 17 Jul locked)
**সাদা-ফাঁকা screen চলবে না।** প্রতিটা screen হতে হবে **colorful · user-friendly · সিদ্ধান্ত নেওয়া সহজ · কাজ করা সহজ**।
- **Tone system** (`OrderViews.tsx`-এর `TONE`): purple (brand/neutral) · green (ঠিক আছে/টাকা এসেছে) · amber (তোমার কাজ বাকি) · rose (ঝুঁকি/বাতিল) · blue (চলমান/তথ্য) · gold (টাকা বাকি)। প্রতি tone-এ bg · border · text · solid।
- **KPI card** = tinted background + রঙিন icon badge + বড় সংখ্যা (সাদা box নয়), ক্লিক করলে সংশ্লিষ্ট screen-এ যায়।
- **Panel header** রঙিন (tinted strip + icon badge + count pill)। **প্রতি row-তে বাঁয়ে status stripe**; customer-এ gradient avatar।
- **Decision-first:** screen-এর মাথায় "এখন কী করতে হবে" (hero/quick pill), তারপর table। প্রতি item-এ একটাই স্পষ্ট action (Confirm/Call)।
- Empty state বন্ধুসুলভ (icon + এক লাইন), শুধু "No data" নয়। Note/warning = tinted box, ধূসর ছোট লেখা নয়।
- Brand palette আগে; semantic রং শুধু **অর্থ** বোঝাতে — সাজসজ্জার জন্য নয়।

### ⚠️ Sales module review — `RADIAN_SALES_REVIEW.md` (17 Jul)
পুরো A-to-Z review হয়েছে। **৫টা critical + ৬টা major বাগ ঠিক করা হয়েছে** (কোডে `REV-*`
comment): ভুয়া refund · atomicity/double stock · COD নিয়ম ফাঁকি · টাকা বাকি রেখে
completed · failed dead-end · negative stock · dead "What's inside" · blank channel ·
double payment। **বাকি deferred (D1–D14) ওই ফাইলে** — সবচেয়ে জরুরি **D1: report-এর
সংখ্যা এখন প্রথম ১০০ order থেকে হিসাব হয় → server-side `/orders/analytics` লাগবে**।
Sales-এ হাত দেওয়ার আগে ওই ফাইল পড়ো।

### UI শিক্ষা (নতুন module-এ মানতে হবে)
- **`.ipt` = width:100% → flex-এ সব জায়গা খায়** (input বিশাল হয়ে পাশের লেখা ভাঙে)। row editor-এ **CSS grid** ব্যবহার করো, narrow input bounded cell/wrapper-এ রাখো।
- customer/lookup = **searchable dropdown combobox** (`CustomerSelect`/`PhoneField` pattern), free-type নয়।
- product বাছা = **visual picker** (ছবি+নাম), plain `<select>` নয়।
- detail = view-only; edit = আলাদা page — গুলিয়ে ফেলো না।

⚠️ storefront (`apps/web`) এখনো পুরনো mock। schema lock হলে web ও admin দুটোই নতুন Order model-এ swap হবে।

_(frontend spec যেখান থেকে derive করা: `apps/web` এর `_data/orders.ts`·`order.ts`·`delivery.ts`, `_store/useCartStore`·`useCheckoutStore`·`useZoneStore`, `_data/payment.ts`।)_

---

## ৫. পরের কাজ — **Schema → API** (Option B, বাছা হয়েছে 17 Jul)

Product + Customer + Sales/Orders — তিনটাই admin mock done। এবার **backend (:4000, এখনো model-শূন্য)** এ এই তিন module lock করা হবে। ক্রম প্রতি module-এ: **Database schema → Backend API / business rules → (পরে) frontend swap** (locked build order)। উৎস: §2 (Product) · §3 (Customer) · §4 (Sales) এর locked decisions।

- Schema-এ enforce করতে হবে: One Data One Owner (FK, duplicate নয়) · soft-delete (`deletedAt`) · audit + activity timeline · **টাকা = paisa integer** · প্রতি locked-decision-এ code comment-এ `DEC-XXX-NNN` cite।
- Sales schema-এর জন্য বিশেষভাবে: দুই status track আলাদা field · payment status enum · line-এ productType · per-line refund · proof photo Delivery-owned · salesCount/LTV **delivered event-এ** · channel · stock −1 **Delivery preparing-এ (DEC-MOD-003)**।
- Stack: NestJS + Prisma (`apps/api`)। এখনো কোনো model নেই — এখান থেকেই শুরু।
- ⚠️ downstream module (Finance ইত্যাদি) এখন lock না — শুধু locked ৩ module-এর schema/API।

## ৫খ. তারপরের module — **Pricing & Offers** (Commerce, locked)

coupon/campaign-এর **owner Pricing & Offers** (Orders শুধু applied code+snapshot রাখে)। Grand Slam Offer / Hormozi framework · channel-based pricing (Website fixed · POS negotiable) · Display Scarcity Counter = cosmetic (real stock নয়)।

---

## ৫গ. Admin panel — module build plan (ক্রম)

**Done (admin mock):** ✅ Product · ✅ Customer · ✅ Sales/Orders
**চলছে:** ⏳ Schema → API (Product · Customer · Sales) ← **এখন এখানে**

তারপর (locked module-ভিত্তিক, দোকানের বাস্তবতা মিলিয়ে):
1. **Pricing & Offers** — coupon/discount owner (Orders-এর সাথে সরাসরি যুক্ত)
2. **Delivery Management** — Orders যেটা reference করে (fulfilment status · proof photo · zone×type availability matrix); policy Sales-owned, Delivery শুধু execute
3. **Inventory** — stock সত্যিকারের করা (DEC-MOD-003 deduction), showStock/salesCount সত্য
4. **POS** — walk-in/immediate (Online Sales থেকে আলাদা module)
5. **Returns & Refunds** — staff/CS-initiated only (customer-direct নয়)
6. **Supporting master data** (দরকারমতো): Category · Occasion/Tag master · Supplier/Purchase · Branch/Warehouse (FBR) · Employee/Roles & Permissions
7. **Finance** — ledger; Sales/POS/Delivery-এর **completed event** consume করে (manual insert নয়)
8. পরে: Marketing · Reports/Dashboard/Analytics

_(build_sequence locked: Item→…→Product → Warehouse/Branch → Customer/Supplier/Vendor/Employee → Tax → Purchase→Inventory→Quality→Delivery → Sales→Pricing→POS→Returns। উপরের ক্রম এই sequence + commerce priority মিলিয়ে।)_

---

## ৬. নতুন chat-এ যা যা লাগবে

**Access:**
- Folder connect: `D:\radian` (এখানেই সব — web/admin/api + handoff)
- আলাদা কোনো access লাগে না। apps host-এ চলে (npm run dev)।

**Skill (এই ক্রমে):**
1. `radian-development-context` (আগে — locked status, build sequence, naming, core principles)
2. `radian-business-context` (কেন / business reasoning)
3. module design শুরু হলে: `module-design-template` · `business-rules-writing` · `decision-log-writing` · `architecture-review`

**পড়ার ক্রম:** এই ফাইল (`RADIAN_ADMIN_PROGRESS.md`) → **`RADIAN_PENDING.md`** (যা যা বাকি, সব এক জায়গায়) → Sales-এ কাজ করলে `RADIAN_SALES_REVIEW.md` → দরকারে `RADIAN_ADMIN_MODULES.md` · `RADIAN_BACKEND_HANDOFF.md`।

**নতুন assistant-কে যা বোঝাতে হবে:**
- admin আলাদা app = `apps/admin` (:3001); সব নতুন module এখানেই।
- UI convention (উপরে ২ নং section) হুবহু মানতে হবে — English UI, brand token, section-nav + live preview, grid row, template pattern।
- **code-first (locked 20 Jul):** আলাদা HTML mockup বানানো হবে **না** — সরাসরি `apps/admin`-এ আসল কোড তুলে **localhost:3001-এ live review** হবে, তারপর review অনুযায়ী iterate/fix। (বিস্তারিত: নিচের "১২. LOCKED — code-first workflow" section)
- চ্যাটে **বাংলা script**, concise; user suggest করলেই মেনো না — critically evaluate।
- One Data One Owner · soft-delete + audit · টাকা = paisa · locked module-ই কেবল।
- এখন সব **mock** — backend (:4000) এখনো model-শূন্য। **Product + Customer + Sales/Orders** admin (mock) done (§2, §3, §4)। **বাছা হয়েছে: পরের কাজ = Schema → API** এই তিন module-এর (§5 · Option B)। তারপর Pricing & Offers (§5খ)। পুরো plan §5গ।
- Schema/API শুরু করলে skill: `radian-development-context` (locked status/naming/core) + দরকারে `architecture-review` · `decision-log-writing`। প্রতি নিয়মে code comment-এ `DEC-XXX-NNN` cite।

---

## ৭. Backend Schema → API সম্পন্ন ✅ (17 Jul 2026)

`apps/api` (NestJS + Prisma) এ **Product · Customer · Sales** তিন module-এর database schema + backend API + business-rule সম্পূর্ণ, আসল Postgres-এ smoke-test দিয়ে যাচাই করা।

### Infra
- DB: docker `radian_postgres`, **host port 5433** (host-এ আগে থেকে একটা native postgres 5432-এ চলছিল, conflict এড়াতে; container-এর ভেতরে 5432 অপরিবর্তিত, তাই dockerized web/api-তে প্রভাব নেই)। `docker-compose.yml` আপডেট করা।
- Migrations: `product_module`, `customer_module`, `sales_module` — সব applied। মোট 20 model, 20 enum।
- Soft-delete: `src/prisma/soft-delete.extension.ts` (top-level read auto-filter; AuditLog/ActivityEvent denylist) + প্রতিটা nested `include`/`_count`-এ explicit `where:{deletedAt:null}` (extension nested include ধরে না — smoke-এ ধরা পড়েছিল, fixed)।
- Audit + Timeline: polymorphic `AuditLog` + `ActivityEvent`, `src/common/audit.service.ts` — সব module share করে।
- টাকা = paisa Int; শুধু `Customer.ltvPaisa` = BigInt (future-safe, response-এ Number-এ map)। `main.ts`-এ BigInt toJSON + CORS।

### যা enforce করা (smoke-verified)
- **Product:** offer/margin হিসাব, discount PERCENT=basis points, advance-override নিয়ম, category(2-স্তর)/tag(m2m)/variantGroup master, soft-delete+restore, timeline।
- **Customer:** phone=intl identity (unique, `+` বাধ্যতা), recipient book + occasions (customer-owned), segment master(m2m), block≠delete, Sales-owned field (ordersCount/ltvPaisa/lastOrderAt) API থেকে সেট হয় না, tier derived।
- **Sales (§4 সব locked রুল):** দুই status track · **stock −1 Delivery "preparing"-এ, confirm-এ নয় (DEC-MOD-003)** · **salesCount+1 ও Customer LTV/ordersCount delivered-এ** (cancel-before-delivered গোনা হয় না) · **per-line refund** (readymade full, crafted advance forfeit) · cancel-এ stock revert → `stock_reverted` · **COD শুধু self+no-crafted, gift-এ কখনো নয়** · Channel master · proof photo (OrderPhoto) Delivery-owned · payment status enum + PaymentTransaction · editableFields guardrail।

### কোড অবস্থান (`apps/api/src`)
`prisma/` (service+extension) · `common/` (audit) · `products/` · `customers/` · `orders/` · `catalog/` (categories·tags·variant-groups·segments·channels)।

### চালানোর নিয়ম (host)
- Postgres: `docker compose up -d postgres` (port 5433)।
- host-এ migrate/run: `set DATABASE_URL=postgresql://radian_user:radian_pass@localhost:5433/radian_db` (Prisma auto .env @postgres:5432 নয়, host-এ localhost:5433)।
- helper scripts D:\radian-এ: `radian_migrate.bat <name>` · `radian_build.bat` · `radian_smoketest.bat`।

### ⚠️ খেয়াল
- DEC-PRD/CUS/SAL-NNN আইডিগুলো **provisional** — architecture project-এর Decision Log-এ register করা বাকি (`decision-log-writing`)।
- smoke-test আসল DB-তে কিছু test row (product/customer/order) রেখে গেছে — চাইলে clean করা যাবে।
- `down -v` করার সময় চালু `radian_web`+`radian_api` container থেমেছিল — দরকারে `docker compose up -d` দিয়ে ফেরানো।
- এখনো frontend (web/admin) mock; পরের ধাপ = **frontend swap** (mock → :4000 API) অথবা **Pricing & Offers** module (§5খ)।

## ৮. Admin Frontend Swap — Product · Customer · Orders LIVE ✅ (17 Jul 2026)

Admin panel (`apps/admin`, :3001) এর তিনটি module এখন mock ছেড়ে **আসল :4000 API**-তে চলছে — সব swap করা + browser-এ verified।

### যেসব component swap হয়েছে
- **Product:** `ProductListView.tsx` · `ProductEditor.tsx` (create/edit → real POST/PATCH)।
- **Customer:** `CustomerListView.tsx` · `CustomerEditor.tsx`।
- **Orders:** `OrderListView.tsx` (দুই status track chip) · `OrderEditor.tsx` (detail + status-action bar; **Country/LTV এখন আসল Customer record থেকে**) · `NewOrderForm.tsx` (real create) · `OrderEditForm.tsx` (real load+save) · `ProductPicker.tsx` · `CustomerSelect.tsx`।
- **Data layer:** `app/_data/api.ts` — সব fetch helper, types, `adaptOrder`/`adaptTimeline` (per-line `discountPaisa` সহ), status-meta chip।

### Orders business-rule টেস্ট — সব PASS (আসল Postgres + API দিয়ে)
1. **Create** (self · COD · readymade): placed + unassigned, subtotal/total ঠিক।
2. **DEC-MOD-003:** confirm-এ stock অপরিবর্তিত (47→47), **prepare-এ stock −qty (47→45)** — locked রুল ঠিক আছে।
3. **Delivered:** salesStatus=completed, **Customer LTV += order total (0→৳5,960), ordersCount +1**।
4. **Cancel (readymade, prepared):** cancelled + stock_reverted, **stock ফেরত**, full refund, partially_refunded।
5. **Cancel (crafted, 50% advance):** ৳790 line → **৳395 forfeit → ৳395 refund** (net − advance)।
6. **COD guard backend-enforced:** gift-এ COD → 400 "locked §4", crafted-এ COD → 400 "locked §4"। (শুধু form নয়, API-ও আটকায়।)
7. **Edit (PATCH):** address/note/adjustment/per-line discount persist + total recompute ঠিক; **cancelled order edit → 400 "order is closed"** (editableFields guardrail)।

### ⚠️ খেয়াল
- **টেস্ট data:** আসল DB-তে ৫টি extra test order রয়ে গেছে (RAD-62331 · RAD-90064 delivered; RAD-85672 · RAD-64574 · RAD-66718 cancelled)। ২ demo customer (Rafiul, Tania) এর LTV/ordersCount ওই delivered order থেকে বেড়ে গেছে। **পরিষ্কার demo চাইলে `radian_seed.bat` double-click** করলে baseline-এ reset হবে।
- **Line composition frozen:** OrderEditForm-এ item add/remove/qty নেই — backend edit শুধু discount/adjustment/recipient/delivery/note নেয় (line frozen at ordered price, DEC-MOD-003 stock commit)। item বদলাতে হলে cancel (per-line refund) + নতুন order। Full item-editing চাইলে backend extend করতে হবে — জানাবেন।
- এখনো **storefront (`apps/web`) mock** — Ecommerce module unlock হলে swap হবে।

## ৯. Build-কৌশল বদল — UI আগে, schema/API পরে একসাথে (locked 17 Jul 2026)

মালিকের সিদ্ধান্ত: এখন থেকে **module-by-module (backend+swap) বন্ধ**। বদলে —
1. **পুরো admin panel UI আগে** বানানো হবে (mock data-তে, design-system ঠিক রেখে)।
2. তারপর **সব relation + schema + API একসাথে** ধরে ঠিক করা হবে (UI-এর আসল চাহিদা অনুযায়ী)।

**কারণ:** module আলাদা করে backend আগে বানালে UI-র চাহিদা (যেমন order item add/remove) backend ধরে না → বারবার rework। UI আগে দেখলে schema সঠিকভাবে বানানো যাবে।

**safeguard (আবশ্যক):** প্রতিটা page বানানোর সময় একটা "data requirements" নোট রাখতে হবে — page কোন field/action/relation চায় — যাতে শেষের unified schema পাস মসৃণ হয়।

**আগের backend (Product/Customer/Sales) নষ্ট নয়:** ওটাই starting point; unified পাসে adjust হবে।

### 🔒 নতুন locked requirement
- **Order edit-এ item add / remove / quantity বদলানো আবশ্যক** (মালিক নিশ্চিত করেছেন)। বর্তমান backend edit line frozen রাখে — unified পাসে backend-এ item-editing support যোগ করতে হবে (stock re-commit + refund হিসাব সহ)।

---

## ১০. Product module — sub-module কাঠামো + Funnel/Analysis (18 Jul 2026)

### ১০.১ Product Management এখন sub-module-এ ভাগ
sidebar-এ Products-এর নিচে (Offers-এর মতো sub-menu)। route + ফাইল:

| Sub-module | Route | কোথায় |
|---|---|---|
| Overview (রঙিন KPI dashboard) | `/products` | `ProductViews.tsx → ProductsOverview` |
| All products | `/products/list` | `ProductListView.tsx` |
| **Product funnel** | `/products/funnel` | `ProductFunnelViews.tsx → CatalogFunnel` |
| Variant groups | `/products/variants` | `ProductViews.tsx → VariantGroups` |
| Upgrade products | `/products/upgrades` | `ProductViews.tsx → UpgradeProducts` |
| Add-ons & services | `/products/addons` | `ProductViews.tsx → AddonsView` |
| Stock board | `/products/stock` | `ProductViews.tsx → StockBoard` |
| Price & margin | `/products/margin` | `ProductViews.tsx → MarginBoard` |
| Product health | `/products/health` | `ProductViews.tsx → HealthBoard` |
| Bulk actions | `/products/bulk` | `ProductViews.tsx → BulkActions` |
| **Product analysis** (একক) | `/products/[slug]/analysis` | `ProductFunnelViews.tsx → ProductAnalysis` |

⚠️ `/products/[slug]` dynamic — তাই উপরের static নামগুলো (list/funnel/stock…) slug হিসেবে ব্যবহার করা যাবে না।

### ১০.২ নতুন locked সিদ্ধান্ত
- **`sku` field যোগ** — `Product.sku String? @unique` (staff-এর কোড: ROSE-78, CAKE-31; ফোন-order ও packing slip-এ লাগে)। migration: `20260718121900_product_sku`। DTO + service-এ ম্যাপ করা।
- **Add-on-এর মালিকানা ভাগ (locked):** add-on **item** = সাধারণ Product (দাম/cost/stock/ছবি থাকে, শুধু flag আলাদা) → Product module। **কোন product-এ কোন add-on দেখাবে সেই নিয়ম** = merchandising → **Ecommerce module**। order হলে সাধারণ **order line** → Sales। আলাদা "Add-on module" **নয়** (নইলে Product ও Ecommerce দুই জায়গায় নকল হবে)।
- **Upgrade ≠ Add-on** — upgrade = একই product-এর premium সংস্করণ (নিজের নাম+ছবি+extra দাম, product-কে *প্রতিস্থাপন* করে); add-on = পাশে *যোগ* হওয়া আলাদা জিনিস।
- **Analytics-এর উৎস নীতি (locked):** টাকা ও order **সবসময় নিজেদের DB** থেকে — GA4 কখনো নয় (ad-blocker/consent-এ ২০–৪০% event হারায়, POS/ফোন-order GA4-এ নেই, ২৪–৪৮ ঘণ্টা দেরি)। GA4/analytics শুধু **উপরের funnel** (view / add-to-cart / checkout)। প্রতিটা সংখ্যার পাশে উৎসের tag বাধ্যতামূলক।
- GA4/Pixel-এ **আমরা কী পাঠাব** (ads conversion, catalog feed, server-side event) — আলাদা আলোচনা, এখনো হয়নি।

### ১০.৩ Funnel / Analysis — Phase 1 (হয়ে গেছে)
- **API:** `GET /products/analytics?days=30` (catalog) ও `GET /products/:id/analytics?days=30` (একক) — `OrderLine` থেকে aggregate: orders · delivered · cancelled · units · revenue · refund · margin + দৈনিক series। `views/addToCarts/checkouts` ইচ্ছাকৃত `null` (Phase 2)।
  ⚠️ controller-এ `@Get('analytics')` অবশ্যই `@Get(':id')`-এর **উপরে** থাকতে হবে।
- **Catalog funnel:** ৫ ধাপ + drop-off, leak table **"Money lost" দিয়ে সাজানো** (refund + বাতিল order + catalog গড়ে convert করলে যত টাকা বেশি আসত), "Leaks at" কলাম (View→cart / Cart→checkout / Checkout→order / Cancelled / No orders)।
- **Product analysis:** ওই product-এর funnel + তিন conversion + orders-per-day chart + নিয়ম-ভিত্তিক **"What this means"** নির্ণয়।
- **Phase 2 (বাকি):** `ProductMetricDaily` table + nightly sync job → উপরের তিন ধাপ ভরবে; পাতা বদলাতে হবে না। storefront-এ GA4 ecommerce event-এ `item_id = slug/SKU` পাঠানো **পূর্বশর্ত**।

### ১০.৪ Demo fallback প্যাটার্ন (সব নতুন screen-এ মানা হবে)
API বন্ধ বা ডেটা খালি হলে screen মরে যাবে না — demo ডেটায় চলবে, উপরে কমলা **"Demo data"** ব্যাজ।
- `_data/demoProducts.ts` — ১৬টা product (ইচ্ছাকৃত অগোছালো: draft, out-of-stock, cost-নেই, লোকসানি) যাতে Stock/Margin/Health board-এ আসল অবস্থা দেখা যায়।
- `_data/demoFunnel.ts` — demo funnel + **`demoAnalyticsFor(product, days)`**: *যেকোনো আসল product*-এর নিজের দাম/cost ধরে slug-seeded (তাই refresh-এ একই) হিসাব বানায়।
- আসল ডেটা এলে নিজে থেকেই আসল-এ ফিরে যায়।

### ১০.৫ ⚠️ CSS ফাঁদ — `.ipt` (শেখা হয়েছে, আবার যেন না হয়)
`globals.css` Tailwind-এর **পরে** লোড হয়, তাই `.ipt`-এর shorthand property Tailwind utility-কে নীরবে বাতিল করে দেয়:
- `.ipt { padding: … }` → **`pl-10` কাজ করে না** ⇒ search icon লেখার উপর বসে যেত (১০ ফাইলে ১২টা search box ভাঙা ছিল)। সমাধান: **`ipt ipt-icon`** class (globals.css-এ `.ipt-icon { padding-left: 40px }`)।
- `.ipt { width: 100% }` → **`w-[150px]` কাজ করে না** ⇒ flex row-এ ঘর চেপে যায়। সমাধান: row editor-এ **CSS grid** (fixed column) ব্যবহার করো, flex নয়।
- `h-[44px]` ও `max-w-[…]` ঠিকঠাক কাজ করে (height/max-width আলাদা property)।

### ১০.৬ Housekeeping
- `apps/admin/_removed_pricing_subpages/` মুছে ফেলা (dead code, typecheck নোংরা করছিল)। **admin এখন typecheck-clean।**
- `apps/api/.env` **রাখা হয়নি** — ওখানে `localhost` লিখলে container-এর ভেতরে ভাঙে (container-এ localhost = container নিজেই)। host থেকে migration চালাতে docker ব্যবহার করো:
  `docker compose run --rm api npx prisma migrate dev --name <নাম>`
- migration-এর পর চালু container-এ client refresh করতে হয়: `docker compose exec api npx prisma generate` → `docker compose restart api` (নইলে `db.product` undefined → 500)।
- cmd-এ ড্রাইভ বদলাতে `cd /d`, PowerShell-এ শুধু `cd`।

---

## LOCKED — storefront আচরণ: Variant vs Upgrade (19 Jul 2026)

মালিকের নির্দেশ। storefront (apps/web) PDP বানানোর সময় **অবশ্যই** মানতে হবে।

| | Variant (রঙ / flavour) | Upgrade (৫০ → ১০০ rose) |
|---|---|---|
| আসলে কী | আলাদা product, নিজের ছবি+stock | আলাদা product, নিজের full দাম |
| PDP-তে ক্লিক করলে | **অন্য product page-এ যায়** (`/products/<slug>`) — ঠিক আছে | **কোথাও যাবে না** — একই page-এ option select, দাম/ছবি/stock in-place বদলাবে, URL অপরিবর্তিত |
| এখন storefront-এ | `PdpVariants.tsx` → `VariantRow` (Link দিয়ে navigate) ✅ | **এখনো render হয় না** — বানানোর সময় নিচের নিয়ম |

**Upgrade PDP নিয়ম (যখন বানানো হবে):**
- upgrade গুলো `product.upgrades` (যেসব product-এর `upgradeOfProductId` = এই product) থেকে আসবে।
- প্রতিটা upgrade একটা **selectable option** (button/card), `<Link>`/`<a href>` নয়, `router.push` নয়।
- select করলে React state বদলাবে → দাম, বড় ছবি, stock, "customer pays" সব ওই page-এই আপডেট হবে।
- cart-এ ওই select করা upgrade product-এর id + দাম যাবে (base + extra নয় — upgrade-এর নিজের full দাম)।
- admin Upgrade screen-এর নীল box-এও এই নিয়ম লেখা আছে — দুই জায়গায় sync রাখতে হবে।

---

## ১১. Classification module — Categories DONE ✅ (19 Jul 2026)

Classification module শুরু (Categories দিয়ে)। সব browser-এ যাচাই করা।

- **Category admin screen** (`CategoriesView.tsx` + `CategoryEditor.tsx`): parent→sub tree (select/expand/reorder/active toggle/soft-delete) + full **CMS/SEO editor** (name · editable slug+preview · parent · sorting · summary · description · image/icon/banner · meta title/desc · OG title/desc/image · show-on-navbar · featured) + sticky live storefront preview। route `app/categories/page.tsx`; sidebar "Categories" সচল।
- **Schema migration `category_cms_fields`** — Category-তে ১২ field যোগ (description, summary, imageUrl, iconUrl, bannerUrl, metaTitle, metaDescription, ogTitle, ogDescription, ogImageUrl, showOnNavbar, isFeatured)। `categories.ts` DTO/service + admin `api.ts` (`ApiCategoryNode`/`CategoryWrite`/CRUD/`listCategoriesSafe`/`seedSampleCategories`) আপডেট। আসল Postgres-এ persist যাচাই করা (reload round-trip)।
  - ছবি এখনো blob preview — Media library (Composition) এলে persist।
- **Product editor আসল category-তে জোড়া** — hardcoded `CATEGORIES` সরানো; Basics-এ আসল top-level dropdown + child cascade (`topCatId`/`subCatId`), `categoryId` সরাসরি পাঠায়, edit-এ product-এর category preselect, resolve fail হলে Save আটকায় (ভুল assign রোধ)। **category পেজে বদল → product পেজে auto live।**
- **locked সিদ্ধান্ত:** এক primary category/product (single FK) + Occasion/Offer/Featured = Tag/Collection/Offers (multi-category copy করা হয়নি)। metaKeywords + Google category id বাদ। ডক: `RADIAN_CLASSIFICATION_DATA_REQUIREMENTS.md`।

**পরের ধাপ = Occasions & Tags** (backend তৈরি, শুধু frontend)। বিস্তারিত + paste-মেসেজ: **`RADIAN_NEXT_CHAT_OCCASIONS_TAGS.md`**। তারপর Brands → Units (model+API+migration লাগবে)।

---

## ১২. LOCKED — code-first workflow (20 July 2026)

মালিকের সিদ্ধান্ত। **আগের "visual-first: আগে HTML mockup → approve → তারপর কোড" নিয়ম বাতিল।** এখন থেকে সব admin module এভাবে হবে:

1. **আলাদা HTML mockup ফাইল বানানো হবে না।** সরাসরি আসল admin app-এ (`apps/admin`, :3001) কোড তোলা হবে।
2. ছোট করে scope + প্রয়োজনীয় core rule align করে **সরাসরি working code** তোলো (mock/demo data-তে চলবে)।
3. মালিক **localhost:3001-এ browser-এ live দেখে review করবেন** — ওখানেই। তারপর review অনুযায়ী **একসাথে iterate/fix**।
4. এক ধাপ working করে দেখাও → live review → fix → পরের ধাপ।

**কারণ:** স্ট্যাটিক HTML mockup আসল app-এর মতো আচরণ করে না; আসল কোড localhost-এ চালিয়ে দেখলে review সঠিক ও দ্রুত হয়, দুইবার কাজ (mockup + আবার কোড) লাগে না।

**অপরিবর্তিত:** design-system, brand token, UI convention (§2, §4-এর DESIGN RULE), demo-fallback + "Demo data" badge, "সাদা-ফাঁকা screen নয় — রঙিন decision-first" — সব একই থাকবে। শুধু **কীভাবে দেখানো হবে** সেটা বদলালো (mockup নয়, live code)।

> §6-এর "visual-first" লাইন এই নিয়মে আপডেট করা হয়েছে। কোনো নতুন chat যেন আবার আলাদা HTML mockup না বানায়।

---

## ১৪. Inventory module — ধাপ ১–২ BUILT (22 Jul 2026 রাত)

Architecture locked + doc: **`RADIAN_INVENTORY_MODULE_ARCHITECTURE.md`** (DEC-INV-001…015)।
Q&A-তে মালিকের ১১টা রায় লক (GIFT আলাদা reason · settings-driven sale warehouse ·
এক-ধাপ transfer · manual opening (backfill নয়) · ফুলে expiry নেই, `trackExpiry` flag ·
stocktake session · negative allow+warn · দোকান+স্টোররুম seed)।

**বানানো হয়েছে:**
- Schema: Warehouse · InventoryStock · InventoryMovement (immutable ledger) ·
  StockTransfer(+lines) · StockIssue(+lines, WASTAGE|GIFT) · Stocktake(+lines) ·
  ItemExpiryLot · InventorySetting + `Item.trackExpiry`। soft-delete extension-এর
  NO_SOFT_DELETE তালিকায় নতুন immutable/derived model গুলো যোগ।
- API: `apps/api/src/inventory/*` — postMovements এক transaction (ledger+balance+lots),
  overview/stock/movements/opening/transfers/issues/adjustments/stocktakes/reports/settings।
- Admin: sidebar **Inventory** (Operations) + `/inventory` Overview + `/inventory/stock` +
  `/inventory/movements` — demo-fallback + "Demo data" ব্যাজ নিয়মমতো।
- `radian_inventory_migrate.bat` + `prisma/seed-inventory.js` (দোকান+স্টোররুম+settings)।

**২য় iteration (22 Jul আরো রাতে, মালিকের review-এর পর):** (১) UI-র সব বাংলা text সরানো —
**UI English-only নিয়ম আবার ভাঙা যাবে না** (seed warehouse নামও এখন Shop/Storeroom);
(২) action স্ক্রিন যোগ: `/inventory/opening` (item-by-item গণনা entry) ·
`/inventory/transfer` (one-step form + history) · `/inventory/issue` (Wastage|Gift entry +
history + মাসিক টাকার total) · Stock board-এ প্রতি row **Adjust** modal (counted qty →
auto delta)। Biznify-র ধাঁচ: form উপরে, history একই পাতায় নিচে।

**৩য় iteration (একই রাতে):** `/inventory/reports` (দৈনিক wastage/gift stacked bar + hover
tooltip · "Where the money sits" top-10 valuation) + `/inventory/settings` (default sale/receive
warehouse · per-order toggle · negative policy — সব live PATCH)। Audit-এ ৩টা fix:
(১) **BLOCK policy এখন সত্যিই enforce** — postMovements-এ balance<0 হলে 400 (আগে UI-তে
option থাকত, service মানত না); (২) Opening-এ এক submission-এ duplicate item×warehouse
guard; (৩) Issue history-র মাসিক total filter-tab-এ ভুল দেখাত।

**৪র্থ iteration (একই রাতে) — module সম্পূর্ণ:**
- **Stocktake স্ক্রিন** (`/inventory/stocktake`): warehouse বেছে Start counting → সব countable
  item ledger সংখ্যাসহ, blank = গোনা হয়নি (শূন্য নয়), live diff qty+টাকা → Save (DRAFT) →
  Apply (এক ক্লিকে সব ADJUSTMENT, session immutable)।
- **Purchase hook (DEC-PUR-002 consumer):** receive → `InventoryService.postPurchaseReceipt`
  (PURCHASE movement, unit conversion factorSnapshot→item-unit) + **সত্যিকারের moving AVCO**
  (DEC-INV-013): `newAvg=(হাতের×গড়+কেনা×দর)÷মোট`, হাতে ≤0 হলে কেনা দর; AUTO item বাদ
  (DEC-ITM-008)। Return → PURCHASE_RETURN out। **Fail-soft:** inventory post ব্যর্থ হলে receive
  বহাল থাকে, purchase timeline-এ ⚠ ওঠে। পুরোনো phase-1 গড় fallback হিসেবে রাখা।
- **DEC-MOD-003 repoint stage 1 (DEC-INV-015):** Delivery "preparing" → legacy `Product.stockQty`
  লেখা **অপরিবর্তিত** + পাশাপাশি Inventory-তে SALE mirror (assemblyMode branch: MTO হলে recipe-র
  component কাটে)। Cancel-এ readymade line-এর revert-ও mirror হয় (crafted-এর component
  খরচ হয়ে গেছে — ফেরে না)। Fail-soft: mirror ব্যর্থ = order timeline-এ ⚠, order কখনো আটকায় না।
  Stage 3 flip (legacy বন্ধ) মালিকের live যাচাইয়ের পরে।
- **`itemStockLabel()` LIVE:** Items list-এর Stock কলাম + Item editor এখন `/inventory/stock` /
  `/inventory/item-stock/:id` থেকে আসল সংখ্যা — MTO-তে "can build N"। Inventory না থাকলে আগের "—"।

⚠️ Purchase migrate bat আগে না চালানো থাকলে inventory bat একাই সব টেবিল বানাবে (diff)।
**বাকি (মালিকের যাচাইয়ের পর):** DEC-INV-015 stage 3 flip → `Product.stockQty` derived → drop।

---

## ১৩. Units module — DONE ✅ (21 Jul 2026)

Master Data-র শেষ ধাপ। **নতুন model + migration + `/units` API + admin screen** সব বানানো হয়েছে।
বিস্তারিত + Item chat-এর জন্য handover: **`RADIAN_UOM_OWNERSHIP_RULING.md`**।

### ১৩.১ locked সিদ্ধান্ত (DEC-PRD-009)
- **Unit-এ conversion থাকে** — `baseUnitId` + `baseQty`। এক unit বলে দেয় সে কোন ছোট unit-এ ভাঙে:
  `Lily Stick → 4 Papri` · `Lily Bunch → 10 Lily Stick` (⇒ ৪০ papri, চেইন নিজে resolve হয়) · `Kg → 1000 Gram`।
- **তাই নাম নির্দিষ্ট হতে হবে** — "Lily Stick", শুধু "Stick" নয় (gypsy stick = ২ papri, ৪ নয়)।
  মালিক জেনেশুনে এই দাম দিয়েছেন: তালিকা catalogue-এর সাথে বাড়বে, নতুন ফুলে নতুন unit বানানো মনে রাখতে হবে,
  আর unit-এর সাথে ফুলের কোনো বাঁধন নেই — তাই ভুল unit বাছা ঠেকানো যায় না।
  উপশম: row-তে **Duplicate** বাটন + "generic name" সতর্কতা।
- **পরিমাণ কখনো নামে নয়** — "Bunch of 12" ভুল; নাম "Lily Bunch", ১২ যাবে `baseQty`-তে।
- `baseQty` পূর্ণসংখ্যা ≥ ১ (ভগ্নাংশ লাগলে ছোট unit-কে base করো) · লুপ আটকায় · লুপ কোনোভাবে হলে
  সংখ্যা না দেখিয়ে **"Chain broken"** দেখায় (ভুল factor চুপচাপ stock নষ্ট করে)।
- **Delete চার দিক থেকে আটকায়** — derived Unit · Item · recipe line (`ItemComponent.unitId`) · Product।
  প্রতিটার আলাদা বার্তা। ⚠ recipe line-এর guard প্রথমে বাদ পড়েছিল → dangling FK হতো।
- conversion বদলালে confirm + audit-এ **⚠** লেখা entry।

### ১৩.২ ফাইল
| কী | কোথায় |
|---|---|
| model | `schema.prisma → model Unit` (+ `Product.unitId?`) |
| API | `apps/api/src/catalog/units.ts` — CRUD + `GET /units/:id/usage` |
| screen | `_components/UnitsView.tsx` |
| route | `app/items/units/page.tsx` (`/units` → redirect) |
| client | `_data/api.ts` unit block · `_data/unitDemo.ts` |
| nav | sidebar **Items → Units** (top-level entry নেই — দুবার দেখাত) |

### ১৩.৩ UI সিদ্ধান্ত (review-এ শেখা)
- **তালিকা তালিকার মতো** — সব ঘর input বাক্স করলে ফর্মের মতো দেখায়, পড়া যায় না। এখন সাধারণ লেখা,
  বদলাতে পেন্সিল → dialog। Add · Edit · Duplicate **একই dialog**।
- **native `<select>` / `<datalist>` ব্যবহার নয়** — ব্রাউজারের নিজস্ব স্টাইল (নীল হাইলাইট, ছোট ফন্ট)
  design-এর সাথে মেলে না। নিজস্ব `UnitPicker` — টাইপ করে ছাঁকা, ↑↓/Enter, প্রতি সারিতে code + conversion,
  আর যা নেই তা লিখলে **"Create «name»"**।
- **"Used by" সংখ্যা ক্লিকযোগ্য** → drawer-এ আসল তালিকা + bulk move। শুধু সংখ্যা দেখিয়ে "সরাও" বলা অচল নির্দেশ।
  সরানো হয় **প্রতিটার নিজের module-এর endpoint** দিয়ে (`/items/:id`, `/products/:id`) — Units screen
  অন্য module-এর row নিজে লেখে না।
- move-এর পর **সংখ্যা রূপান্তরিত হয় না** (২০০ papri → ২০০ kg) — drawer-এ স্পষ্ট সতর্কতা।

### ১৩.৪ ⚠ পরিবেশগত ফাঁদ (এক ঘণ্টা নষ্ট হয়েছে)
- API container **compiled `dist/`** চালায়, live source নয় → backend বদলালে **`docker compose up -d --build api`**
  লাগবেই। নইলে পুরনো route চলতে থাকে (`/units/:id/usage` → 404)।
- PowerShell-এ `cd /d` **চলে না** (ওটা cmd-এর) — শুধু `cd D:\radian`।
- দুই chat একসাথে `schema.prisma` সম্পাদনা করলে schema ভাঙে (২১ জুলাই দুবার হয়েছে) —
  একসাথে migration চালিও না।

### ১৩.৫ বাকি (Units-এর নয়, পরের ধাপ)
- `OrderLine`-এ `unitId` + **factor snapshot** (Sales) — পরে `baseQty` বদলালে পুরনো order যেন নতুন অর্থ না নেয়
- এক Product-কে একাধিক unit-এ বিক্রি → `ProductUnitPrice` (দাম মাত্র, factor নয়)
- PDP unit selector — **Upgrade pattern**, Variant নয় (একই পাতায় দাম বদলাবে, navigate করবে না)। Ecommerce locked নয়।
- stock-এর মালিক Item না Product — মালিক Item বলেছেন, কিন্তু `DEC-ITM-005` এখনো Product.stockQty রেখেছে

## ১৫. Assembly module v2 — BUILT ✅ + DB reset (23 Jul 2026)

**Architecture:** `RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md` **§V2** (DEC-ASM-011…016) —
Biznify Manufacturing audit-এর পর মালিকের নিজের flow: **Templates** (standalone, নাম+ছবি+উপকরণ,
stock ছোঁয় না) → **Production pipeline** (৩-ধাপ wizard: template+pieces → assign+start/end time →
already-made হলে materials+wastage; শুরুতে stock check warn-never-block, component Shop→**Assembly
floor** warehouse-এ TRANSFER) → Finish (used+wasted, wasted=আসল WASTAGE StockIssue, leftover
auto-return) → **Finished goods** → Transfer-এ মালিক finished Item বাছেন → stock ঢোকে আসল খরচে।
প্রতি production-এ ৪-card **stage timeline** (কে/কখন শুরু-শেষ/কোন item কয়টা নষ্ট টাকাসহ/কোথায় গেল)।
Overview-তে byActor (কে কয়টা, গড় মিনিট) · Wastage report · Settings। Item picker সব জায়গায়
Purchase-এর full-screen photo picker (এখন shared, `single` mode-ও আছে)।

**Routes:** `/assembly` · templates · pipeline · finished · wastage · settings (v1 রুটগুলো redirect)।
**API:** `/assembly/*`; সব stock লেখা `InventoryService.postAssemblyPick/Finish/Transfer/Return` দিয়ে
(INV-RULE-001)। Schema: `AssemblyTemplate(+Line)` · `AssemblyProduction(+Line)` · `ProductionStatus` ·
MovementReason += ASSEMBLY/UNBUILD · InventorySetting += ৩ কলাম। Floor warehouse (code `ASSEMBLY`)
প্রথম ব্যবহারে নিজে তৈরি হয়।

**⚠ DB RESET হয়েছে (মালিকের অনুমোদনে):** পুরনো chat-গুলোর Item/Purchase/Inventory টেবিল migration
ফাইল ছাড়া ছিল (drift) → `radian_db_reset_assembly.bat`: reset + এক catch-up migration
(`assembly_v2_full`) + rebuild। পুরনো test data মুছে গেছে। Starter seed API দিয়ে ঢোকানো: ৪ unit,
৫ component item + "Romantic Bouquet" (MAKE_TO_STOCK), Shop-এ opening stock।

**⚠ পরিবেশ শেখা:** API container এখন `nest start --watch` চালায় কিন্তু **source image-এ baked** —
host-এ code বদলালে `docker compose up -d --build api` লাগবেই। Container-এর TS পুরনো untyped
`const x = []` গুলোয় never[] error দেয় — inventory.service-এ explicit type বসানো হয়েছে (১৮ error fix)।

**Live যাচাই ✅ (23 Jul, মালিকের রায়ে Claude-এর হাতে delegated):** full cycle চালানো হয়েছে —
template → ২ পিস produce → finish (১ গোলাপ wastage-সহ) → transfer; component deltas, WASTAGE
entry, আর finished-goods movement-এর আসল খরচ (৪২২.৫০×২=৳৮৪৫) সব অঙ্কে মিলেছে।
**যাচাইয়ে ধরা 🔴 bug + fix:** transfer ledger-এ আসল খরচ লিখলেও `Item.standardCostPaisa`
আপডেট করত না → বানানো জিনিসের cost ৳0 (stock board value ০, margin board-ও ভুল)। Fix:
Purchase receive-এর DEC-PUR-005 moving-average ছাঁচেই transfer-এর পর Item-এর cost আপডেট
(ItemsService দিয়ে, AUTO বাদ, fail-soft) — পুনঃযাচাইয়ে cost ৳430 উঠেছে, board value মিলেছে।
মালিকের নীতি (23 Jul): **Claude-এর যাচাই = যাচাই; সমস্যা পড়লে মালিক জানাবেন।**
Deferred (trigger লেখা): dismantle/un-build (দরকার পড়লে) · deadline+partial % (কয়েকদিনের কাজ এলে) ·
team master (Employee module) · approval (Roles & Permissions) · DEC-ASM registration (architecture project)।

---

## ১৬. Supplier module — BUILT ✅ + review-fixed (23 Jul 2026)

**Architecture:** `RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md` (DEC-SUP-001…009, SUP-R01…R12)।
এক টেবিল `Supplier` + admin-configurable `SupplierType` (label-vs-behaviour: `isFulfillment`) —
**দুই workspace, এক data**: `/suppliers` (product supplier-দের বই) · `/suppliers/vendors`
(fulfillment vendor-দের কার্ড board: products · lead time · notify · due)। Vendor-দাম =
`Item.standardCostPaisa` (দ্বিতীয় কলাম ইচ্ছা করেই নেই)।

**Core flows:** profile (শুধু name+type required, phone duplicate-warn) · opening due (একবার,
পরে শুধু adjustment — SUP-R04) · supplier-level payment: পুরনো-আগে auto split + hand-adjust,
প্রতি ভাগে আসল `PurchasePayment` (SUP-R05/06), বাড়তি → `SupplierCredit` · **credit apply
(SUP-R11)**: negative adjustment-এ due কাটে, remainder নতুন credit · ledger (opening ·
কেনা · payment · return · adjustment + মাস-সারাংশ) · manual WhatsApp/SMS order message
(customer info কখনো নয় — SUP-R07) · Settings-এ type master + unlinked-names link tool।

**FK গুলো:** `Purchase.supplierId` (+exact-name auto-link, INACTIVE block) ·
`SupplierCredit.supplierId` · `Item.supplierId` (DEC-SUP-004) — সব additive।
Purchase new form-এ Supplier QuickSelect (inline create), Item form-এ Supplier field।

**Review pass (একই দিন):** ৭ ফাঁক ধরা-সারা — credit-consume পথ ছিলই না (SUP-R11) ·
INACTIVE-এর টাকা board থেকে লুকাত (SUP-R12) · INACTIVE-কে নতুন purchase · allocation
ceiling per-target যোগে · credit-ওয়ালা delete block · vendor edit-এ ভুল form-চেহারা · গোনাগুনতি।

**Migrations:** `supplier_module` · `supplier_vendor_split` · `supplier_credit_applied`।
**⚠ পরিবেশ-শিক্ষা:** compose-এর anonymous `/app/node_modules` volume rebuild-করা image-এর
নতুন prisma client ঢেকে দেয় — **প্রতি schema বদলে `docker compose exec api npx prisma
generate` + `restart api` লাগবেই** (bat-এ ধাপ রাখো; `radian_supplier_vendor_fix.bat` উদাহরণ)।

**বাকি:** মালিকের হাতে live যাচাই · F11 (stock-skip বিক্রি + auto-notify + vendor order
history — Sales পাস) · Finance পরে SupplierPayment event consume করবে · ৫০+ supplier হলে
list-এর balance N+1 এক পাসে সারতে হবে · test data (Kamal Mama-র ৳400 credit, Cake Bhai) মুছে নেওয়া।

---

## ১৬. Supplier module — BUILT ✅ (23 Jul 2026, owner-verify pending)

**Architecture:** `RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md` (DEC-SUP-001…008) — মালিক kickoff চ্যাটে লক করেছেন।
এক টেবিল `Supplier` + admin-configurable `SupplierType` (seed: **Product Supplier** · **Fulfillment Vendor** —
মালিকের দুই ধরন: stock-এ কেনা + cake-জাতীয় per-order sourcing)। Required শুধু name+type (SUP-R01);
phone duplicate = warn-not-block। Opening due এক অঙ্কে, একবার বসলে lock — সংশোধন `SupplierAdjustment` দিয়ে (SUP-R04)।

**Payment (DEC-SUP-006):** supplier-পাতা থেকে এক অঙ্ক → auto split পুরনো-আগে (opening → oldest bill),
confirm screen-এ হাতে বদলানো যায়, প্রতি bill-allocation আসল `PurchasePayment` লেখে (per-bill খাতা অটুট),
বাড়তি → `SupplierCredit` (টাকা ফেরে না)। `SPY-` sequential।

**FKs (DEC-SUP-004/007, additive):** `Purchase.supplierId` + `SupplierCredit.supplierId` + `Item.supplierId`।
Purchase new form এখন Supplier QuickSelect (inline create, নাম snapshot থাকে)। Item form-এ Supplier picker।
Settings-এ unlinked free-text নাম → supplier link tool।

**Notify hooks (DEC-SUP-003):** notifyPhone/channel(WhatsApp/SMS/OFF)/mode(MANUAL এখন)/leadTimeHours;
supplier-পাতা থেকে manual wa.me/sms composer — message-এ শুধু product+qty+ready-by, customer info কখনো নয় (SUP-R07)।
AUTO send + stock-skip sell flow = **PENDING F11** (Sales/Automation পাসে)।

**Routes:** `/suppliers` (due board — শূন্য-due-ও দেখায়, "With due only" toggle) · list · new · `[id]` (ledger/items/credits/timeline + Pay/Adjust) · settings।
**API:** `/suppliers/*` (static above `:id`)। Migration: `20260723054753_supplier_module` — applied, rebuild ✅ (`radian_supplier_migrate.bat`)।

**যাচাই হয়েছে (Claude, browser-এ):** supplier create (SUP-000001, opening due ৳5,000) → Pay ৳6,000 bKash →
split confirm → due ৳0 + credit ৳1,000 + ledger ঠিক। দুই tsc typecheck সবুজ। **Test data DB-তে আছে (Kamal Uddin)** —
মালিক review শেষে মুছতে বললে মুছে দেওয়া হবে।

**বাকি:** মালিকের feedback + approval · split-row-এর বাঁ-পাশের label ছোট cosmetic check ·
Purchase দিয়ে কেনা → supplier ledger-এ ওঠা live যাচাই।

### ১৬.১ Vendor workspace split — BUILT ✅ (23 Jul 2026, একই দিনে)

**মালিকের রায়:** vendor-দের layer বেশি, আলাদা জায়গা চাই — তবে **data ভাগ হয়নি, UI ভাগ হয়েছে**
(DEC-SUP-009)। এক `Supplier` টেবিলই; `SupplierType.isFulfillment` behaviour flag (label-vs-behaviour,
DEC-ITM-017 ধাঁচ; system type-এর behaviour lock, নতুন type বানানোর সময় checkbox)।

**যা হলো:** `/suppliers` = শুধু product supplier-দের বই + vendor workspace-এর দরজা-card ·
`/suppliers/vendors` = vendor board (card-প্রতি: products count · lead time · notify badge · due) ·
`/suppliers/vendors/new` = vendor-দরজার form (Fulfillment type pre-picked, notify/lead-time card আগে) ·
detail-এ vendor হলে **Products panel**: vendor price · selling · margin। **Vendor price = `Item.standardCostPaisa`**
— আলাদা vendorPrice column ইচ্ছা করেই নেই (এক দাম, এক মালিক)। Order history per vendor = F11 (Sales link লাগবে)।

**Migration:** `supplier_vendor_split` (এক additive কলাম)। **⚠ পরিবেশ-শিক্ষা (নতুন):** compose-এর
anonymous volume (`/app/node_modules`) rebuild-এর নতুন prisma client ঢেকে দেয় — rebuild-এর পর
**`docker compose exec api npx prisma generate` + restart লাগবেই** (`radian_supplier_vendor_fix.bat`;
ভবিষ্যতের সব api-rebuild bat-এ এই ধাপ রাখো)। যাচাই: vendor "Cake Factory BD" (SUP-000002) browser-এ
তৈরি → board/Overview দুই পাশে ঠিক ভাগ। দুই tsc সবুজ। Test data: Kamal Uddin (SUP-000001) + Cake Factory BD।

---

## ১৭. Returns & Refunds module — BUILT ✅ + review-fixed (23 Jul 2026)

**Architecture:** `RADIAN_RETURNS_MODULE_ARCHITECTURE.md` (DEC-RTN-005…015)। Commerce-এর
locked চতুর্থ ও শেষ module — চেইন Sales → Pricing & Offers → POS → **Returns** সম্পূর্ণ।
Delivery-র **পরে** ফেরত (delivery-র আগে = Cancel, Sales-এর)। Owns Return/Refund entity
(DEC-RTN-001..004, Sales SM-RULE-007 retired)।

**Entities:** `SalesReturn` (RTN-NNNNNN) · `SalesReturnLine` · `ReturnReason` (admin master) ·
`CustomerCredit` (store-credit wallet ledger) · `ReturnSetting` (singleton)। Additive relation:
`Order.returns` · `OrderLine.returnLines` · `Customer.returns/credits`। enum `PaymentMethod += bank`।

**Locked নিয়ম (কোডে enforce):** staff-initiated only · refund payout **কখনো collected-এর বেশি নয়**
(cash + store credit + একাধিক return মিলিয়ে cap) · restock একমাত্র `InventoryService.postSaleReturn`
(`SALE_RETURN`, +stock, fail-soft, INV-RULE-001) · **`Order.salesStatus` কখনো ছোঁয় না** (নিজের
document, order page-এ badge/timeline) · approval gate = reason-flag / crafted-perishable / টাকার
threshold · sequential `RTN-` (D8 শিক্ষা) · resolution: REFUND / REPLACEMENT / PARTIAL_COMPENSATION /
STORE_CREDIT (Exchange পরে) · per-line RESTOCK vs WRITE_OFF (crafted default write-off)।

**Routes (`apps/admin/app/returns`):** `/returns` (Overview+list, server-side analytics) ·
`/returns/new` (delivered order → line/qty/restock বাছাই → resolution) · `/returns/[id]`
(approve/reject/complete/cancel + timeline + টাকার হিসাব + গ্রাহকের store-credit balance) ·
`/returns/settings` (reason master + window + threshold)। **API:** `/returns/*` (static above `:id`)।
Sidebar-এ "Returns & Refunds" (Commerce)। admin tsc **০ error**।

**Review pass (একই দিন, architecture-review):** ৩ gap ধরা-সারা —
**REV-RTN-1 🔴** store credit refund-cap-এ গোনা হচ্ছিল না (একই order-এ credit+cash = দ্বিগুণ payout সম্ভব ছিল) →
এখন prior store-credit + refund দুটোই cap-এ বাদ · **REV-RTN-2 🔴** demo `RTN-D` row থাকলে `nextReturnNo`
NaN দিত (numbering ভেঙে যেত) → শুধু `^RTN-\d+$` থেকে max, self-healing · **REV-RTN-3 🟠** return
এখন Order-এর timeline-এও event ফেলে। বিস্তারিত architecture doc §8a।

**Migrations:** `returns_module` (additive)। **bat:** `radian_returns_migrate.bat` (schema+rebuild) ·
`radian_returns_seed.bat` (5 reason + 4 demo return: pending/approved/refunded/store-credit) ·
`radian_returns_fix.bat` (review-fix code-only rebuild — schema বদলায়নি)।
**⚠ পরিবেশ-শিক্ষা বহাল:** api rebuild-এর পর container-এ `prisma generate` + restart লাগবেই (§১৬)।

**Live-verified ✅ (23 Jul, Claude in-browser):** migration applied · `radian_returns_migrate.bat` +
`radian_returns_fix.bat` (REV-RTN-4 soft-delete singleton fix) + `radian_returns_seed.bat` চলেছে ·
সব `/returns/*` endpoint ঠিক JSON · admin `/returns`-এ ৪টা demo return (pending/approved/refunded/store-credit)
সঠিক KPI+টাকাসহ রেন্ডার হচ্ছে। **REV-RTN-4 🔴:** ReturnSetting singleton `NO_SOFT_DELETE` set-এ ছিল না →
`/returns/settings` 500 → soft-delete.extension-এ যোগ করে সারানো (code-only)। seed-orders.js খালি-DB-তে
demo product bootstrap করে (reset-পরবর্তী)। **পরিবেশ:** api container-এ file-watch polling নেই — code বদলালে `docker compose restart api` লাগে (নতুন `radian_api_restart.bat`)।

**বাকি:** F1 stock-flip (deduction একমাত্র Inventory) POS/Sales পাসে ·
POS counter cash-return + Exchange resolution + store-credit checkout-এ consume + gateway auto-refund + Roles approval-gate — সব পরের পাস (architecture doc §8 non-goals)।

---

## ১৮. Pricing & Offers module — BUILT ✅ (23 Jul 2026, migration pending)

**Architecture:** `RADIAN_OFFERS_MODULE_ARCHITECTURE.md` (DEC-OFR-001…009) — মালিক kickoff-এ
৪ রায় লক করেছেন: **Core-6 shape** (SITEWIDE·CATEGORY·PRODUCT·FIRST_ORDER·PAYMENT·FREE_DELIVERY;
bundle/tiered/gift/BOGO/corporate পরের পাস) · **stacking = ১ automatic + ১ coupon** (দুটোই
combinable হলে; নইলে বড়টা) · **approval gate = below-cost বা ≥ threshold %** (default 25%,
settings-এ; যেকোনো staff approve, নাম audit — Returns ধাঁচ) · **apply point = admin order +
quote API** (POS বাদ — negotiable locked; storefront W3-তে একই API খাবে)।

**Schema:** `Offer` (OFR-NNNNNN sequential, coupon=mechanism, code unique uppercase,
PERCENT=bp/FLAT=paisa, min-spend/max-cap/limits, category FK + product m2m + paymentMethod
targeting, combinable/priority/scarcity-cosmetic, startsAt/endsAt — **liveState derived,
কোনো cron নেই** DEC-OFR-006) · `OfferRedemption` (order-প্রতি applied offer-প্রতি এক row;
cancel-এ soft-delete → limit slot ফেরে DEC-OFR-008) · `OfferSetting` ("singleton" id —
PosSetting-এর cuid ভুল আর নয়; **NO_SOFT_DELETE-এ যোগ করা** — REV-RTN-4 শিক্ষা আগেই)।
Back-relations: Category.offers · Product.offers · Order.redemptions · Customer.offerRedemptions।

**API (`/offers/*`, static above `:id`):** list/analytics/approvals/settings(GET+PATCH)/
**quote(POST)**/create/:id/timeline/redemptions/PATCH/approve/decline/pause/resume/archive/DELETE।
**Quote engine** (OFR-R01…R10): eligibility (window·minSpend·shape target·first-order·
payment·per-customer+total limit) → best auto + typed coupon → stacking → cap। **Below-cost
detection** সেভের সময় (perishable allowed তাই gate, block নয়)। Analytics server-side
(D1 শিক্ষা)। Orders integration: `POST /orders` এ engine re-quote (client preview কখনো
বিশ্বাস নয়), couponCode fail → hard 400, redemption rows fail-soft; cancel-এ release।

**Admin:** নতুন `OffersLive.tsx` — list (KPI + pause/resume/duplicate/live-state chips) ·
**Core-6 editor** (আসল category dropdown + product search picker + datetime schedule +
Submit-vs-draft + approval banner + live storefront preview) · approvals queue (approve/
decline→draft, নাম prompt) · settings (threshold % + default combinable, live PATCH) ·
overview (server analytics + leaderboard) · coupons (একই engine-এর code-slice)। সব demo-fallback
+ কমলা Demo badge। পুরনো mock (`OffersView.tsx` ইত্যাদি) রয়ে গেছে deferred shape-দের রেফারেন্স
হিসেবে; route গুলো এখন Live-এ। `/offers/perf/[id]` detail এখনো mock (analytics detail পরে)।
**NewOrderForm:** coupon box + debounced live quote preview (applied offers সবুজ লাইনে,
couponError লাল), createOrder-এ couponCode যায়। admin tsc **০ error**।

**চালাতে (মালিক):** `radian_offers_migrate.bat` double-click (migrate `offers_module` +
rebuild + container-এ prisma generate + restart)। তারপর `/offers`-এ live review।

**Live-verified ✅ (23 Jul, Claude — মালিকের নীতি: Claude-এর যাচাই = যাচাই):**
migration+rebuild চলেছে (`radian_offers_migrate.bat`) · `/offers` + `/offers/settings` ঠিক JSON ·
browser-এ OFR-000001 "Test Coupon 10%" (TEST10) তৈরি → ২৫%-এর নিচে বলে সরাসরি **active** ·
New Order form-এ TEST10 → `−৳250`, Total ৳2,500−250+150=**৳2,400** (অঙ্ক নিখুঁত) · WRONG99 →
লাল "does not exist", discount বাদ · API-তে ৩০% offer → **pending_approval** → queue → approve
(approvedBy stamped) → active → pause সব ঠিক · আসল order RAD-56927-এ TEST10 → discount+
redemption row → **cancel-এ redemption released** (count 0, DEC-OFR-008 ✓)।
**Test data:** TEST10 (OFR-000001) active রাখা — মালিকের practice-এর জন্য; Deep-30% archived;
RAD-56927 cancelled (audit trail)। মুছতে বললে মুছে দেওয়া হবে।

**বাকি:** deferred shapes (§8 non-goals) · PosDiscountRule ownership transfer ·
storefront W3 (একই quote API) · perf/[id] আসল analytics · OrderEditForm-এ coupon বদলানো
(এখন শুধু create-এ)।

---

## ১৯. Delivery Management module — BUILT ✅ (23 Jul 2026, migration pending)

**Architecture:** `RADIAN_DELIVERY_MODULE_ARCHITECTURE.md` (DEC-DLV-001…006, DLV-R01…R08) —
মালিক kickoff-এ ৪ রায় লক: **v1 = Core 4 + proof photo** (board · rider · courier · method/slot
master · আসল ছবি upload; tracking/performance/analytics পরে) · **method FK + snapshot**
(DEC-DLV-002: `Order.deliveryMethodId/deliverySlotId` FK, `methodLabel`/fee snapshot অটুট) ·
**DeliveryAssignment entity** (এক order-এ একটাই active; fail-এ retry = নতুন assignment,
আগেরটা history) · **নিজস্ব Rider master** (Employee module পরে adopt — DEC-INV-014 ধাঁচ)।

**Schema:** `DeliveryMethod`(+`DeliverySlot` — capacity warn-never-block DLV-R05) · `Rider` ·
`CourierService` (P2 — hardcoded COURIERS-এর বদল, trackingUrlTemplate `{cn}`) ·
`DeliveryAssignment` (DLV-NNNNNN sequential)। Order-এ additive FK দুটো + `assignments`।

**API (`/delivery/*`):** board · config (order form/storefront মেনু; প্রথম call-এ storefront-এর
পুরনো static মেনু seed) · slot-load · riders/couriers/methods/slots CRUD · assignments
(POST + out/delivered/fail/cancel + per-order history)। **DEC-DLV-006 — সব transition
OrdersService দিয়ে** (COD-collect · LTV mirror · stock rule এক জায়গাতেই থাকে; `OrdersModule`
এখন `OrdersService` export করে, একমুখী dependency — cycle নেই)। Courier assign পুরনো
`Order.courierName/consignment/trackingUrl` field-ও stamp করে (আগের screen বাঁচে)।

**Admin (`DeliveryLive.tsx`):** `/delivery` = **fulfilment board** (৪ কলাম pipeline: Needs
assignment → Preparing → Out → Failed-retry; card-এ COD due · photo count · carrier chip;
inline assign modal rider/courier + consignment; Out/Delivered/Fail বোতাম আসল transition
চালায়) · `/delivery/riders` (আজকের assigned/out/done/failed গোনাসহ) · `/delivery/couriers` ·
`/delivery/zones` = method & slot master editor · `/delivery/proof` = order খুঁজে PREP/DELIVERY
ছবি upload (client-এ ৯০০px-এ downscale → JPEG data-URL → বিদ্যমান `POST /orders/:id/photos`,
DLV-R08)। Sidebar-এ ৫টা নতুন link। বাকি delivery page গুলো (setup/tracking/performance…) demo।
**NewOrderForm:** method/slot এখন `/delivery/config` থেকে (static METHODS fallback);
create-এ `deliveryMethodId`+`deliverySlotId` FK যায়। admin tsc **০ error**।

**চালাতে (মালিক):** `radian_delivery_migrate.bat` double-click → তারপর `/delivery`।

**Live-verified ✅ (23 Jul, Claude — মালিকের নীতি: Claude-এর যাচাই = যাচাই):**
migration+rebuild চলেছে · `/delivery/config` (৪ method seeded, Same Day-তে ৩ slot) ·
`/delivery/couriers` (Steadfast·Pathao·RedX seeded, tracking template সহ) · board (৫ demo order,
POS বাদ) সব ঠিক JSON। **Full cycle (RAD-D005):** assign DLV-000001 → out → delivered →
order **completed/delivered**, Customer **LTV ০→৳2,760 · ordersCount ০→১** (DEC-DLV-006
OrdersService দিয়ে গেছে — rule duplicate হয়নি) · **DLV-R01 re-assign:** courier→rider বদলে
আগেরটা CANCELLED, active=1, tracking `{cn}`→SF999 replace ঠিক · **guard যাচাই:** stock-শূন্য
order-এ prepare→400 "not enough stock", তারপর out→400 "must be preparing" (assignment status
এগোয়নি — desync নেই) · **fail:** reason record + inactive, retry=নতুন assignment · **board UI:**
৪ কলাম pipeline, carrier chip + COD due + photo count সব রেন্ডার।
**Test data:** RAD-D005 delivered, "Karim Rider", RAD-D004/D012-এ demo assignment — সব demo,
মালিক reset করতে পারেন।

**বাকি:** P1 courier API · slot-capacity warn UI (load endpoint আছে, form-এ দেখানো বাকি) ·
D12 multi-shipment · tracking/performance page live · Employee adopt।

---

## ২০. Pricing & Offers + Delivery — self-review fixes (23 Jul 2026)

architecture-review pass — কোনো 🔴 নেই; ৩টা আসল ফাঁক ধরা-সারা (কোড-only, schema অটুট):

- **REV-OFR-1 🟠 (redemption atomicity):** order create-এ redemption আগে fail-soft ছিল
  (order-এর পরে আলাদা)। discount total-এ বসে যেত কিন্তু record fail করলে limit/first-order
  guard bypass + analytics কম গুনত। **fix:** order.create + সব `OfferRedemption` এখন **একই
  `$transaction`-এ** — atomic।
- **REV-OFR-2 🟠 (edit-এ offer stale):** order edit-এ item add/remove/qty বদলালে
  `recomputeMoney` শুধু stored `discountPaisa` ধরত — category/product offer-এর base বদলালেও
  discount frozen থাকত, আর discount>subtotal cap ছিল না। **fix:** নতুন `reapplyOffers()` —
  edit-এ composition বদলালে stored coupon দিয়ে engine re-quote, manual staff-discount আলাদা
  রেখে engine-share refresh, redemption release+rewrite (এক transaction, fail-soft);
  `recomputeMoney`-তে `discount = min(discount, subtotal)` cap বসানো।
- **REV-DLV-1 🟠 (board flow gap):** board থেকে unassigned order-কে preparing-এ নেওয়ার পথ
  ছিল না (শুধু Orders screen), তাই Dhaka rider order assign করেও board থেকে send out করা
  যেত না। **fix:** board-এর Needs-assignment card-এ **"Start preparing →"** বোতাম →
  `orders/prepare` (stock commit, DEC-MOD-003 — একই transition, দুই দরজা)। Assign আর
  Start-preparing পাশাপাশি; assign থাকলে বোতাম "Re-assign" হয়।

**Deferred (🟡, §G/backlog-এ):** REV-DLV-3 courier out-এ consignment warn · REV-DLV-4 slot
capacity UI warn · REV-OFR-3 পুরনো OffersView mock cleanup।

**চালাতে (মালিক):** schema বদলায়নি — শুধু `radian_api_rebuild.bat` (API rebuild) →
`/orders/new`-এ coupon + item edit, `/delivery`-এ Start preparing যাচাই। admin tsc ০ error।

---

## ২১. A-to-Z cross-module audit + UI cleanup (23 Jul 2026)

**Cross-module connection audit — dependency graph পরিষ্কার (DAG, cycle নেই):**
delivery→orders · orders→(inventory, offers) · pos→inventory · returns→inventory ·
purchases→(items, inventory) · assembly→(inventory, items) · offers/suppliers/items/
products/customers→(audit only)। offers.service শুধু comment-এ OrdersService উল্লেখ করে,
import করে না — তাই orders↔offers cycle নেই। প্রতিটা entity-র এক owner নিশ্চিত।

**২টা আসল connection বাগ ধরা-সারা (কোড-only):**
- **AUD-1 🔴 phantom stock:** preparing-এর পরে order edit-এ line add করলে stock কাটত না,
  কিন্তু cancel-এ সব readymade line revert করত → বিনা-টাকায় stock বাড়ত। **fix:** order
  committed (preparing/out) হলে add-করা line-ও তখনই stock deduct + Inventory mirror করে।
- **AUD-2 🔴 POS leak:** `GET /orders` (online Sales list) এ `fulfillmentType` filter ছিল না →
  POS counter sale online Orders list + revenue/COD KPI-তে মিশে দ্বিগুণ গুনত। **fix:**
  list `where.fulfillmentType='DELIVERY'` — POS-এর নিজের screen আছে।

**UI cleanup (মালিকের নির্দেশ — field-এ অতিরিক্ত text, "ফাজেল" দেখায়):**
rendered JSX থেকে সব `(DEC-XXX)` / `(OFR-R..)` / `(DLV-R..)` / `(locked §..)` / "One Data One
Owner" technical ref সরানো (code comment-এ DEC থেকে গেছে — traceability rule অটুট) ·
লম্বা multi-sentence `hint=` ছোট করা (Item/Product/Customer/Supplier editor) · verbose
placeholder ছোট (`blank = unlimited`→`Unlimited`, `Type 2+ letters…`→`Search products`) ·
Offers/Delivery-র PageHead description এক-লাইনে। ৩০+ ফাইলে ছোঁয়া, admin tsc **০ error**।

**চালাতে:** schema বদলায়নি — `radian_api_rebuild.bat` (AUD-1/AUD-2 backend fix) → admin auto (Next dev)।

---

## ২২. পরের module — Finance (ledger) · handoff ready (23 Jul 2026)

মালিকের সিদ্ধান্ত: গোড়াপত্তন = **Finance** দিয়ে শুরু, তবে **নতুন চ্যাটে**। এই চ্যাটে Finance code
বানানো হয়নি — শুধু পূর্ণ handoff document তৈরি: **`RADIAN_FINANCE_KICKOFF.md`**।

ওই ফাইলে আছে: Finance-এর event-consumer নীতি · **Financial Event Source Map** (audit থেকে —
প্রতিটা existing completed event কোথায়, কী accounting entry হবে: Sales delivered · COD · refund ·
store credit · POS sale/due/day-close · COGS from AVCO · wastage/gift · purchase · supplier
payment · manual expense/income · transfer · capital) · লক করা ৯টা প্রশ্ন (হিসাবের গভীরতা /
revenue timing / COGS / accounts / category / reconciliation / posting-hook) · schema sketch ·
পরিবেশ-শিক্ষা · workflow।

**নতুন চ্যাট শুরু:** `RADIAN_FINANCE_KICKOFF.md` কপি করে পেস্ট → skills লোড → প্রশ্ন → লক →
`RADIAN_FINANCE_MODULE_ARCHITECTURE.md` (DEC-FIN-XXX) → code।

**UI polish আলাদা রাখা হয়েছে (মালিকের নির্দেশ):** আগে সব গোড়াপত্তন, পরে এক "চিকনি অভিযান"-এ
পুরো admin UI একসাথে পরিষ্কার। §G-backlog + অবশিষ্ট verbose field সেই পাসে।

---

## ২৩. Finance module (ledger) — ধাপ ১ BUILT ✅ (26 Jul 2026, migration pending)

**Architecture:** `RADIAN_FINANCE_MODULE_ARCHITECTURE.md` **v1.1** (DEC-FIN-001…028, FIN-RULE-001…024)
— মালিক ১১টা রায় লক করেছেন: **double-entry ভেতরে + সরল UI বাইরে** (Dr/Cr কখনো পর্দায় নয়) ·
revenue at `delivered` (অগ্রিম = liability) · **COGS via `Goods Out for Delivery`** (preparing→holding,
delivered→COGS, fail→গুদাম — উল্টো entry লাগে না) · **শ্রম-পার্টনারের মাসিক টাকা = বেতন (FIXED খরচ)**,
drawings নয় · **capital-first waterfall** + ঐচ্ছিক labour bonus % · v1 = পুরো event map + partner +
break-even + delivery cost + asset/prepaid + **loan** · go-live opening balance (replay নয়) ·
money account master · ৪টা approval threshold · event-time hook fail-soft · হালকা reconciliation · ৯টা পর্দা।

**Self-review (architecture-review skill) — ৫টা 🔴 ধরা ও সারানো** (`RADIAN_FINANCE_REVIEW.md`):
- **C1 VAT** — `pos.service.ts:279` ইতিমধ্যেই `vatPaisa` আদায় করছে, অথচ v1.0-এ VAT ছিল না →
  `2400 VAT Payable` + `1500 VAT Input` (DEC-FIN-020)। VAT আদায় = দায়, আয় নয়।
- **C2 COD custody** — `orders.service.ts:372` delivered-এ পুরো বকেয়া "আদায়" ধরে, rider/courier দেখে না;
  বাস্তবে কুরিয়ার ৩–৭ দিন পরে চার্জ কেটে পাঠায় → `1110 Cash with Rider/Courier` + `CarrierRemittance`
  (DEC-FIN-021)।
- **C3 double-post** — `suppliers.service.ts:767` allocation থেকে `PurchasePayment` বানায়; দুটোই hook
  করলে একই টাকা দুইবার → posting-এর একমাত্র উৎস `SupplierPayment` (DEC-FIN-022)।
- **C4 idempotency** — `JournalEntry.sourceKey @unique`; একই key দ্বিতীয়বার এলে চুপচাপ skip (DEC-FIN-023)।
- **C5 drift** — `financePostedAt` stamp (Order · PaymentTransaction · SupplierPayment · StockIssue ·
  DeliveryAssignment) + adjusting entry বাধ্যতামূলক + drift checker (DEC-FIN-024)।
- **M1/M2** — period lock (`lastClosedDate`) + ৪টা approval threshold (DEC-FIN-025/026)।
- **M3 লগইন = গৃহীত ঝুঁকি** (DEC-FIN-028): মালিকের সিদ্ধান্ত Finance-এর পরে।
  **ট্রিগার: বাইরের কর্মী/ক্যাশিয়ার নিয়োগের আগে PIN-লগইন বসাতেই হবে** — নইলে চুরি-প্রতিকারের অর্ধেক অকেজো।
- বাজার-প্রেক্ষিত: NBR ২০২৬ auto cross-matching · EFD/SDC · ধারা ৮৩-তে ৫ বছর পিছনে নিরীক্ষা ·
  টার্নওভার ~৳৩ কোটির উপরে standard VAT ১৫% · কর্পোরেট ক্রেতার জন্য Mushak 6.3 (`Order.buyerBin`)।

**Schema (১৬ model + ৯ enum):** `FinanceAccount` (Chart of Accounts, `isMoneyAccount`+`payMethod`
mapping, EXPENSE-এ `costBehavior` = break-even-এর ভিত্তি) · `JournalEntry`(JV-NNNNNN · `sourceKey`
unique · `carrierId` · `reversesId`) + `JournalLine` (partner/order/item/occasion/zone/channel dimension) ·
`Expense`(EXP-) · `Income`(INC-) · `Transfer`(TRN-) · `Partner` + `PartnerTransaction` ·
`FixedAsset`(AST-) · `PrepaidItem`(PRE-) · `Loan`(LON-) + `LoanPayment` · `CarrierRemittance`(RMT-) ·
`AccountReconciliation`(REC-) · `FinancePostingFailure` (replay queue) · `FinanceSetting` (singleton)।
বিদ্যমান টেবিলে additive: `Order.financePostedAt/buyerBin` · `PaymentTransaction.financePostedAt` ·
`SupplierPayment.financePostedAt` · `StockIssue.financePostedAt` · **`DeliveryAssignment.costPaisa`**
(F12 — কুরিয়ার খরচ আগে কোথাও ছিল না) `+codHandedOver+financePostedAt`।

**API (`/finance/*`, static above `:id`):** settings(GET+PATCH) · accounts · accounts/summary ·
accounts CRUD · **opening**(POST — এক OPENING entry, পার্থক্য 3200-এ, তারপর opening ঘর lock) ·
reconcile(POST) · reconciliations · ledger · failures। **Posting engine `postEntry()`** — একটাই দরজা:
ভারসাম্য যাচাই (FIN-RULE-002) · `sourceKey` idempotency · period lock · JV no `max+1`+unique+retry ·
negative amount reject। Chart of Accounts (৫০টা account) প্রথম call-এ seed (Delivery ধাঁচ)।
Balance **সবসময় derived** (opening + ledger), কখনো stored নয় (FIN-RULE-008)।

**Admin (`FinanceLive.tsx`):** `/finance` overview (নগদ · **actually spendable** = নগদ − গ্রাহকের অগ্রিম,
DEC-FIN-027 · rider/courier-এর হাতে কত · পাওনা-দেনা) · `/finance/accounts` (money account তালিকা +
opening balance বসানো + **Count** = গুনে মেলানো, পার্থক্য ledger-এ · পুরো chart of accounts,
fixed/variable ট্যাগ inline বদলানো যায় · নতুন account যোগ) · `/finance/ledger` (immutable তালিকা,
"কোথায় গেল / কোথা থেকে এলো" ভাষায় — Dr/Cr শব্দ নেই) · `/finance/settings` (শুরুর তারিখ · অর্থবছর ·
period close · ৪টা approval সীমা · labour bonus % · asset threshold · rider cash limit · VAT+BIN)।
Sidebar-এ নতুন "Finance" গ্রুপ। **admin tsc ০ error।**

**চালাতে (মালিক):** `radian_finance_migrate.bat` double-click → তারপর `http://localhost:3001/finance/accounts`।

**ধাপ ২ (পরের):** `FinanceService.postEvent()` + Orders/POS/Purchase/Supplier/Returns/Inventory/
Delivery hook (fail-soft) → Overview-তে আসল P&L + break-even।
**ধাপ ৩:** খরচ · আয় · পার্টনার · সম্পদ-ধার · রিপোর্ট (চুরি-সনাক্ত গুচ্ছ · উৎসব/জোন/চ্যানেল লাভ · runway)।

**Live-verified ✅ (26 Jul, Claude নিজে চালিয়ে — মালিকের নীতি: Claude-এর যাচাই = যাচাই):**
`radian_finance_migrate.bat` চলেছে (migration `20260726143004_finance_module` — schema-তে ভুল ছিল না) ·
`/finance/accounts` ৫১টা account seed · `/finance/settings` singleton ঠিক JSON।

**দুটো আসল বাগ ধরা-সারা (চালাতে গিয়ে):**
- **FIN-BUG-1 🔴 (soft-delete extension)** — REV-RTN-4-এর হুবহু পুনরাবৃত্তি: extension প্রতিটি read-এ
  `deletedAt: null` জুড়ে দেয়, কিন্তু ledger টেবিলে ওই column নেই (immutable বলে ইচ্ছাকৃত) →
  প্রতিটা posting 500। **fix:** `NO_SOFT_DELETE`-এ `JournalEntry` · `JournalLine` ·
  `AccountReconciliation` · `FinancePostingFailure` · `FinanceSetting` · `LoanPayment` যোগ।
- **FIN-BUG-2 🟡 (demo clear অসম্পূর্ণ)** — "Clear" গোনার (RECONCILE) entry ও `AccountReconciliation`
  সারি রেখে যেত → খাতা সত্যিই খালি হতো না, পরের opening মিলত না। **fix:** দুটোই মুছবে।

**যাচাই করা পথ (সব localhost-এ, আসল ক্লিকে):**
opening post → **JV-000001** (৳৭,১৫,০০০ ভারসাম্যপূর্ণ, পার্থক্য 3200-এ) · practice data → **১৪ entry**
(stock-out → delivered revenue → COGS → COD → courier remittance চার্জসহ → POS বিক্রি+COGS →
purchase → supplier payment → ভাড়া → পার্টনার বেতন → নষ্ট → অগ্রিম → পথে থাকা মাল) ·
**Count** (গুনে মেলানো): books ৳26,800 vs counted ৳26,000 → −৳800 ledger-এ, মোট নগদ ঠিক ৳800 কমল ·
**Clear** → ১৬ entry মুছে খাতা খালি + opening আবার খোলা।

**অঙ্ক মিলিয়ে দেখা (হাতে যাচাই):** নগদ ৳১,৪১,১৮০ · **খরচযোগ্য ৳১,৩৬,১৮০** (৳৫,০০০ গ্রাহকের অগ্রিম বাদ,
DEC-FIN-027) · সাপ্লায়ার দেনা ৳১,০০,০০০ (85,000+45,000−30,000 ✓) · ক্যাশ ৳২৬,৮০০ (25,000+1,800 ✓) ·
বিকাশ ৳১৫,০০০ (40,000−30,000+5,000 ✓) · ব্যাংক ৳৯৯,৩৮০ (1,50,000+4,380−30,000−25,000 ✓)।

**Test data:** practice set লোড করা আছে (মালিকের অনুশীলনের জন্য) — `/finance/accounts`-এর
**Clear** বোতামে সব মুছে আসল opening বসানো যাবে।

### ২৩ক. Finance — হাতে-লেখা ৪টা ফর্ম BUILT ✅ (26 Jul 2026, মালিকের চাহিদায় এগিয়ে আনা)

মালিক ধরিয়ে দিলেন: পুঁজি ঢালা · খরচ · আয় · ঘরে-ঘরে টাকা সরানো — এগুলোর পর্দাই নেই, ফলে কিছুই
বসানো যায় না। ধাপ ৩ থেকে এগিয়ে এনে এখনই বানানো হলো (architecture §W2 — Finance যে ৪টা জিনিস
নিজে owns)।

**API:** `/finance/expenses` (list · create · **approve/decline** · delete-if-unposted) ·
`/finance/income` · `/finance/transfers` · `/finance/partners` (CRUD + standing) ·
`/finance/partner-transactions` (CAPITAL_IN · CAPITAL_RETURN · DRAWING · SALARY)।
সব posting একই `postEntry()` দরজা দিয়ে — ভারসাম্য · idempotency · period lock এক জায়গাতেই।

**নিয়ম কোডে বসেছে:** FIN-RULE-009/024 (threshold ছাড়ালে PENDING, journal তখনো লেখা হয় না;
approve করলে তবেই ledger-এ) · **FIN-RULE-010** (SALARY = খরচ 5410; CAPITAL_IN/DRAWING/
CAPITAL_RETURN = equity 3000/3100 — কখনো মেশে না) · FIN-RULE-003 (ledger-এ বসে যাওয়া খরচ আর
মোছা যায় না, শুধু reversal) · transfer-এর cash-out charge → 5480 Bank Charge (আসল খরচ) ·
Sales income এই ফর্মে বসানো **নিষিদ্ধ** (Orders/POS-এর মালিকানা)।

**Admin:** `/finance/expenses` (ফর্ম + approval queue + তালিকা, fixed/variable লেবেলসহ) ·
`/finance/income` = "Money in & moving" (**ঘরে-ঘরে টাকা সরানো** — বিকাশ→ব্যাংক, ব্যাংক→ক্যাশ,
চার্জসহ — উপরে; অন্যান্য আয় নিচে) · `/finance/partners` (প্রতি পার্টনারের কার্ড: ঢেলেছে · এখনো
ফেরত পাওনা · বেতন · তুলেছে + "Record…" ড্রপডাউন; নিচে **মোট অনাদায়ী পুঁজি**)। Sidebar-এ ৩টা নতুন link।

**Live-verified ✅ (26 Jul, Claude নিজে):** ২ পার্টনার তৈরি (টাকার পার্টনার + শ্রম-পার্টনার ৫০/৫০) ·
পুঁজি ৳২,০০,০০০ ঢালা → "still owed back ৳২,০০,০০০" · বেতন ৳৩০,০০০ (খরচ) ও উত্তোলন ৳৫,০০০ (equity)
**আলাদা ঘরে** · ছোট খরচ ৳১,৮০০ সরাসরি ledger-এ · ৳৬০,০০০ ভাড়া → **PENDING** (৳৫০,০০০ সীমা
কাজ করছে, নগদ কমেনি) · বিকাশ→ব্যাংক ৳১০,০০০ + ৳১৮৫ চার্জ · অন্যান্য আয় ৳১,২০০।
নগদ হিসাব হাতে মিলিয়ে দেখা: ১,৪১,১৮০ +২,০০,০০০ −৩০,০০০ −৫,০০০ −১,৮০০ +১,২০০ −১৮৫ = **৳৩,০৫,৩৯৫** ✓
API-ও ঠিক ৩,০৫,৩৯৫ বলছে।

### ২৩খ. Biznify তুলনা → ৪টা ফাঁক বন্ধ (26 Jul 2026)

মালিকের নির্দেশে Biznify-র accounting module পড়া হয়েছে (`RADIAN_FINANCE_BIZNIFY_GAP.md`)।
**সারাংশ:** Biznify = Wave-ঘরানার সাধারণ হিসাবরক্ষণ (account description-এ আক্ষরিক "entered in
Wave")। প্রশস্ত, কিন্তু COD custody · পার্টনার waterfall · fixed/variable break-even · উৎসব/জোন
dimension — কিছুই নেই। মালিক ৪টা ফাঁক বন্ধ করার অনুমোদন দিয়েছেন (Biznify কিছুদিন সমান্তরালে চলবে)।

- **G1 · Recurring expense** — `RecurringExpense` model + `/finance/recurring` (list · CRUD ·
  `:id/post`)। মাস এলে "Due" দেখাবে, মালিক এক ক্লিকে পোস্ট করবেন — **নীরবে কখনো নয়**।
  ভুলে যাওয়া ভাড়া = খরচ কম = লাভ মিথ্যা বেশি — সেই ঝুঁকি বন্ধ।
- **G2 · কর্মীর অগ্রিম বেতন** — `1210 Employee Advance` (asset) + **`JournalLine.employeeName`
  dimension**। Biznify-তে প্রতি কর্মীর জন্য আলাদা account বানানো হয়েছে (`Advance Salary Rion/
  Minhaz/Rajib/Rifat/sobuj`) — সেটা chart দূষিত করে; আমরা এক ঘর + dimension নিলাম।
  বেতন দেওয়ার সময় পুরো বেতন = খরচ, অগ্রিম কাটা যায়, শুধু বাকিটা নগদ থেকে বেরোয়।
- **G3/G4/G5 · Chart উন্নয়ন** — `FinanceAccount.groupName` (Money · Receivable · Stock ·
  Cost of Goods Sold · Selling Cost · Shop Running · People · Finance Cost · Tax · Owner …),
  প্রতিটায় এক লাইনের ব্যাখ্যা, `5499 Uncategorised Expense` আশ্রয়-ঘর, আর Biznify-তে দেখা
  **বাস্তব খরচের ধরন**: Website & Software · Professional Fees · Insurance · Import & Customs ·
  Branding & Design · Event Cost · Temporary Worker · **Staff Food (shop nasta)**।
  `ensureSeed()` এখন **idempotent** — নতুন account যোগ করে ও পুরনো row-তে group/note ভরে দেয়,
  ফলে chart বাড়াতে data migration লাগে না।
- **G6 · Accountant mode** — `/finance/journal` (একমাত্র Dr/Cr পর্দা, ভারসাম্য না মিললে post বন্ধ)
  + `/finance/ledger/:id/reverse` (DEC-FIN-014 — সংশোধন = reversal)। আগে বছর-শেষের সমন্বয় entry
  দেওয়ার কোনো দরজাই ছিল না — এটা আমাদের নিজেদের নকশার ফাঁক ছিল।

**Admin:** `/finance/recurring` ("Every month" — due তালিকা + Post it) · `/finance/staff`
("Staff money" — অগ্রিম দেওয়া · বেতন দেওয়া অগ্রিম কেটে · কে কত বাকি) · `/finance/journal`
(accountant mode)। Sidebar-এ ৩টা নতুন link। **admin tsc ০ error।**

**চালাতে (মালিক):** `radian_finance_extras_migrate.bat` (schema বদলেছে: `groupName` ·
`employeeName` · `RecurringExpense`)।

**পরের রিপোর্টে যোগ হবে (Biznify থেকে শেখা):** Daily/Monthly balance flow ⭐ · Customer ledger ·
Supplier ledger · Trial Balance · Balance Sheet · General Ledger · invoice-wise profit।
**পরে:** multi-currency (ওদের `Export Import (Cost)` + FX loss account আছে — আমদানি হয়) · HRM/Payroll।

### ২৩গ. Overview + Chart of Accounts পুনর্গঠন · API-offline কারণ (27 Jul 2026)

**API offline-এর আসল কারণ (ধরা ও সারা):** container `nest start --watch` চালায় **এবং source
bind-mounted** — তাই আমার নতুন কোড watcher সাথে সাথে দেখে ফেলে, অথচ migration চলেনি বলে
`RecurringExpense`/`employeeName` Prisma client-এ ছিল না → **১১টা TS error → app boot হয়নি**
(container "Up" দেখালেও port জবাব দেয় না)। `radian_finance_extras_migrate.bat` চালানোয় সব ঠিক।
**শিক্ষা (পরের বার):** schema বদলালে কোড লেখার সাথে সাথেই migrate চালাতে হবে, নইলে API ততক্ষণ নিভে থাকবে।

**`/finance` Overview এখন আসল** (`GET /finance/overview?monthsBack=`, সব সংখ্যা server-side):
সতর্কতা-চিপ (due recurring · approval-এ আটকে থাকা খরচ · ব্যর্থ posting) · নগদ · **খরচযোগ্য** ·
carrier-এর হাতে · **runway (দিন)** · এ মাসের আয়/COGS/মোট খরচ/**যা থেকে গেল** + গত মাসের তুলনা ·
**break-even মিটার** (বিক্রি খুব কম হলে অনুমান না করে "not enough sales yet" বলে — মিথ্যা সংখ্যা নয়) ·
**সবচেয়ে বড় ৬ খরচ** অনুপাতের বারসহ · পাওনা/দেনা/কর্মীর অগ্রিম/**ফেরত দিতে বাকি পুঁজি** ·
প্রতি ঘরের ব্যালেন্স · গুদাম/পথে থাকা মাল/VAT। মাস বদলানোর ড্রপডাউন (৩ মাস পিছনে)।

**`/finance/chart` — নতুন পাতা** (Biznify-র ধাঁচ, কয়েক জায়গায় ভালো): ৫টা type ট্যাব গোনাসহ +
সার্চ + ট্যাব-প্রতি সহজ ব্যাখ্যা · **গুচ্ছ-ভিত্তিক** তালিকা (Cost of Goods Sold · Selling Cost ·
Shop Running · People · Finance Cost · Other …) প্রতি গুচ্ছে **"Add here"** (কোড auto) ·
সারিতে কোড · নাম · ব্যাখ্যা · চিপ (fixed/variable · money sits here · off) · **ব্যালেন্স**
(ওদের চার্টে নেই) · inline Edit/Turn off/Delete · fixed↔variable সরাসরি বদলানো।
`/finance/accounts` এখন শুধু দৈনিক কাজ + চার্টের লিংক (এক জিনিস দুই জায়গায় আর নেই)।

**Live-verified ✅ (27 Jul):** migration `20260727051358_finance_extras` · chart-এ Asset 17 ·
Liability 6 · Equity 3 · Income 6 · Expense 29 (নতুন ধরনগুলো ব্যাখ্যাসহ বসেছে) · overview-এ
runway ১০৭ দিন · top-6 খরচ · capital to repay ৳২,০০,০০০। **admin tsc ০ error।**

**নোট:** পরীক্ষার সময় bKash ঋণাত্মক (−৳২৫,১৮৫) হয়ে গেছে — সবই practice data;
`/finance/accounts` → **Clear** চাপলে সব মুছে আসল opening বসানো যাবে।

## ২৪. Finance ধাপ ২ — অটো-পোস্টিং BUILT ✅ (27 Jul 2026)

**নতুন:** `FinanceEventsService` (`apps/api/src/finance/finance-events.service.ts`) — operational
event থেকে ledger entry বানানোর **একমাত্র জায়গা**। প্রতিটা method `safe()` দিয়ে মোড়া:
ব্যর্থ হলে বিক্রি/ডেলিভারি/ক্রয় **কখনো rollback হয় না**, `FinancePostingFailure`-এ সারি বসে
(DEC-FIN-010), আর `/finance/failures/:id/replay` দিয়ে আবার বসানো যায়।

**যে event গুলো এখন নিজে বসে:**
| Event | কোথায় hook | কী বসে |
|---|---|---|
| Order delivered | `OrdersService.delivered` | Dr Receivable · Cr Sales + Delivery fee + **VAT Payable** + Adjustment |
| ↳ COGS | একই মুহূর্তে | Dr COGS · Cr **Goods Out** (preparing হয়ে থাকলে) নইলে Cr Inventory |
| ↳ অগ্রিম ছাড় | একই মুহূর্তে | Dr Customer Advance · Cr Receivable |
| Stock out (preparing) | `mirrorToInventory(-1)` | Dr **Goods Out** · Cr Inventory |
| Stock revert (cancel/fail) | `mirrorToInventory(+1)` | Dr Inventory · Cr Goods Out |
| COD collected | `delivered`-এর পরে | Dr **Cash with Rider/Courier** · Cr Receivable *(POS হলে সরাসরি ড্রয়ার)* |
| Payment / advance | `addPayment` · POS collect | Dr \<money\> · Cr Customer Advance |
| Refund | `cancel` · `ReturnsService.complete` | Dr Sales Return · Cr \<money\> |
| POS counter sale | `PosService.createSale` | revenue + COGS + প্রতিটা tender |
| POS day close | `closeShift` | Cash short/over |
| Purchase received | `purchases.receive` | Dr Inventory · Cr Supplier Payable |
| Supplier payment | `SuppliersService.pay` | Dr Payable · Cr \<money\> |
| Purchase payment (standalone) | `purchases.pay` | **DEC-FIN-022** — allocation-জাত হলে skip |
| Wastage / Gift | `InventoryService.createIssue` | Dr Wastage/Gift · Cr Inventory |
| Return complete | `ReturnsService.complete` | store credit (liability) · compensation · restock (Cr COGS) |
| Delivery cost | `onDeliveryCost` (API ready) | Dr Delivery Cost · Cr Payable |

**Module wiring:** Orders · POS · Returns · Purchases · Suppliers · Inventory → `FinanceModule`
import করে। Finance কারো service import করে না (শুধু টেবিল **পড়ে**) — **DAG অক্ষত, cycle নেই**।

**Live-verified ✅ (27 Jul, Claude নিজে):** RAD-D006 (COD ৳৩,৩২০) `delivered` করা হলো →
**JV-000022** "RAD-D006 delivered" (আয় ৳৭,৫০০ → ৳১০,৮২০) · **JV-000023** "cash collected on
delivery" → **Cash with Rider/Courier ০ → ৳৩,৩২০**, হাতের নগদ **অপরিবর্তিত** ✓ — ঠিক DEC-FIN-021
যা চেয়েছিল। `/finance/failures` **খালি** (কোনো posting ব্যর্থ হয়নি)। admin tsc ০ error।

**মেনুর নাম স্পষ্ট করা:** "Every month" → **Monthly bills** · "Staff money" → **Staff advance & salary**।

**এখনো বাকি (`RADIAN_FINANCE_STATUS.md` দ্রষ্টব্য):** কুরিয়ার জমা (CarrierRemittance) পর্দা ·
সম্পদ-অবচয় · prepaid · ধার-লোন পর্দা · রিপোর্ট পাতা · লাভ বণ্টন · মাস-শেষ এক বোতাম ·
drift checker · replay বোতাম UI-তে।

## ২৫. Finance ধাপ ৩ — সম্পদ · ধার · কুরিয়ার · রিপোর্ট · লাভ বণ্টন BUILT ✅ (27 Jul 2026)

**নতুন service:** `finance-assets.service.ts` (সম্পদ · prepaid · লোন · carrier · বণ্টন · মাস-শেষ)
ও `finance-reports.service.ts` (সব রিপোর্ট, server-side — FIN-RULE-016)। মোট endpoint **৬১**।

**নতুন ৩টা পর্দা**
- **`/finance/carrier` — "Cash with riders & couriers"** (DEC-FIN-021 সম্পূর্ণ): কে কত টাকা ধরে
  আছে, কত দিন ধরে (৭ দিনের বেশি লাল) · handover ফর্ম (কত তুলেছিল · তাদের চার্জ · কোন ঘরে ঢুকল) →
  চার্জ Delivery Cost-এ, নিট টাকা ব্যাংকে, 1110 খালি।
- **`/finance/assets` — "Assets, advances & loans"** ৩ ট্যাব: **Things we own** (দাম · আয়ু →
  মাসিক অবচয়, এ মাসে posted/pending) · **Paid in advance** (মাস দিলে ভাগ হয়, **০ দিলে
  ফেরতযোগ্য জামানত — কখনো খরচ হয় না**) · **Money borrowed** (কিস্তিতে **আসল ও সুদ আলাদা ঘরে**)।
  উপরে **"Run this month"** = মাস-শেষ (W3): অবচয় + prepaid ভাগ একসাথে।
- **`/finance/reports`** ৪ ট্যাব: **লাভ-ক্ষতি** (গুচ্ছভিত্তিক, gross margin সহ) · **কে কত পাওনা/দেনা**
  (০–৭ · ৮–১৫ · ১৬–৩০ · ৩০+ দিনের বালতি) · **দৈনিক টাকার প্রবাহ** (দিন-শুরু · এলো · গেল · দিন-শেষ) ·
  **Leakage watch** (পথে আটকে থাকা মাল · কে কত নষ্ট দেখাল · কে কত ছাড় দিল · store credit · কর্মীর অগ্রিম)।
- **লাভ বণ্টন** `/finance/partners`-এ: "Share this month's profit" → waterfall preview
  (bonus → পুঁজি ফেরত → অনুপাতে ভাগ) → **নগদ না থাকলে বোতাম বন্ধ** (FIN-RULE-011)।

**Live-verified ✅ (27 Jul, Claude নিজে সব চালিয়ে):**
ফ্রিজ ৳৮০,০০০/৪৮ মাস → মাসিক অবচয় **৳১,৬৬৬.৬৭** posted · ৬ মাসের ভাড়া ৳১,৫০,০০০ → এ মাসের
**৳২৫,০০০** খরচে · **জামানত ৳১,০০,০০০ ভাগ হয়নি** (সঠিক, FIN-RULE-014) · মামার ধার ৳৩,০০,০০০ +
কিস্তি (আসল ৳৫০,০০০ · সুদ ৳২,৫০০ আলাদা ঘরে) · কুরিয়ার handover ৳৩,৩২০ − চার্জ ৳১২০ → **1110 শূন্য** ·
লাভ বণ্টন: লোকসানের মাস বলে সঠিকভাবেই **আটকে দিল**।
**সবচেয়ে বড় প্রমাণ: Trial Balance মিলে গেছে — ডেবিট ৳১৮,৪৩,৯৬১.৬৭ = ক্রেডিট** (`balanced: true`)।
P&L-এ নতুন সব খরচ ঠিক গুচ্ছে বসেছে (People ৳৬০,০০০ · Shop Running ৳৫১,৮০০ · Finance Cost ৳২,৬৮৫ ·
Depreciation ৳১,৬৬৬.৬৭ · Selling Cost ৳২৪০)। **`/finance/failures` খালি · admin tsc ০ error।**

**পরীক্ষার ডেটা (মুছে ফেলতে হবে আসল শুরুর আগে):** Display fridge (AST-000001) · 6 months shop rent ·
Shop security deposit · Mama-র ধার (LON-000001) · RMT-000001 · আগের practice ledger rows।

**এখনো বাকি:** ব্যর্থ posting replay-এর বোতাম UI-তে (API আছে) · drift checker (DEC-FIN-024) ·
লোন delete · Mushak 6.3 প্রিন্ট · multi-currency · লগইন (DEC-FIN-028 — কর্মী নিয়োগের আগে)।

## ২৬. Finance — বেতন-বিলের রিপোর্ট + পুরো module-এর UI/UX পাস (27 Jul 2026)

মালিকের নির্দেশ: "ডেটা আছে কিন্তু user-friendly না" — তাই kickoff §7-এর "UI polish পরে" শিথিল
করে Finance-এর নিজস্ব design pass করা হলো।

**নতুন রিপোর্ট — "Salary & bills"** (`GET /finance/reports/commitments`, `/finance/reports`-এর
প্রথম ট্যাব): প্রতি মাসে যা বেরোবেই — recurring বিল · পার্টনারের বেতন · কর্মীর বেতন (গড়, ledger
থেকে) · অবচয় · অগ্রিমের মাসিক ভাগ · লোনের সুদ। উপরে ৪টা KPI: **মোট মাসিক · এর মধ্যে আসল নগদ
(অবচয়/prepaid বাদে) · এ মাসে এখনো বাকি · এটা তুলতে কত বিক্রি লাগবে** (চলতি margin ধরে)।
নিচে প্রতিটার share-বার ও paid/due চিপ, আর **কে কত বেতন পেয়েছে** (গড় · এ মাস · কত মাস) তালিকা।
*যাচাই:* মাসিক ৳৫৬,৬৬৬.৬৭ · নগদ ৳৩০,০০০ · **৳১,৬৪,৩৯৪ বিক্রি লাগবে (৩৪% margin)** ✓

**Design kit — `FinanceUI.tsx`** (এক জায়গায় পুরো চেহারা): ৬টা tone (brand/emerald/amber/rose/
sky/slate) প্রতিটার soft/ring/gradient সহ · `FinHeader` (gradient hero + emoji বাবল) ·
`Kpi` (রঙিন accent-বার + icon + trend চিপ) · `Panel` (রঙিন হেডার + sub) · `Tabs` (গোনা সহ pill) ·
`Table/Th/Td` (zebra + hover) · `Bar` · `Chip` · `Empty` · `Banner` · `Flash` · `Lbl` · common
input/button style। **রঙই মানে বোঝায়** — সবুজ = আমাদের ও সুস্থ, হলুদ = খেয়াল রাখো, লাল = ভুল।

**যেসব পর্দা নতুন চেহারায়:** `/finance` (সম্পূর্ণ নতুন `FinanceOverview.tsx` — সতর্কতা-চিপ ক্লিকযোগ্য,
৪+৪ KPI, মাসের ফল এক কার্ডে, break-even বার, বড় খরচের বার, ঘরভিত্তিক ব্যালেন্স, ঋণাত্মক হলে
"below zero" চিপ + লাল ব্যানার) · `/finance/reports` (৫ ট্যাব) · `/finance/assets` (৩ ট্যাব +
৩ KPI) · `/finance/carrier`।

**🔴 চালাতে গিয়ে ধরা একটা আসল বিপদ — সারানো:**
Chart of accounts-এ "Turn off" চেপে **Cash Drawer বন্ধ হয়ে গিয়েছিল**, ফলে ৳২১,২০০ নীরবে
"money on hand" থেকে গায়েব (মালিক পরীক্ষা করতে গিয়ে চেপেছিলেন)। **fix (দুই স্তরে):**
(১) টাকা থাকা অবস্থায় money account বন্ধ করা এখন **block** — *"Cash Drawer still holds 21,200 tk —
move that money somewhere else first"*; (২) বন্ধ থাকলেও ব্যালেন্স থাকলে Overview-তে **দেখাবেই**
(লুকানো নগদ = খাতা মিথ্যা বলার শুরু)। যাচাই: PATCH → 400 + বার্তা ✓, Cash Drawer ফেরত, নগদ ৳২,২৬,০৯৫।

**admin tsc ০ error।**

### ২৬ক. Finance UI — রঙ জোরালো + পুরো module একই ডিজাইনে (27 Jul 2026)

মালিকের ফিডব্যাক: *"পুরা module সাদা-সাদা, colorful চাই, তেমন কোনো design change হয়নি"* — ঠিক ছিল:
আগের পাসে রঙ খুব হালকা ছিল আর মাত্র ৪টা পাতা বদলেছিল।

**রঙ জোরালো (`FinanceUI.tsx`):**
- `FinHeader` — এখন **পুরো gradient ব্যাকগ্রাউন্ড, সাদা লেখা**, ভেতরে দুটো আলো-বৃত্ত, কাচের মতো
  আইকন বাবল (আগে সাদা কার্ডে ৭% opacity ছিল — চোখে পড়ত না)
- `Kpi` — কার্ডের **পুরো ব্যাকগ্রাউন্ড tone-এর রঙে**, কোণে gradient আভা, আইকন বাবল **solid gradient +
  সাদা glyph**, hover-এ উঠে আসে (আগে সাদা কার্ড + ৩px দাগ)
- `Panel` — হেডার **gradient বার, সাদা টাইটেল** (আগে হালকা tint)
- টেবিলের হেডার সারি বেগুনি tint + বেগুনি লেখা · section শিরোনামে gradient accent-বার

**সব পাতা এক ডিজাইনে** (আগে শুধু overview/reports/assets/carrier): Money accounts · Chart of
accounts · Expenses · Money in & moving · Partners · Monthly bills · Staff advance & salary ·
Ledger · Manual journal · Settings — প্রতিটার নিজস্ব রঙ ও ইমোজি:
💰 sky · 🗂 brand · 🧾 amber · 🔁 emerald · 🤝 brand · 📅 amber · 👤 sky · 📖 slate · ⚖ slate · ⚙ brand।
Chart of accounts-এ ট্যাব ও গুচ্ছ-হেডার এখন ধরন অনুযায়ী রঙিন (Asset নীল · Liability লাল ·
Equity বেগুনি · Income সবুজ · Expense কমলা)।

সব `PageHead`/`Card`/`Stat`/`Msg`-এর ফাইল-প্রতি কপি মুছে **একটাই kit** — এক জায়গায় রঙ বদলালে
পুরো module বদলাবে। **admin tsc ০ error।** (admin dev-server, তাই শুধু refresh — rebuild লাগে না।)

## ২৭. Finance — দ্বিতীয় পূর্ণ রিভিউ ও সংশোধন (27 Jul 2026)

বিস্তারিত: `RADIAN_FINANCE_REVIEW2.md`। কোডের আসল সূত্র মিলিয়ে **৪টা বাগ** ধরা ও সারানো:

- **🔴 B1 — অনলাইন অর্ডারে entry বেমিল হতো।** `recomputeMoney`-তে total-এ **VAT নেই**
  (`subtotal − discount + delivery − waived + adjustment`), অথচ POS-এ **আছে** (`base + vat`)।
  আমার posting দুই ক্ষেত্রেই VAT আলাদা credit করত → VAT চালু করার দিন থেকে **প্রতিটা delivered
  অর্ডারের posting ব্যর্থ** হতো। **fix:** ভাগটা এখন **total থেকে কেটে** বানানো হয় (delivery · VAT
  — শুধু যদি সত্যিই total-এ থাকে, ১ পয়সার মধ্যে যাচাই করে · adjustment), **বাকিটাই Sales**।
  সূত্র বদলালেও আর কখনো বেমিল হবে না।
- **🔴 B2 — ডেলিভারির পরে নেওয়া টাকা চিরকাল "অগ্রিম" থাকত।** delivered-এ একবারই অগ্রিম ছাড়া হতো;
  পরে টাকা এলে দায় ফুলে থাকত, "actually spendable" মিথ্যা কম দেখাত। **fix:** payment বসানোর
  সময় দেখা হয় আয় ইতিমধ্যে খাতায় আছে কিনা — থাকলে সরাসরি **Receivable কমায়**।
- **🟠 B3 — কুরিয়ার খরচ Supplier Payable-এ** বসত (সাপ্লায়ার দেনা ফুলে যেত) → এখন `2300 Accrued Expense`।
- **🟠 B4 — "কে কত পাওনা" রিপোর্ট আর খাতা দুই কথা বলত** (রিপোর্ট সব unpaid অর্ডার গুনত, এমনকি
  যেগুলোর বিক্রি খাতায় ওঠেনি) → এখন শুধু `financePostedAt` আছে এমন অর্ডার।
- **নতুন:** DEC-FIN-024-এর **stamp** এতদিন কেউ বসাত না — এখন Order · PaymentTransaction ·
  SupplierPayment · StockIssue-এ posting-এর সাথে বসে। **Ledger পর্দায় ব্যর্থ posting-এর লাল
  প্যানেল + "Try again" বোতাম** (API ছিল, পর্দা ছিল না)।

**যাচাই (চালু সিস্টেমে):** Trial balance **৳১৮,৪৩,৯৬১.৬৭ ডেবিট = ক্রেডিট ✅** · ব্যর্থ posting **০** ·
৬১টা endpoint ২০০ · অগ্রিম নেওয়া → দায়ে বসল ✅ · money-account গার্ড 400 + বার্তা ✅ · admin tsc ০ error।

**খোলা ফাঁক:** drift checker (G1 — আজই দেখা গেল খাতায় সাপ্লায়ার দেনা ৳১,০০,০০০ কিন্তু Purchase
টেবিলে ৳০, কারণ ওটা practice data) · **PIN লগইন (G2 — কর্মী নিয়োগের আগে বাধ্যতামূলক)** ·
Mushak 6.3 প্রিন্ট · লোন edit/delete · period close বাস্তবে চাপা হয়নি · multi-currency/বাজেট/
bank import/Employee সংযোগ।

## ২৮. Access — লগইন + PIN (DEC-FIN-028 বন্ধ) · BUILT ✅ (27 Jul 2026, migration pending)

মালিকের সিদ্ধান্ত: **লগইন + সংবেদনশীল কাজে PIN**। এতদিন admin panel-এ কোনো দরজা ছিল না, আর
প্রতিটা কাজে `actorName` ছিল **হাতে টাইপ করা লেখা** — অর্থাৎ চুরি-সনাক্ত রিপোর্টের নামগুলোই অবিশ্বাস্য।

**Schema:** `AppUser` (name · username unique · role OWNER/MANAGER/STAFF · passwordHash · pinHash ·
isActive · lastLogin) + `AppSession` (token unique · expiresAt, ৭ দিন)। পাসওয়ার্ড/PIN **scrypt +
per-user salt** — নতুন কোনো dependency লাগেনি (node-এর নিজের crypto)।

**API `/auth/*`:** status · **setup** (প্রথমবার, কেউ না থাকলেই কাজ করে) · login · logout · me ·
verify-pin · users CRUD (**OWNER only**)। `AuthGuard` — token না থাকলে 401; `@NeedsPin()` থাকলে
`x-radian-pin` যাচাই, না মিললে 403। **`ActorInterceptor`** — body-র `actorName` **সেশনের নাম দিয়ে
overwrite** হয়, তাই কর্মী আর মালিকের নাম লিখে দিতে পারবে না।

**PIN লাগে যেসব কাজে (১৪টা):** opening · reconcile (গোনা) · expense approve · income · transfer ·
partner transaction · staff advance · staff salary · manual journal · reverse · carrier remit ·
loan payment · profit distribution · demo clear।

**Admin:** `AuthGate` root layout-এ — **প্রথম রান = owner সেটআপ ফর্ম** (নাম · username · পাসওয়ার্ড ·
৪-সংখ্যার PIN), তারপর সাইন-ইন পর্দা। টাকার কাজ করলে **PIN বক্স আপনা-আপনি ওঠে** — `api.ts` 403
পেলে prompt দেখিয়ে **একই request আবার পাঠায়** (প্রতিটা call site আলাদা করে বদলাতে হয়নি)।
Sidebar-এর নিচে **কে সাইন-ইন করা আছে + exit**। PIN কোথাও সংরক্ষিত হয় না — প্রতিবার চাওয়া হয়।

**চালাতে:** `radian_access_migrate.bat` → তারপর `http://localhost:3001` খুললেই সেটআপ ফর্ম।

**admin tsc ০ error।** *(এখনো শুধু Finance-এর route গুলো guard-এ; Orders/POS/Inventory পরের পাসে —
তখন Roles & Permissions module এই টেবিল দুটোই adopt করবে।)*

## §29 — Access: login + PIN (DEC-FIN-028) — LIVE ও যাচাইকৃত

Migration `20260727164724_access_login` চলেছে, API আবার চালু।

Owner account তৈরি হয়েছে: `sobuj` (OWNER, PIN সেট করা আছে)।

আমি নিজে যা পরীক্ষা করেছি (২৭ জুলাই ২০২৬):

| পরীক্ষা | ফল |
|---|---|
| token ছাড়া `GET /finance/overview` · `/accounts` · `/reports/trial-balance` | 401 ✅ |
| ভুয়া token | 401 ✅ |
| token ছাড়া `POST /finance/reconcile` · `/journal` · `/demo/clear` | 401 ✅ |
| সঠিক session-এ read (overview, 61-row chart, trial balance) | 200 ✅ |
| সঠিক session কিন্তু **PIN ছাড়া** money action | 403 "PIN required" ✅ |
| সঠিক session কিন্তু **ভুল PIN** | 403 ✅ |
| `/auth/status` (public) | 200 ✅ |
| দ্বিতীয়বার `/auth/setup` চেষ্টা | 400 "Already set up" ✅ |
| `GET /orders`, `GET /products` | **এখনো খোলা** — guard শুধু Finance-এ |

Sidebar-এ এখন `sobuj · OWNER · exit` দেখা যাচ্ছে; Overview আসল ডেটা দেখাচ্ছে
(হাতে ৳2,26,595 · খরচযোগ্য ৳2,21,095 · runway 59 দিন)।

**খোলা রয়ে গেল**
1. Guard এখনো Orders / POS / Inventory / Purchases-এ বসেনি — যে কেউ ওই API সরাসরি ডাকতে পারবে। পরের ধাপ।
2. ভুল PIN আর PIN-না-দেওয়া — দুটোতেই একই বার্তা। ইচ্ছাকৃত (কোনটা ভুল তা ফাঁস না করা), কিন্তু UI-তে "PIN ঠিক নয়" আলাদা করে দেখানো ভালো হতো।
3. Overview-তে **bKash ৳ -24,685 (below zero)** — practice ডেটার ফল, কিন্তু money account কখনো ঋণাত্মক হওয়া উচিত নয়। আসল ডেটা তোলার আগে এটা পরিষ্কার করতে হবে।

## §30 — তালা এখন পুরো প্যানেলে + People & access

আগে তালা ছিল শুধু Finance-এ। এখন **AuthGuard আর ActorInterceptor global**
(`AuthModule`-এ `APP_GUARD` / `APP_INTERCEPTOR`) — অর্থাৎ আগামী মাসে নতুন কোনো
controller লিখলে সেটা **জন্ম থেকেই বন্ধ**। খোলা রাখতে হলে `@Public()` লিখে
স্পষ্ট করে বলতে হবে। কেউ decorator বসাতে ভুলে গেলে ফাঁক হবে না — এটাই নিরাপদ default।

খোলা আছে কেবল: `/` (alive ping), `/auth/status`, `/auth/setup`, `/auth/login`, `/auth/logout`।

### Role — লাইনটা টাকার জায়গায়, পদমর্যাদায় নয়

| | STAFF | MANAGER | OWNER |
|---|---|---|---|
| Orders · POS · Stock · Assembly · Delivery · Returns · Customers | ✅ | ✅ | ✅ |
| Purchases · Suppliers (কেনা দাম দেখা যায়) | ❌ | ✅ | ✅ |
| Finance পুরোটা (খরচ, লাভ, দেনা, রিপোর্ট) | ❌ | ✅ | ✅ |
| Partner capital · profit sharing · opening balance · manual journal · month close · Finance settings · practice data মোছা | ❌ | ❌ | ✅ |
| People & access | ❌ | ❌ | ✅ |

### নতুন পর্দা
- `/settings/people` — প্রতি মানুষের আলাদা account (নাম, username, প্রথম password, PIN, role)। OWNER ছাড়া মেনুতেই দেখা যায় না।
- `/settings/me` — যে কেউ নিজের password আর PIN বদলাতে পারে। password বদলালে **সব ডিভাইসে সাইন-আউট** হয়ে যায়।

### সাথে যেসব চুপচাপ ফাঁক বন্ধ হলো
1. `x-actor-name` header-ও এখন session থেকে বসে — Assembly / Customers / Items এতদিন client যা পাঠাত তা-ই বিশ্বাস করত।
2. চারটে raw `fetch()` token ছাড়া চলছিল → shared client-এ আনা হলো। এর মধ্যে **Profit-sharing preview আর pay-out দুটোই ভাঙা ছিল** (Finance guard বসার পর 401 দিত), এবং FinanceMore-এর সব panel (carrier, assets, loans, reports)।
3. 401 এলে এখন dead token মুছে সরাসরি login পর্দা ফেরে — আগে প্রতি panel নিজের মতো error লিখত।

### নিজে পরীক্ষা (২৭ জুলাই ২০২৬, আসল STAFF ও MANAGER account বানিয়ে)

| | ফল |
|---|---|
| token ছাড়া `/orders` `/products` `/customers` `/purchases` `/suppliers` `/offers` | 401 ✅ |
| `/` alive ping | 200 ✅ |
| STAFF → orders / products | 200 ✅ |
| STAFF → finance overview · ledger · P&L · purchases · suppliers · people | **403** ✅ |
| MANAGER → orders · finance · purchases | 200 ✅ |
| MANAGER → partner তৈরি · manual journal · profit sharing · people | **403** ✅ |
| MANAGER খরচ পোস্ট করল body-তে `actorName:"sobuj"` জাল করে | বইয়ে লেখা হলো **"Test Manager"** ✅ |

শেষ সারিটাই আসল প্রমাণ: নাম আর টাইপ করা যায় না, session থেকেই বসে।

**⚠️ পরিষ্কার করার বাকি:** পরীক্ষার সময় **EXP-000005 · ৳1.00** (Cost of Goods Sold,
Cash Drawer থেকে) ledger-এ ঢুকে গেছে। threshold 0 বলে সরাসরি AUTO-post হয়েছে, আর
বই থেকে মুছে ফেলা যায় না (FIN-RULE-003) — reverse করতে হবে, নয়তো practice ডেটা
পরিষ্কারের সময় একসাথে যাবে।

**এখনো খোলা:** delete-জাতীয় কাজ (product/customer মুছে ফেলা) STAFF-ও পারবে —
role অনুযায়ী destructive route আলাদা করা হয়নি। পরের ধাপ।

## §31 — মুছে ফেলা ও ছাড় দেওয়ার নিয়ম

§30-এ খোলা রেখে যাওয়া ফাঁকটা বন্ধ হলো। STAFF আর **মুছতে পারবে না**, আর
**ছাড় বানাতেও পারবে না** — কারণ ৯০% কুপন বানানো মানে হাত দিয়ে টাকা বিলিয়ে দেওয়া,
সেটা মুছে ফেলার চেয়ে কম বিপজ্জনক নয়।

**MANAGER ও তার উপরে:**
- মুছে ফেলা: product · order · customer · item (ও তার component) · return · return reason · assembly template
- Offers পুরো লেখালেখি: তৈরি, সম্পাদনা, approve/decline, pause/resume, archive, মুছে ফেলা, offer settings
- Delivery-র মাস্টার: rider · courier · delivery method · slot (তৈরি/সম্পাদনা/মোছা) — কারণ এখানেই ডেলিভারি ফি ঠিক হয়

**STAFF যা এখনো পারে (ইচ্ছাকৃত):**
- `/offers/quote` — অর্ডার নেওয়ার সময় ছাড়ের হিসাব দেখা (বানানো নয়, শুধু দেখা)
- `/delivery/assignments/*` — রাইডারকে দেওয়া, বেরিয়েছে, পৌঁছেছে, ব্যর্থ
- `/pos/held/:id` মোছা — কাউন্টারে পার্ক করা বিল বাতিল, রোজকার কাজ
- customer-এর ভুল recipient মোছা — নিজের টাইপো ঠিক করা

### পরীক্ষা (২৮ জুলাই ২০২৬, আসল STAFF account বানিয়ে)

| | ফল |
|---|---|
| STAFF → products · orders · delivery board পড়া | 200 ✅ |
| STAFF → offer quote (ছাড় দেখা) | guard পার, validation-এ আটকাল ✅ |
| STAFF → product · order · customer · item · return মোছা | **403** ✅ |
| STAFF → offer বানানো / মোছা | **403** ✅ |
| STAFF → rider যোগ / delivery method মোছা | **403** ✅ |
| OWNER → ওই একই মোছা | 404 (id নেই) — **403 নয়**, অর্থাৎ owner আটকায়নি ✅ |

শেষ সারিটা জরুরি: নতুন নিয়ম owner-কেও আটকে দিলে সেটা টের পাওয়া যেত না, তাই আলাদা করে দেখা হলো।

## §32 — Drift checker (G1) · লোন সংশোধন (G4) · মাস বন্ধ (G5)

### ১. "খাতা আর দোকান কি এখনো মিলছে?" — `/finance/drift`

বাকি সব পর্দা খাতা পড়ে এবং খাতাকে বিশ্বাস করে। এই পর্দাটা উল্টোটা করে:
অপারেশনাল টেবিলকে **একই প্রশ্ন** করে, তারপর দুটো উত্তর পাশাপাশি রাখে।

কেন দরকার — একটা খাতা সম্পূর্ণ ভুল হয়েও নিখুঁত দেখাতে পারে। Trial balance
মিলবে, প্রতিটা রিপোর্ট যোগ হবে, কোথাও লাল দাগ থাকবে না — কারণ খাতা **নিজের
সাথে** সঙ্গতিপূর্ণ। যে বিক্রি কখনো পোস্ট হয়নি বা যে বিল হাতে বসানো হয়েছে,
সেটা ধরার একমাত্র পথ হলো যেদিকে ঘটনাটা সত্যিই ঘটেছে সেদিকের সাথে মেলানো।

দশটা তুলনা: সাপ্লায়ার দেনা · গ্রাহক পাওনা · স্টকের মূল্য · ক্যারিয়ারের হাতে টাকা ·
পোস্ট না হওয়া বিক্রি · পোস্ট না হওয়া ক্রয় · অপেক্ষমাণ posting failure ·
দুই পাশ না মেলা entry · ঋণাত্মক money account · এক সপ্তাহের বেশি আটকে থাকা goods-out।

**কিছুই লেখে না।** যে checker চুপচাপ "ঠিক করে দেয়" সে-ই প্রমাণ নষ্ট করে —
কীভাবে হলো তা আর জানা যায় না। এটা শুধু জানায়।

go-live তারিখের আগের সারি বাদ যায়, নইলে প্রতি রাতে মিথ্যা অ্যালার্ম বাজত।

**প্রথম চালিয়েই ৪টা আসল সমস্যা ধরল** (২৮ জুলাই ২০২৬):

| | খাতা বলে | দোকান বলে | ফারাক |
|---|---|---|---|
| সাপ্লায়ার দেনা | ৳১,০০,০০০ | ৳০ | +৳১,০০,০০০ |
| স্টকের মূল্য | ৳৩,৫৬,২৫০ | ৳২২,৩০০ | +৳৩,৩৩,৯৫০ |
| ডেলিভার হওয়া অথচ খাতায় নেই | — | ৳১৬,৬৫০ | RAD-D005…D008 (৪টা) |
| ঋণাত্মক money account | −৳৫৩,৫৮৬ | ০ | Cash Drawer −২৮,৯০১ · bKash −২৪,৬৮৫ |

বাকি ৬টা মিলেছে। চারটেই practice ডেটার ফল — কিন্তু **এতদিন এগুলো ধরার কেউ ছিল না**।

### ২. লোন সংশোধন ও মুছে ফেলা (G4)

দুটো আলাদা অবস্থা, আর এদুটো গুলিয়ে ফেললেই খাতা চুপচাপ বদলে যায়:

- **খাতায় ঢোকেনি** (কোনো অ্যাকাউন্টে টাকা আসেনি, কোনো কিস্তিও দেওয়া হয়নি) → পুরো সারি সম্পাদনযোগ্য, মুছেও ফেলা যায়।
- **খাতায় ঢুকে গেছে** → পরিমাণ, তারিখ আর যে অ্যাকাউন্টে টাকা এসেছিল — তিনটেই **জমাট**। শুধু নাম/নোট/মেয়াদ ঠিক করা যায়। মুছে ফেলা সম্পূর্ণ বন্ধ।

পরীক্ষা: Mama-র লোন (posted) → পরিমাণ বদল **400**, নোট বদল 200, মুছে ফেলা **400**।
নতুন unposted লোন → পরিমাণ বদল 200 (৳১২৩.৪৫ → ৳৯৯৯.৯৯), মুছে ফেলা 200। পরীক্ষার সারি মুছে দিয়েছি।

### ৩. মাস বন্ধ করা — একটা আসল বাগ ছিল (G5)

আগের কোড **চলতি মাসের শেষ দিন** পর্যন্ত বন্ধ করত। অর্থাৎ ২৮ তারিখে বোতাম চাপলে
২৯–৩১ তারিখের প্রতিটা এন্ট্রি নিঃশব্দে আটকে যেত — দোকান তিন দিন একটা বিক্রিও
তুলতে পারত না, আর কারণ হিসেবে শুধু "period is closed" দেখাত।

এখন: **শেষ হয়ে যাওয়া মাস** পর্যন্ত বন্ধ হয় (বা মালিকের দেওয়া নির্দিষ্ট তারিখ, যা
দিয়ে দেরি হওয়া মাস বন্ধ করা যায়)। ভবিষ্যতের তারিখ দিলে 400।

সাথে **Reopen** যোগ হলো — আলাদা কাজ হিসেবে, checkbox নয়। OWNER + PIN + audit,
কারণ বন্ধ মাস খোলা মানেই হিসাবরক্ষক যে সংখ্যায় সই করেছেন সেটা বদলানোর সুযোগ।

### ৪. পরীক্ষা করতে গিয়ে নিজেরই বানানো একটা পেছনের দরজা ধরা পড়ল

`PATCH /finance/settings` দিয়ে `lastClosedDate` **PIN ছাড়া, কোনো চিহ্ন না রেখে**
মুছে ফেলা যাচ্ছিল — অর্থাৎ period lock কার্যত সাজসজ্জা। এখন ওই পথ বন্ধ; তালা
ছোঁয়ার একমাত্র উপায় Close month / Reopen month। বাকি সেটিংস আগের মতোই।

পরীক্ষা: backdoor **400** · অন্য সেটিংস 200 · তালা অক্ষত।

**⚠️ মালিকের জন্য:** পরীক্ষার সময় **জুন ২০২৬ বন্ধ হয়ে গেছে** (৩০ জুন পর্যন্ত)।
জুলাইয়ের কাজে কোনো বাধা নেই, আর জুন শেষ হয়ে গেছে বলে এটা আসলে ঠিকই আছে। খুলতে
চাইলে Reopen — তোমার PIN লাগবে, আমার হাতে নেই।

## §33 — Drift checker এখন রাতে নিজে চলে (G1 সম্পূর্ণ)

আগের ধাপে drift checker ছিল একটা বোতাম — কেউ পর্দায় গেলে চলত। **যে পাহারাদারকে
ডেকে আনতে হয় সে পাহারাদার নয়।** এখন সেটা ঠিক করা হলো।

### কখন চলে
রাত **২টা, বাংলাদেশ সময়** — দোকান বন্ধ, দিনের সব অর্ডার ঢুকে গেছে, আর কিছু
গোলমাল থাকলে মালিক সকালের চায়ের সাথে জানবেন, তিন সপ্তাহ পরে নয়।
বাংলাদেশে daylight saving নেই, তাই স্থির +৬ offset সারা বছর সঠিক — কোনো
timezone library লাগেনি। নতুন কোনো dependency যোগ করা হয়নি (scrypt-এর মতোই)।

**মেশিন বন্ধ থাকলে?** দোকানের ল্যাপটপ সারা রাত চলে না। তাই চালু হওয়ার ৯০ সেকেন্ড
পরে দেখা হয় — গত ২৪ ঘণ্টায় কোনো check হয়েছে কি না। না হলে তখনই একবার চালায়।
নইলে রাত ২টার job কাগজে-কলমে থাকত, বাস্তবে কখনো চলত না।

### ফলাফল কোথায় থাকে
**AuditLog টেবিলে** — নতুন কোনো টেবিল নয়, তাই migration লাগেনি, আর ইতিহাস স্থায়ী।

**প্রতিবার লেখা হয়, শুধু খারাপ দিন নয়।** কারণ "এই মাসে প্রতি রাতে মিলেছে" আর
"মার্চের পর কেউ চেক করেনি" — দুটো এক জিনিস নয়। আর ফারাকটা *কোন রাতে শুরু হলো*
সেটাই সাধারণত বলে দেয় কারণটা কী।

### কোথায় দেখা যায়
- `/finance/drift` — এখন দুটো বোতাম: **Check again** (শুধু দেখা, কোনো চিহ্ন থাকে না) আর **Check and save** (রাত ২টার job যা করে ঠিক তাই)। নিচে **Past checks** তালিকা।
- **Overview-তে ব্যাজ** — `🔍 4 things do not match the shop →`। নিজের পর্দায় লুকিয়ে থাকা ফারাক কেউ খুঁজে পায় না, তাই যেখানে মালিক রোজ তাকান সেখানেই বসানো হলো। alert গণনায়ও যোগ হয়েছে।

### পরীক্ষা (২৮ জুলাই ২০২৬)
| | ফল |
|---|---|
| boot-এ scheduler | `next drift check at 2026-07-27T20:00:00.000Z` = ২৮ জুলাই রাত ২টা ঢাকা ✅ |
| history আগে | 0 |
| manual run | 201 |
| history পরে | 1 · `wrong · wrong=4 · Checked by hand` ✅ |
| সংরক্ষিত সমস্যা | সাপ্লায়ার দেনা · স্টকের মূল্য · খাতায় ওঠেনি এমন ডেলিভারি · ঋণাত্মক wallet ✅ |
| Overview ব্যাজ | `🔍 4 things do not match the shop →` ✅ |
| catch-up | সদ্য চলেছে বলে সঠিকভাবে বাদ দিল ✅ |

---

## Finance module — কোডের দিক থেকে এখানেই শেষ

বাকি রইল দুটো, দুটোই আমার হাতের বাইরে:

1. **Mushak 6.3 চালান** — Radian-এর আসল BIN / VAT registration নম্বর ছাড়া বানানো যায় না।
2. **আসল হিসাব তোলা** — practice ডেটা মুছে opening balance বসানো, প্রতিটা খরচে fixed/variable ঠিক করা। Drift পর্দা এখন ঠিক কোনগুলো ঠিক করতে হবে তার তালিকা দিচ্ছে।

সচেতনভাবে পরে রাখা: multi-currency · বাজেট · ব্যাংক statement import · Employee module সংযোগ।

## §34 — মূসক ৬.৩ · সরকারি VAT চালান (G3) — শেষ ফাঁক বন্ধ

কর্পোরেট গিফট অর্ডারে এটা কাগজপত্রের ঝামেলা নয় — **অর্ডার পাওয়া আর না পাওয়ার
পার্থক্য।** বৈধ BIN সহ মূসক ৬.৩ ছাড়া ক্রেতা কোম্পানি নিজের input VAT রেয়াত নিতে
পারে না, তাই অনেকে চালান না পেলে কেনেই না।

### দুটো নিয়ম পুরো কোডটাকে নিয়ন্ত্রণ করেছে

**১. সরকারি ফর্মে কিছুই বানানো যাবে না।**
আমাদের BIN, নিবন্ধিত নাম, ঠিকানা, কে সই করবে — সব মালিকের কাছ থেকে আসবে।
পূরণ না হওয়া পর্যন্ত সিস্টেম **চালান ছাপতেই অস্বীকার করে**, ভুয়া নম্বর বসিয়ে
দেখতে-সুন্দর একটা কাগজ বানায় না। ভুল BIN বসা চালান ক্রেতার অডিটেও সমস্যা।

**২. সংখ্যা অর্ডার থেকে আসে, নতুন হিসাব থেকে নয়।**
এখানে আবার `subtotal × ১৫%` কষলে ছাড়, ওয়েভার বা রাউন্ডিং থাকলেই সেটা খাতা আর
গ্রাহকের দেওয়া টাকার সাথে নিঃশব্দে মিলবে না — আর চালানই একমাত্র কাগজ যেখানে এটা
কখনো হওয়া চলে না। তাই অর্ডারের নিজের `vatPaisa` লাইনগুলোর মধ্যে ভাগ হয়,
**রাউন্ডিংয়ের অবশিষ্টটা শেষ লাইনে** বসে — যাতে অংশগুলো যোগ করলে সবসময় হুবহু
মোটটাই হয়। লাইনের যোগফল মোটের সাথে না মিললে পরিদর্শকের চোখে ওটাই প্রথমে পড়ে।

**চালান নম্বর = অর্ডার নম্বর।** এক সরবরাহ, এক অর্ডার, এক চালান — অনন্য, আগে থেকেই
ক্রমিক, দুদিক থেকেই খুঁজে পাওয়া যায়, আর আলাদা টেবিল রাখতে হয় না যেটা অর্ডারের
সাথে বেমিল হয়ে যেতে পারে।

### যা যোগ হলো
- schema: `FinanceSetting`-এ ৫টা কলাম — নিবন্ধিত নাম, ঠিকানা, VAT circle, সইকারীর নাম ও পদবি (BIN আগেই ছিল)
- `GET /finance/mushak/readiness` · `/mushak/orders` · `/mushak/:orderId`
- `/finance/vat` পর্দা — একবার নিজের তথ্য বসাও, তারপর প্রতিটা VAT বিক্রি এক ক্লিকে ছাপা
- A4 চালান: বাংলা-ইংরেজি দুই ভাষার শিরোনাম, সরবরাহকারী/ক্রেতা ব্লক, লাইন টেবিল (একক · পরিমাণ · একক মূল্য · সম্পূরক শুল্ক · মূসক · মূসকসহ), "কথায়" (লাখ-কোটি রীতিতে), সই ও সিলের জায়গা, print CSS
- BIN ১৩ সংখ্যা না হলে সাথে সাথেই জানায়

### ⚠️ চালানো বাকি
`D:\radian\radian_mushak_migrate.bat` — migration চলেনি (তুমি তখন কম্পিউটার ব্যবহার করছিলে)।
কোড তৈরি ও type-check পরিষ্কার; শুধু ফাইলটা double-click করলেই হবে।

---

# Finance module — সম্পূর্ণ

| ফাঁক | অবস্থা |
|---|---|
| G1 Drift checker | ✅ রাত ২টায় নিজে চলে, ইতিহাস রাখে, Overview-তে ব্যাজ |
| G2 লগইন + PIN | ✅ পুরো প্যানেলে তালা, ৩টা role, People পর্দা |
| G3 মূসক ৬.৩ | ✅ কোড তৈরি — migration চালানো বাকি |
| G4 লোন সংশোধন/মোছা | ✅ posted হলে জমাট, নয়তো মুক্ত |
| G5 মাস বন্ধ | ✅ বাগ সারানো, reopen সহ, settings back door বন্ধ |
| G6 multi-currency · বাজেট · bank import · Employee link | সচেতনভাবে পরে |

**বাকি শুধু মালিকের ডেটা:** practice ডেটা মুছে আসল opening balance, প্রতিটা খরচে
fixed/variable, আর drift পর্দার ৪টা লাল দাগ। তালিকাটা সিস্টেম নিজেই দিচ্ছে।

### §34ক — মূসক ৬.৩ migration চলেছে ও যাচাই হয়েছে (২৮ জুলাই ২০২৬)

`20260727190500_mushak_business_details` প্রয়োগ হয়েছে।

| পরীক্ষা | ফল |
|---|---|
| `/finance/mushak/readiness` | 200 · `ready:false` · বাকি ৪টা ঠিকঠাক নাম ধরে বলছে ✅ |
| `/finance/mushak/orders` | 200 · 0 (VAT এখনো বন্ধ, তাই সঠিক) ✅ |
| তথ্য ছাড়া চালান চাওয়া (RAD-56927) | **400** — "still needed: BIN, name, address, signatory" ✅ |
| `/finance/vat` পর্দা | দুটো ব্যানার (VAT বন্ধ · কী কী বাকি), ফর্ম, খালি তালিকা ✅ |
| "কথায়" রূপান্তর | ০ · ১ পয়সা · ১ টাকা · ১ হাজার · ১ লাখ · **১ কোটি** · ১২ কোটি — লাখ-কোটি রীতিতে সঠিক ✅ |
| VAT ভাগ (২০,০০০ এলোমেলো অর্ডার) | প্রতিটাতেই অংশের যোগফল = মোট, কোনো ঋণাত্মক অংশ নেই ✅ |

**যা ইচ্ছে করে পরীক্ষা করিনি:** ভুয়া BIN দিয়ে চালান ছাপা। তোমার বইয়ে বানানো
নিবন্ধন তথ্য বসাতে চাইনি — নম্বর দিলে প্রথম আসল চালানটা একসাথে দেখে নেব।

---

## §35 — Item module: প্রথম review pass (৩০ জুলাই ২০২৬)

**কেন এখন:** পুরো system-এ ২১টা module-এর মধ্যে **মাত্র ৩টায়** self-test ছিল (HR ·
Marketing · Intelligence), অথচ নিজেদের নিয়মেই লেখা — "প্রতি module একটা self-test দিয়ে
শেষ হবে" (`RADIAN_MODULE_PRIORITY.md` §৪)। Item সবচেয়ে পুরনো module, একবারও review হয়নি,
আর তার cost-এর উপরেই Purchase · Inventory · Assembly · Finance সবাই দাঁড়িয়ে। তাই এখান
থেকেই শুরু।

**architecture-review skill দিয়ে পাস — ৮টা ফাঁক ধরা ও সারানো** (schema বদলায়নি,
কোড-only):

| # | তীব্রতা | কী ভুল ছিল |
|---|---|---|
| ITM-REV-1 | 🔴 | `purge()`-এর বেড়ায় **১৩টার মধ্যে ৩টা** relation দেখা হতো। PurchaseLine · InventoryStock · InventoryMovement · transfer/issue/stocktake line · ItemExpiryLot · ৩টা Assembly table — সবগুলোই **required FK**, একটাও শূন্য না থাকলে `prisma.item.delete()` raw **P2003 → 500**, তা-ও user SKU টাইপ করে নিশ্চিত করার *পরে*। এখন প্রতিটা relation নাম ধরে গোনা হয় ও পড়ার মতো বাক্যে বলা হয় |
| ITM-REV-2 | 🟠 | assembled item soft-delete করলে **তার নিজের recipe line গুলো বেঁচে থাকত**। `usedIn` জীবিত *line* গোনে, জীবিত *parent* না — তাই ট্র্যাশে পড়ে থাকা তোড়ার গোলাপ চিরকাল "ingredient in 1 recipe" বলে অ-মোছনীয় থাকত। ২১ জুলাইয়ের "৮৬টার ৭১টা ডিলিট হয় না" বাগের হুবহু একই আকার |
| ITM-REV-8 | 🟠 | উল্টো দিক: item-এর **নিজের** line গুলো purge আটকাত। ওগুলো সন্তান, নির্ভরতা নয় (`usedIn` নির্ভরতা)। ফলে recipe আছে এমন কোনো item কোনোদিন purge হতো না — আর ITM-REV-2 ফিক্সের পর সেটা **স্থায়ী** হয়ে যেত, কারণ গোনা হয় raw client-এ আর ট্র্যাশ পর্দা থেকে recipe-এ পৌঁছানোর পথ নেই |
| ITM-REV-3 | 🟠 | `update()` roll-up চালানোর **আগের** row ফেরত দিত → save-এর পর পর্দায় পুরনো cost/floor, পরের reload-এ ঠিক। যে ভুল সংখ্যা কেউ বাগ বলে জানায় না, শুধু ওই কলামে বিশ্বাস করা ছেড়ে দেয় |
| ITM-REV-4 | 🟠 | `create()` `hasRecipe = null` পাঠাত → ITM-R02 নিষ্ক্রিয় → খালি recipe নিয়ে `MAKE_TO_STOCK` item তৈরি হতে পারত, যা Assembly board-এ বানানো-যায় হিসেবে পড়ে |
| ITM-REV-5 | 🟡 | গভীরতা মাপা হতো শুধু **নিচের দিকে**; parent আগে থেকে কত গভীরে বসা তা গোনা হতো না। এক লাইন করে যোগ করলে MAX_DEPTH পেরিয়ে যেত — আর `rollUpFrom` ওই সীমায় **চুপচাপ থেমে যায়**, তাই error দিত না, শুধু মাঝপথে cost ভুল হয়ে যেত |
| ITM-REV-6 | 🟡 | `unitId` যাচাই হতো, কিন্তু `itemCategoryId`/`brandId`/`supplierId` না → বাসি id মানেই raw P2003 **500**, ফর্মে টাইপ করা সব হারিয়ে যেত |
| ITM-REV-7 | 🟡 | `remove(detach)` `prisma.db.product` ব্যবহার করত, যা soft-deleted product লুকায় → ট্র্যাশের product `itemId` ধরে রাখত → purge চিরকাল "1 product(s) still point at it" বলত, এমন product-এর নাম করে যা user দেখতেই পায় না |

**নতুন:** `apps/api/src/items/items.selftest.ts` — hr.selftest.ts-এর ছাঁচে। প্রতিটা
ফিক্স **নাম ধরে** assert করা, তাই কোনোটা তুলে নিলে ফাইলটা লাল হবে। ITM-REV-1-এর
assertion কোড পড়ে ১৩টা relation-ই বেড়ায় আছে কিনা মেলায় — নতুন table যোগ হয়ে বেড়ায় না
উঠলে test ধরবে।

সব row-এর SKU `ZZSELFTEST` দিয়ে শুরু; cleanup আগে-পরে দুইবার চলে, শুধু ওই prefix মেলায়,
আর raw client-এ hard delete করে (ট্র্যাশেও কিছু থাকে না)।

**চালাতে:** schema বদলায়নি → `radian_api_rebuild.bat` → **`radian_item_selftest.bat`**।

**যা ইচ্ছে করে করিনি:** purchase/stock/order row বানিয়ে ITM-REV-1-এর বেড়া ঠেলে দেখা।
ভুয়া ক্রয় ও স্টক ইতিহাস তোমার বইয়ে বসাতে চাইনি — তাই ওই fence গুলো কোডপথ পড়ে assert
করা হয়েছে, বানানো ইতিহাস দিয়ে নয়।

---

## §36 — Purchase module: প্রথম review pass (৩০ জুলাই ২০২৬)

**৯টা ফাঁক ধরা ও সারানো** (schema বদলায়নি, কোড-only)। এর মধ্যে একটা এই পুরো
review অভিযানে পাওয়া **সবচেয়ে বড় বাগ**।

### 🔴 PUR-REV-1 — QUICK purchase কোনোদিন হিসাবের খাতায় ওঠেনি

`onPurchaseReceived()`-এর caller ছিল **একটাই** — `receive()`। কিন্তু QUICK purchase
কখনো `receive()`-এ যায় না; সে `create()`-এ **জন্মায়ই `RECEIVED` হয়ে**, কারণ quick
mode-এর মানেই তাই ("কামাল মামা, শাহবাগ, মাল ভ্যানে")। আর quick mode-ই মালিকের
স্বাভাবিক পথ।

ফল: **যত quick purchase হয়েছে সব স্টক আর moving average আপডেট করেছে, কিন্তু একটাও
journal entry লেখেনি।** Finance চালু হওয়ার দিন থেকে inventory value আর supplier
payable — দুটোই ততটাই কম দেখাচ্ছে।

বাইরে থেকে ধরার কোনো উপায় ছিল না: purchase পর্দা ঠিক, stock board ঠিক, AVCO ঠিক।
শুধু খাতা খালি — **আর না-লেখা entry দেখতে হুবহু "এই কেনাটা হয়ইনি"-র মতো।**

### বাকি ৮টা

| # | তীব্রতা | কী ভুল ছিল |
|---|---|---|
| PUR-REV-2 | 🔴 | `receive()` transaction-এর `fullyReceived` ফলটা **ফেলে দিত**, তাই ৩ কিস্তির ডেলিভারির **প্রথম বাক্স** আসতেই পুরো বিল payable হিসেবে বসে যেত। sourceKey `PURCHASE:<id>:received` হওয়ায় পরের দুটো call চুপচাপ duplicate হয়ে যেত — নিজে থেকে শুধরাতও না। কোডের উপরের comment-এই লেখা ছিল "book it once, on full receipt" |
| PUR-REV-3 | 🟠 | Finance call গুলো `void` — fire-and-forget। `safe()` ভেতরে ধরে FinancePostingFailure লেখে, সেটা ঠিক, কিন্তু purchase timeline কিছুই জানত না — অথচ এই ফাইলের **অন্য প্রতিটা** integration await করা ও timeline-এ flag করা |
| PUR-REV-4 | 🟠 | `create()` payment-এর শুধু **ছাদ** দেখত। `amountPaisa: -5000` পাস করত (−5000 < grand) → `paidPaisa` ঋণাত্মক → supplier statement-এ due ফুলে যেত। একই নিয়ম, দুইটা দরজা, একটা খোলা |
| PUR-REV-5 | 🟠 | over-receive check transaction-এর **বাইরে**, আর লেখা হয় `increment` দিয়ে। একসাথে দুটো receive এলে দুটোই পাস করত → ১০০ অর্ডারে **১৮০ received**, আর AVCO এমন quantity-তে ওজন পেত যা আসেইনি |
| PUR-REV-6 | 🟠 | "Due" তালিকা `take: 500`-এর **পরে** filter হতো। ৫০১তম purchase ঢোকার দিন আট মাস আগের না-দেওয়া বিলটা — ঠিক যেটা দরকার — তালিকা থেকে হারিয়ে যেত, আর কিছুই বলত না। **বকেয়া টাকা পুরনো হয়ে বাদ যায় না** |
| PUR-REV-7 | 🟡 | `nextNo()` read-then-write, atomic নয়। বাজারের দিনে তিনজন একসাথে বিল তুললে দুজন একই নম্বর পড়ত → raw **P2002 → 500**, পুরো ফর্ম হারিয়ে যেত। এখন retry (৮ বার); নম্বরের অর্থ শুধু unique ও মোটামুটি বাড়তি, তাই একটা নম্বর ডিঙানোয় কিছু যায়-আসে না |
| PUR-REV-8 | 🟡 | `update()` **snapshot** (`supplierName`) বদলাত, **link** (`supplierId`) না। নাম বদলে অন্য supplier লিখলে পর্দায় "কামাল মামা", অথচ payable/statement/ledger সব **শাহবাগ ট্রেডার্স**-এর। "এই টাকা কার" — দুটো উত্তর, আর পর্দা ভুলটা দেখাত |
| PUR-REV-9 | 🟡 | `afterReceive`-এর catch যে ধাপেই ভাঙুক **"stock NOT updated"** বলত। কিন্তু movement আগে বসে, average পরে — তাই average ভাঙলে বার্তাটা কর্মীকে বলত এমন স্টক যোগ করতে যা **আগেই ঢুকে গেছে**। মানলে **দ্বিগুণ** হতো |

### যা ইচ্ছে করে সারাইনি (architecture project-এর সিদ্ধান্ত লাগবে)

`cancel()` advance-paid purchase বাতিল করতে দেয় (note বাধ্যতামূলক), কিন্তু ওই
payment ইতিমধ্যে `onPurchasePayment` দিয়ে খাতায় উঠে গেছে — **বাতিল করলে ledger
entry reverse হয় না**। এটা Finance-সীমানার নীতি, কোডের ভুল নয়। skill-এর mandatory
sync rule মেনে এখানে নিজে থেকে নিয়ম বানাইনি — architecture project-এ ঠিক হোক।

### নতুন

`apps/api/src/purchases/purchases.selftest.ts` — নিজের ফুল কেনে, আধা-আধি receive
করে, ফেরত দেয়, আর **stock · moving average · ledger তিনটাই এক কথা বলে কিনা** মেলায়।
auto-posting বন্ধ থাকলে ledger assertion গুলো **SKIP** বলে, পাস বলে চালিয়ে দেয় না।
প্রতিটা ফিক্স নাম ধরে assert করা।

সব item-এর SKU `ZZPURTEST`, সব purchase-এর notes `[selftest]`; cleanup আগে-পরে
দুইবার, শুধু ওই দুই চিহ্ন মেলায়, journal entry গুলোও sourceId ধরে তুলে নেয়।

**চালাতে:** schema বদলায়নি → `radian_api_rebuild.bat` → **`radian_purchase_selftest.bat`**

---

## §37 — Inventory module: প্রথম review pass (৩০ জুলাই ২০২৬)

Inventory-র নিজের কোনো পাস কোনোদিন হয়নি — ২৩ জুলাই শুধু Assembly cycle দিয়ে
**পাশ থেকে** যাচাই হয়েছিল। অথচ প্রতিটা module স্টক এখান দিয়েই লেখে।

**৪টা ফাঁক ধরা ও সারানো** (schema বদলায়নি, কোড-only):

| # | তীব্রতা | কী ভুল ছিল |
|---|---|---|
| INV-REV-3 | 🔴 | **নবম singleton — ২৯ জুলাইয়ের ঝাড়ু যেটা মিস করেছে।** `assemblyFloorWarehouseId()` ছিল `findFirst → create`, ঠিক যে আকারটা মারতে `common/singleton.ts` বানানো হয়েছিল। বেঁচে গিয়েছিল কারণ ওই পাসে খোঁজা হয়েছিল `*Setting` accessor, আর এটা একটা **Warehouse** — তাই কারো grep-এ পড়েনি। `Warehouse.code` `@unique`, তাই একসাথে দুটো production শুরু হলে দুটোই floor খুঁজে না পেয়ে insert করত, হেরে-যাওয়াটা **P2002**-এ মরত — আর গোটা production start rollback হতো। Assembly-ই তো সেই জায়গা যেখানে দুজন একসাথে Start চাপে |
| INV-REV-1 | 🟠 | `createIssue()` → `void this.finance.onStockIssue(...)` — fire-and-forget। এই call **টাকা নাড়ায়**: wastage খরচ হয়। খাতায় না উঠলে ঠিক যত ফুল পচেছে ততটাই **মুনাফা বেশি** দেখায় — মালিকের সবচেয়ে দরকারি সংখ্যাটাই। `safe()` FinancePostingFailure লিখত, কিন্তু কেউ সেটা চোখের সামনে আনত না, তাই **নীরব ব্যর্থতা আর "কিছুই নষ্ট হয়নি" দেখতে একরকম** |
| INV-REV-2 | 🟠 | `nextNo()` — Purchase-এর PUR-REV-7-এর হুবহু race, তবে **চারটা** doc type-এ (TRF/WST/GFT/STK)। এখানে খারাপ বেশি: `postAssemblyFinish()` **Assembly-র নিজের transaction-এর ভেতরে** WST নম্বর তোলে, তাই সংঘর্ষ মানে শুধু একটা wastage note হারানো নয় — **আস্ত production finish rollback**, ফুল ব্যবহার হয়ে যাওয়ার পরে |
| INV-REV-4 | 🟠 | `opening()`-এর "untouched" যাচাই transaction-এর **বাইরে**। একসাথে দুটো opening এলে দুটোই পাস করত → **opening stock দ্বিগুণ**। আর OPENING-ই সেই একটা movement যা সৎভাবে ফেরানো যায় না (INV-RULE-012 দ্বিতীয়বার দিতে দেয় না, তাই সংশোধন হতে হয় Adjustment — যা চিরকাল আসল গরমিলের মতো দেখাবে)। ফাইলটা বিপদটা **জানতই**: উপরের `seen` set একই submission-এর ভেতরে এটা আটকায়। শুধু দুই submission-এর মাঝে আটকাত না |

### যা দেখেও ইচ্ছে করে বদলাইনি

- **Stocktake-এর হিসাব ঠিক আছে** — draft-এর snapshot ধরে diff বসানোটা প্রথমে ভুল মনে
  হয়েছিল, কিন্তু মিলিয়ে দেখলাম ওটাই সঠিক: গণনার সময়ের গরমিলটা delta হিসেবে বসে, আর
  মাঝখানে হওয়া আসল বিক্রি অক্ষত থাকে। **বদলালে ভুল হতো।**
- **MAKE_TO_ORDER বিক্রিতে `wastageBp` ধরা হয় না** — recipe-এর দাম wastage ধরে
  (Item-এর `recompute`), কিন্তু স্টক কাটে wastage ছাড়া। দাম আর খরচের এই অমিলটা
  **নীতিগত প্রশ্ন**, কোডের ভুল নয় → architecture project-এ ঠিক হোক।
- **cancel-এ recipe বদলে গেলে revert মেলে না** (AUD-1 পরিবার) — ঠিক করতে হলে "কী কাটা
  হয়েছিল" সংরক্ষণ করতে হবে, অর্থাৎ **schema বদল**। এখানে করিনি।

### নতুন

`apps/api/src/inventory/inventory.selftest.ts` — নিজের গুদাম ও দোকান বানায়, opening
দেয়, transfer করে, নষ্ট ও উপহার দেয়, গোনে ও সংশোধন করে; আর **ইচ্ছে করে নিজের সাথে
race করে** — একসাথে দুটো opening, তিনটা gift note, তিনজন assembly floor চাওয়া।

একটা ব্যতিক্রম খোলাখুলি বলা: §7 assembly floor চায়, তাই যে system-এ কোনোদিন production
হয়নি সেখানে `Warehouse(code: ASSEMBLY)` থেকে যাবে। প্রথম আসল production-ও ঠিক তা-ই
করত, ওতে স্টক থাকে না, আর **ইচ্ছে করে মুছি না** — মুছলে পরের production আরেকটা বানাবে
আর floor দু'ভাগ হয়ে যাবে।

**চালাতে:** schema বদলায়নি → `radian_api_rebuild.bat` → **`radian_inventory_selftest.bat`**

---

## §38 — POS module: প্রথম review pass (৩০ জুলাই ২০২৬)

POS-এর কোনোদিন review হয়নি — `radian_pos_fix.bat` ছিল, কিন্তু সেটা ২৩ জুলাইয়ের
cross-module audit (§২১)-এ ধরা AUD-2 leak-এর ফিক্স, POS-এর নিজের পাস নয়।

**৭টা ফাঁক ধরা ও সারানো** (schema বদলায়নি, কোড-only)। দুটো **টাকা হারায়**, আর দুটোই
কোনো পর্দা থেকে দেখা যায় না।

### 🔴 POS-REV-3 — একই খাতা দুজনে তুললে এক টাকা হাওয়া

`collectDue()` `paidPaisa` লিখত **absolute** হিসেবে (`o.paidPaisa + amount`), মুহূর্ত
আগে পড়া মান ধরে। দুজন cashier একই খাতার টাকা একসাথে তুললে দুজনেই `paidPaisa = 0` পড়ত,
দুজনেই PaymentTransaction বানাত, আর দুজনেই নিজের amount লিখত।

ফল: **ledger-এ দুটো payment, order-এ একটা।** খদ্দের যে টাকা দিয়ে দিয়েছে, সিস্টেম তাকে
সেটা এখনো বাকি দেখাত — আর ledger ও order চিরকাল অমিল, কোনটা সত্যি বলার উপায় নেই।
`increment`-ই এখানে একমাত্র নিরাপদ verb, আর গোটাটা যে tender row গুলো গুনছে তাদের
সাথে **এক transaction-এ** থাকা উচিত।

### 🔴 POS-REV-4 — বাকি টাকার নগদ কোনো ড্রয়ারেই ঢুকত না

নগদটা credit হতো `o.posShiftId`-তে — অর্থাৎ **আসল বিক্রিটা যে shift-এ হয়েছিল**, প্রায়ই
কয়েক সপ্তাহ আগের। আর branch-টা `status === OPEN` দিয়ে পাহারা দেওয়া, তাই **স্বাভাবিক
ক্ষেত্রে** (ওই shift কবেই বন্ধ) শাখাটা কিছুই করত না: খদ্দের আসল নোট হাতে দিত, আর
**কোথাও কিছু লেখা হতো না**।

Close-এ আজকের ড্রয়ার ততটাই বেশি, cashier ব্যাখ্যা করতে পারে না — অথচ over/short
জিনিসটার অস্তিত্বই তো এই কারণে যে **অব্যাখ্যাত টাকা একটা প্রশ্ন**। নগদ যে ড্রয়ারে
শারীরিকভাবে ঢুকেছে সেটারই — মানে **এখন খোলা** shift-এর।

### বাকি ৫টা

| # | তীব্রতা | কী ভুল ছিল |
|---|---|---|
| POS-REV-1 | 🔴 | **আরও তিনটা অরক্ষিত singleton, সবই এই এক ফাইলে** — `posChannelId()` (`Channel.slug` @unique), `walkInCustomerId()` (`Customer.phone` @unique), `registers()` (`PosRegister.code` @unique)। Inventory-র assembly floor ধরে **মোট চারটা** ২৯ জুলাইয়ের ঝাড়ু মিস করেছে, আর সবগুলো **একই কারণে**: ওই পাসে খোঁজা হয়েছিল `*Setting` accessor — অর্থাৎ শিক্ষাটা **আকারে** (settings row) প্রয়োগ হয়েছে, **বিপদে** (@unique কলামের পিছনে যেকোনো lazy-created row) নয়। `registers()` তো till পর্দার **প্রথম** call, dev-এ React effect দুইবার চালায় — মানে প্রতি page load-এ একটা ৫০০ |
| POS-REV-2 | 🔴 | `nextPosNo()` / `nextShiftNo()` — read-then-write race। সিস্টেমে এই ছাঁচ যেখানেই আছে, **POS সবচেয়ে খারাপ জায়গা**: এটাই একমাত্র পর্দা যেখানে দুজন একসাথে, দ্রুত কাজ করার কথা। দুটো counter একই সেকেন্ডে বিক্রি করলে হেরে-যাওয়াটা raw P2002 — **till-এ ৫০০, খদ্দের টাকা হাতে দাঁড়িয়ে** |
| POS-REV-5 | 🟠 | চারটে finance call `void` — fire-and-forget। এটা তো **ক্যাশ রেজিস্টার**: যে বিক্রি খাতায় ওঠে না সে তার revenue, VAT আর COGS নিয়েই চলে যায়, **আর দিনটা তবু মিলে যাওয়ার মতোই দেখায়** |
| POS-REV-6 | 🟠 | tender clamp করা হতো, যাচাই নয় — `Math.max(0, ...)` যোগে আর `if (<= 0) continue` লেখায়। তাই ঋণাত্মক/ভগ্নাংশ tender **নীরবে বাদ** পড়ত: রসিদ ছাপত, ড্রয়ারের হিসাব ওটা ধরত না, কাউকে বলা হতো না। **till খারাপ সংখ্যা ফেরাতে পারে; চুপচাপ ফেলে দিতে পারে না।** আর **overpayment গিলে ফেলত**: ৯০০ টাকার বিলে ১০০০ দিলে paidPaisa 1000 বসে "paid" বলত — ১০০ টাকা ভাংতি ড্রয়ার থেকে বেরোয়, revenue হিসেবে লেখা থাকলে shift ততটাই কম, দোষটা cashier-এর ঘাড়ে |
| POS-REV-7 | 🟡 | `addCashMovement()` amount কখনো যাচাই করত না — শূন্য মানে কিছু-না-বলা row, ভগ্নাংশ মানে paisa কলামে non-integer (**"money path-এ কোনো float নয়"** — এই codebase-এর একমাত্র অলঙ্ঘনীয় শৃঙ্খলা)। দুটোই close-এর expected-cash যোগে সোজা ঢুকে যেত |

### নতুন

`apps/api/src/pos/pos.selftest.ts` — নিজের counter খোলে, paid · split-tender · credit
বিক্রি করে, বাকি তোলে, চা-নাশতার payout দেয়, ড্রয়ার কম গুনে বন্ধ করে। **ইচ্ছে করে
নিজের সাথে race করে**: এক খদ্দেরের বাকি দুজনে একসাথে তোলা, তিনটে বিক্রি একসাথে,
তিনটে till পর্দা একসাথে load।

§10 কোড পড়ে দেখে **একটা `void this.finance` ফিরে এসেছে কিনা** — POS-REV-5 তুলে নিলে
লাল হবে।

খোলা প্রতিটা shift বন্ধ করে যায়, তাই crash হলেও কালকের সকালে till আটকে থাকবে না।

**চালাতে:** schema বদলায়নি → `radian_api_rebuild.bat` → **`radian_pos_selftest.bat`**

---

## §39 — Catalog · Customers · Products review + সিস্টেম-জুড়ে ঝাড়ু (৩০ জুলাই ২০২৬)

আগের চারটে module একই তিন ভুলে বারবার ভেঙেছে দেখে এবার **প্রতিটা ফাইল পড়ার বদলে
সিস্টেম-জুড়ে তিনটে প্যাটার্ন খুঁজেছি**। ঝাড়ুটাই এই পাসের আসল কাজ।

### 🔴 CUS-REV-1 — WALK-IN customer মুছে ফেলা যেত, আর তাতে till চিরতরে অচল

'WALK-IN' সেই system customer, যার নামে প্রতিটা anonymous counter sale বসে
(DEC-POS-007)। **কিছুই এটাকে পাহারা দিত না।** মুছে ফেলার পর:

1. POS খোঁজে `prisma.db` দিয়ে, যা soft-deleted row লুকায় → পায় না
2. তাই বানাতে যায় → মুছে ফেলা row-টা এখনো `'WALK-IN'` ধরে রেখেছে @unique index-এ → **P2002**
3. তাই **প্রতিটা walk-in বিক্রি ৫০০ দেয়, চিরকাল** — আর ফেরার একমাত্র পথ Restore,
   অথচ POS-এর কোনো error বার্তায় "customer" শব্দটাই নেই

যে row-এর উপর software নাম ধরে নির্ভর করে, সেটা operator-এর মোছার জিনিস নয়।

### 🟠 CUS-REV-2 · PRD-REV-1 — মুছে ফেলা phone/slug "ফাঁকা" দেখাত

`ensurePhoneFree` আর `ensureSlugFree` দুটোই পড়ত `prisma.db` দিয়ে, যা `deletedAt: null`
filter করে। তাই ট্র্যাশে থাকা row-এর নম্বর/slug **ফাঁকা দেখাত**: যাচাই পাস করত, insert
unique index-এ গিয়ে মরত, আর user পেত **raw P2002 → ৫০০, বার্তা ছাড়া** — এমন একটা নম্বরের
জন্য যেটা সিস্টেম নিজেই এক সেকেন্ড আগে "পাওয়া যাবে" বলেছে।

Item-এর `freeSku()` জুলাই থেকেই raw client ব্যবহার করে **ঠিক এই কারণেই** ("unique across
the whole system, deleted rows included")। **শিক্ষাটা কখনো module-এর সীমানা পেরোয়নি।**

slug-টা আরো গুরুত্বপূর্ণ: ওটা storefront URL। চুপচাপ পুনর্ব্যবহার করলে পুরনো link,
পুরনো Meta ad আর পুরনো WhatsApp forward **ভুল product-এ** গিয়ে পড়ত।

### 🟠 CUS-REV-3 — বাকি টাকা লুকিয়ে ফেলা যেত

Customers-এ **কোনো dependency check ছিল না** — Item যেমন "কারো recipe-তে আছে" বলে আটকায়,
তেমন কিছুই না। অপরিশোধিত POS বিল থাকা খদ্দেরকে মুছে ফেলা যেত, আর তখন টাকা পাওনা থাকত
এমন কারো কাছে **যে আর কোনো পর্দায় নেই** — অথচ due board-এ নামটা দেখাত, কারণ nested
`include` soft-delete filter হয় না।

### ঝাড়ুর ফল — শিক্ষাটা ভুল জিনিসে প্রয়োগ হয়েছিল

২৯ জুলাই আটটা singleton সারানো হয়, আর লেখা হয় *"eight hand-written catch blocks would
drift apart again"* — helper বানানোর সিদ্ধান্তটা **ঠিক ছিল**। ভুল ছিল **কী খোঁজা হবে**:
ওই পাসে grep হয়েছিল `*Setting` accessor। অর্থাৎ শিক্ষাটা প্রয়োগ হয়েছে **আকারে**
(settings row), **বিপদে** নয় (**@unique কলামের পিছনে যেকোনো lazy-create**)।

তাই **সাতটা** বেঁচে গিয়েছিল:

| # | কোথায় | কী |
|---|---|---|
| ১ | Inventory | `Warehouse(code: ASSEMBLY)` — §37 |
| ২ | POS | `Channel(slug: pos)` — §38 |
| ৩ | POS | `Customer(phone: WALK-IN)` — §38 |
| ৪ | POS | `Customer(phone)` — নতুন খদ্দেরের নম্বর; **প্রথম পাসে আমি নিজেই মিস করেছি**, ঝাড়ু ধরেছে |
| ৫ | POS | `PosRegister(code: COUNTER-1)` — §38 |
| ৬ | Catalog | `TagGroup(slug)` — CAT-REV-1 |
| ৭ | Supplier | `SupplierType(name)` — SUP-REV-8 |

**সাতটাই এখন `ensureSingleton`-এ।** আর `masters.selftest.ts` §6 প্রতি রানে **পুরো
`src/` হেঁটে** খোঁজে নতুন কোনো অরক্ষিত lazy-create ঢুকেছে কিনা — অষ্টমটা এলে লাল হবে।
এবার শিক্ষাটা বিপদের সাথেই বাঁধা, আকারের সাথে নয়।

### ঝাড়ুতে ধরা, এখনো সারানো হয়নি — পরের module গুলোয়

**৯টা fire-and-forget finance call**, আর তিনটাই **আগে "review-fixed" বলে চিহ্নিত** module-এ:

| Module | কতটা | কোথায় |
|---|---|---|
| Orders (Sales) | ৬ | `onOrderStockOut` · `onOrderStockReverted` · `onOrderDelivered` · COD · refund · payment |
| Returns | ২ | `onReturnCompleted` · refund payment |
| Supplier | ১ | `onSupplierPayment` |

Sales-এর ১৭ জুলাইয়ের review (৫ critical + ৬ major) এগুলো ধরেনি, কারণ তখন Finance
module-ই ছিল না — hook গুলো পরে যোগ হয়েছে, আর **পুরনো review আবার চালানো হয়নি**।
এগুলো ওই module গুলোর পাসে সারানো হবে।

### নতুন

`apps/api/src/catalog/masters.selftest.ts` — তিনটে module একসাথে, **আর ঝাড়ুটা নিজেই
একটা assertion** (§6)। আসল WALK-IN customer কখনো মোছে না, শুধু যাচাই করে যে **মোছা যায় না**।

**চালাতে:** schema বদলায়নি → `radian_api_rebuild.bat` → **`radian_masters_selftest.bat`**

---

## §40 — Sales · Returns · Supplier: ঝাড়ুর ফলো-আপ (৩০ জুলাই ২০২৬)

তিনটেই **আগেই "review-fixed"** বলে চিহ্নিত ছিল — Sales ১৭ জুলাই (৫ critical + ৬ major),
Returns ও Supplier ২৩ জুলাই। তবু ৩০ জুলাইয়ের ঝাড়ু এখানে **৯টা fire-and-forget finance
call** পেয়েছে, আর Sales-এ **দুটো lost update** — একটা POS-এ পাওয়াটার হুবহু যমজ।

### কেন পুরনো review গুলো এগুলো ধরেনি

**ওই review গুলোর সময় Finance module-ই ছিল না।** Hook গুলো পরে যোগ হয়েছে, আর পুরনো
review আবার চালানো হয়নি।

এই পুরো অভিযানের **সবচেয়ে দরকারি শিক্ষা** এটাই: একটা module "reviewed" — কেবল **যেদিন
review হয়েছিল সেদিন পর্যন্ত**। পরে যে module-এর উপর সে নির্ভরতা তৈরি করে, **সেটাই তাকে
আবার খুলে দেয়**।

### 🔴 ORD-REV-2 — একই order-এ দুটো payment এলে একটা হারিয়ে যেত

`recordPayment()` transaction row লিখত, তারপর `paidPaisa` **absolute** হিসেবে আগে-পড়া
`o` থেকে গুনে লিখত। ফোনে advance নেওয়ার মুহূর্তে rider COD mark করলে — যা একটা
**সাধারণ শুক্রবার** — দুটোই একই `o.paidPaisa` পড়ত, দুটোই PaymentTransaction বানাত,
দুটোই নিজের total লিখত।

ফল: payment ledger-এ দুটো row, order-এ একটা। খদ্দের যা দিয়েছে তা এখনো বাকি দেখাত, আর
**পরে বলার উপায় নেই কোন সংখ্যাটা সত্যি**।

### 🔴 ORD-REV-3 — delivery একই মুহূর্তের payment মুছে দিত

`delivered()` `o.paidPaisa + outstanding` লিখত, transaction খোলার **আগে** পড়া row থেকে।
এক-বারের transition, তাই নিরাপদ **দেখাত** — কিন্তু delivered mark করার মুহূর্তে ফোনে
advance বসলে সেটা চুপচাপ মুছে যেত।

আর এটা **ORD-REV-2 সারানোর পর বেশি সম্ভব হয়ে গিয়েছিল, কম নয়**: `recordPayment` এখন
পরিষ্কারভাবে বসে, আর তারপর এটা এসে সেটাকে সমান করে দেয়। **দুটো আধা-ফিক্স একটার চেয়ে
খারাপ হতে পারে** — তাই একসাথেই সারানো হলো।

### 🟠 ৯টা fire-and-forget finance call

| Module | কতটা | সবচেয়ে খারাপটা |
|---|---|---|
| Orders (Sales) | ৬ | `onOrderDelivered` — যে entry পৌঁছে-যাওয়া parcel-কে টাকায় রূপ দেয় |
| Returns | ২ | `onReturnCompleted` — না বসলে **store-credit liability খাতা থেকেই বাদ**: দোকান খদ্দেরকে মাল পাওনা, অথচ balance sheet বলছে না |
| Supplier | ১ | `onSupplierPayment` — **নয়টার মধ্যে একমাত্র যেটার কোনো fallback নেই।** DEC-FIN-022 বলে SupplierPayment-ই একমাত্র source, PurchasePayment row গুলো ওখানে ইচ্ছে করে বাদ। তাই এটা নীরবে ব্যর্থ হলে **টাকা দোকান থেকে বেরিয়ে গেছে আর কোথাও কিছু লেখা নেই** |

সিস্টেম-জুড়ে এখন **শূন্যটা** বাকি।

### একটা টেস্ট ইচ্ছে করে লিখিনি — এবং সেটাই ঠিক সিদ্ধান্ত

lost update ধরার জন্য একটা source-sweep লিখেছিলাম (running money total-এ absolute
write খোঁজা)। প্রথম রানেই সে **চারটে জায়গা ধরল, যার তিনটে ঠিক** — একটা প্রাথমিক
`create`, একটা per-LINE refund, আর একটা report-এর জন্য বানানো plain object।

**চার বারে তিন বার ভুল ডাক দেওয়া check কোনো test নয়, ওটা noise** — যা কিছুদিনেই সবাই
উপেক্ষা করতে শুরু করে, অর্থাৎ ঠিক সেই "green for the wrong reason" ফাঁদ যা এই পাসে
বারবার পেয়েছি। running total আর প্রথম write আলাদা করতে যে type-তথ্য লাগে, regex-এর
কাছে সেটা নেই।

তাই চতুর্থটা ধরার পাহারা হলো **§1-এর আসল behavioural test**, grep নয়। `void
this.finance` ঝাড়ুটা থাকল — ওটা নিখুঁত, false positive দেয় না।

### নতুন

`apps/api/src/orders/sales.selftest.ts` — §4 কোনো behaviour পরীক্ষা করে না, **পুরো
source tree হেঁটে** দেখে কোনো finance/inventory hand-off আবার fire-and-forget হয়েছে কিনা।

**চালাতে:** schema বদলায়নি → `radian_api_rebuild.bat` → **`radian_sales_selftest.bat`**

---

## §41 — Audit · Content review (৩০ জুলাই ২০২৬)

### 🔴 AUD-REV-1 — audit লেখা যে কাজটা লিপিবদ্ধ করছে, সেটাকেই ব্যর্থ করে দিত

Audit সেই module যার ভেতর দিয়ে **বাকি সব module লেখে** — প্রায় একশো call site — আর
এটার কোনোদিন review হয়নি।

প্রতিটা caller-এর ছাঁচ একই:

```
await this.prisma.db.purchase.create(...)   // commit হয়ে গেছে, আসল, শেষ
await this.audit.record(...)                // ← throw ⇒ HTTP 500
```

এখানে ব্যর্থতা **কিছুই ফেরাতে পারে না**। শুধু এমন কাজের জন্য user-কে ৫০০ ফেরত দিতে পারে
যা আসলে **সফল হয়েছে** — আর user তখন সেই একটা কাজই করে যা পরিস্থিতি খারাপ করে: **আবার Save
চাপে**। `purchases.create()`-এ তার মানে **দ্বিগুণ purchase, দ্বিগুণ স্টক, দ্বিগুণ ledger
entry**।

কারণটা কাল্পনিক নয়: `changes` typed `Record<string, unknown>`, আর call site গুলো DTO
সোজা ঢেলে দেয় (`changes: { ...dto }`)। `Prisma.InputJsonValue` **BigInt বা Date নেয় না**
— আর `Customer.ltvPaisa` **একটা BigInt**, যা shaped object-এর ভেতরে ঘোরে।

### ফিক্সের আকার — এবং কেন এটা finance ফিক্সের ঠিক উল্টো ছবি

* **FINANCE hand-off কখনো নীরব হতে পারে না** — টাকা নড়েছে, খাতাকে জানতে হবে। তাই
  ওগুলো await করা, আর ব্যর্থতা entity-র timeline-এ লেখা।
* **AUDIT লেখা কখনো fatal হতে পারে না** — কাজ তো হয়েই গেছে; response আটকে দিলে
  **record-টাও নষ্ট হয়, আর retry-তে ডেটাও নষ্ট হয়**।

দুটোই ভুল ছিল, **বিপরীত দিকে, একই কারণে**: ব্যর্থতার মানে কী — সেটা কেউ ঠিক করেনি।

নীরবও নয়: প্রতিটা ব্যর্থতা entity ধরে error level-এ log হয়, container log-এ grep করা যায়।

**একটা ব্যতিক্রম ইচ্ছে করে রাখা** — `ItemsService.purge()` তার trace লেখে **row ধ্বংস
করার আগে**, আর ওর comment-এ জুলাই থেকেই লেখা: *"if the audit write fails we would
rather keep the row than lose it silently"*। ওখানে throw করাটাই **ঠিক**, তাই ওটা
`recordOrThrow()` দিয়ে যায় — ফিক্সটা যেন চুপচাপ সেটা কেড়ে না নেয়।

**⚠️ যা বাকি, schema সিদ্ধান্ত লাগবে:** audit-ব্যর্থতার কোনো টেকসই table নেই। Finance-এর
`FinancePostingFailure` আছে, replay পর্দাও আছে; audit-এর আছে container log, যা rotate হয়।
একই আকারের `AuditFailure` table-ই এই ফিক্সের সৎ সমাপ্তি — **এখানে নিজে থেকে বানাইনি**।

### 🟡 AUD-REV-2 — timeline অসীম ছিল

`findMany` কোনো `take` ছাড়া। মাসের পর মাস edit-paid-refund-redeliver হওয়া order তার
detail পর্দার **প্রতিটা load-এ** এতদিনের সব row ফেরত দিত। timeline উপর থেকে পড়া হয়;
লেজটা এমন ইতিহাস যা কেউ scroll করে না। এখন default ২০০, সর্বোচ্চ ৫০০।

### ~~Audit-এর backend সম্পূর্ণ — শুধু পর্দা নেই~~ → **ভুল দাবি, ৩০ জুলাই সংশোধিত**

backend সম্পর্কে যা লিখেছিলাম তা ঠিক: `list` · `activity` · `facets` · `stats` ·
`backups` · `forEntity`, ছ'টা route সচল, `AuditModule` AppModule-এ যোগ করা।

**কিন্তু "পর্দা নেই" দাবিটা ভুল ছিল।** পর্দা আছে, দুই জায়গায়:

- `apps/admin/app/settings/audit/page.tsx`
- `apps/admin/app/administration/audit/page.tsx`
- `apps/admin/app/_components/AuditView.tsx`

কীভাবে ভুল করলাম, লিখে রাখছি কারণ ভুলটার ধরনই শিক্ষা: `apps/admin/app/`-এর
**top-level** তালিকা দেখে `audit` ফোল্ডার না পেয়ে সিদ্ধান্ত নিয়েছি। পর্দাটা
`settings/` আর `administration/`-এর **ভেতরে**। এক ধাপ গভীরে না তাকিয়ে
"মিলিয়ে দেখেছি" বলে দাবি করেছি — অর্থাৎ এই গোটা review-তে যে ভুলটা বারবার ধরেছি
(**অনুমানকে যাচাই বলে চালানো**), সেটাই নিজে করেছি।

`RADIAN_MODULE_PRIORITY.md`-এর *"Audit Logs — one screen over data that already
exists"* লাইনটাও তাই **বাসি** — কাজটা হয়ে গেছে।

### 🟠 CON-REV-1 — খণ্ডন হয়ে যাওয়া সমাধানই নতুন ফাইলে ছড়িয়েছে

`content/content.service.ts`-এর `ensureLegal()` `upsert` ব্যবহার করত, আর নিজের
comment-এ যুক্তি দিত: *"for the same reason the settings singletons use it"*।

**ঠিক এই যুক্তিটাই খণ্ডন করার জন্য `common/singleton.ts` লেখা হয়েছিল** — এবং content
ফাইলটা ওই খণ্ডনের **পরে** লেখা:

> *"The advice was right about the disease and wrong about the cure."*

তাই এটা নিছক আরেকটা instance নয় — এটা **খণ্ডিত সমাধান খণ্ডনের পরেও নতুন ফাইলে ছড়িয়ে
পড়া**, আর সাথে এমন comment যা তাকে **মীমাংসিত সত্য** বলে দাবি করছে। একটা ভুল ধারণা এভাবেই
নিজের সংশোধনকে টিকে যায়: **সেটা কারণ হিসেবে লিখে রাখা হয়।**

**তবে ন্যায্য কথাটাও বলা দরকার:** এই ফাইল কঠিন জিনিসটা **ঠিক** করেছে — slug clash যাচাই
raw client-এ (`this.prisma.contentPage.findUnique`), তাই ট্র্যাশে থাকা address সঠিকভাবে
"দখল" দেখায়। ঠিক যে শৃঙ্খলাটা Customer আর Product **দুটোতেই ছিল না** (CUS-REV-2 / PRD-REV-1)।

### 🟢 CON-REV-2 — পুরো ফাইলটাই unreachable

৩৯৫ লাইন, **কেউ import করে না** — module নেই, controller নেই, route নেই।
**ফিক্স করিনি, তথ্য হিসেবে লিপিবদ্ধ করলাম:** architecture (`FINAL_REVISION_TODO` §৪) বলছে
Content **Ecommerce-এর** অধীনে যাবে, তাই এখানে module বানানো মানে **scope বানানো**।

### নতুন

`apps/api/src/audit/audit.selftest.ts` — BigInt · circular object · ভুল enum দিয়ে
audit লেখা ভাঙার চেষ্টা করে, আর দেখে caller টিকে থাকে কিনা; আর §3-এ দেখে **strict
ব্যতিক্রমটা এখনো throw করে**।

লেখার সময় নিজের একটা assertion **ভুল কারণে লাল** হচ্ছিল — ফিক্সের নিজের ব্যাখ্যাতেই
`recordOrThrow` শব্দটা আছে, তাই কাঁচা text গুনলে দুটো পাওয়া যায়। comment ছেঁটে গোনা হয়।
**ঠিক এই ফাঁদটাই এই গোটা review-তে বারবার পেয়েছি**, তাই নিজের টেস্টে সেটা রেখে দেওয়া
যেত না।

**চালাতে:** schema বদলায়নি → `radian_api_rebuild.bat` → **`radian_audit_selftest.bat`**

---

## §42 — বাকি খোলা কাজ তিনটে বন্ধ (৩০ জুলাই ২০২৬)

`RADIAN_FINAL_REVISION_TODO.md`-এর তিনটে carry-over। **একটা আসল কাজ, একটা আসল বাগ,
আর একটা বাসি নথি।**

### ✅ DEC-INT-003(a) — on-time delivery এখন একটা আসল সংখ্যা

`Order.promisedBy` **ছ'জায়গায় পড়া হতো, কোথাও লেখা হতো না**। তাই
`/delivery/performance` ২৯ জুলাই থেকে সৎভাবে বলে আসছিল *"no delivery has a promised
time yet"* — ঠিক, কিন্তু অকেজো।

কারণটাই আসল সমস্যা: `deliveredAt` একটা আসল `DateTime`, কিন্তু **প্রতিশ্রুতি** টিকে আছে
শুধু `Order.date` (String) আর `Order.slotLabel` (String, `"10:00–13:00"`) হিসেবে —
**পড়ার জন্য লেখা টেক্সট, ঘড়ির সাথে মেলানোর জন্য নয়।**

নতুন `orders/promise.ts`, আর তিনটে সিদ্ধান্ত — যার যেকোনোটা অন্যভাবে নিলে সংখ্যাটা
**চুপচাপ ভুল** হয়ে যেত:

1. **জানালার শেষ, শুরু নয়।** "10 AM – 1 PM"-এর পার্সেল ১২:৫৯-এ দিলে **সময়েই** দেওয়া
   হয়েছে। শুরু ধরলে ভালো দিনের বেশিরভাগটাই "দেরি" দেখাত।
2. **বাংলাদেশ সময়, স্পষ্ট করে।** `deliveredAt` UTC-তে জমা, container চলে UTC-তে।
   offset ছাড়া বানালে প্রতিশ্রুতি **ছয় ঘণ্টা** সরে যেত — আর ছয় ঘণ্টা বেশিরভাগ slot-এর
   চেয়ে **চওড়া**, অর্থাৎ **প্রতিটা দেরিতে যাওয়া ডেলিভারি "সময়ে" দেখাত**। যে ভুল সংখ্যা
   তোমার প্রশংসা করে, সেটাই সবচেয়ে বিপজ্জনক। `BD_OFFSET_MS` হুবহু সেই constant যা
   `delivery-analytics` · `finance-drift` · `intelligence` ব্যবহার করে — **producer আর
   consumer একমত না হলে তুলনাটাই অর্থহীন।**
3. **পড়া না গেলে `null`, কখনো অনুমান নয়।** slot label admin-এর বদলানো যায় এমন free
   text। "end of day" অনুমান করলে **প্রতিটা অপাঠ্য label চুপচাপ পাশ নম্বর** পেয়ে যেত।

যাচাই করা shape: `10:00–13:00` · `10:00-13:00` · `10 AM – 1 PM` · `3 PM – 6 PM` ·
`6 PM to 9 PM` · **`12:00 AM sharp` → মধ্যরাত ০০:০০** (Radian-এর midnight delivery) ·
`Same day` → null · `Slot 2` → null।

create **আর** edit — দুটোতেই বসানো: খদ্দের ডেলিভারি সরালে প্রতিশ্রুতিও সরে, নইলে
on-time মাপা হবে এমন তারিখের সাথে যাতে **কেউ আর রাজি নয়**।

**⚠️ একটা shape ইচ্ছে করে ছেড়েছি:** `2 hour delivery` → null। ওর প্রতিশ্রুতি
`placedAt + 2h`, slot নয় — অর্থাৎ **আলাদা business rule**। sync rule মেনে নিজে বানাইনি;
architecture project-এ ঠিক হোক।

### 🔴 NST-REV-1 — payables রিপোর্ট দোকানের দেনা **কম** দেখাচ্ছিল

nested `include` soft-delete extension-এ পৌঁছায় না (extension-এর নিজের comment-এই লেখা)।
`finance-reports` সরবরাহকারী **payables ageing** রিপোর্টে soft-deleted
`PurchasePayment` row-ও `paid`-এ যোগ হতো → `due` **ছোট** আসত।

লক্ষণীয়: **দু'লাইন উপরে** parent query ঠিকঠাক `deletedAt: null` filter করছে। যে লিখেছে
সে soft-delete জানত — nested relation-টা শুধু সে যা-র উপর ভরসা করছিল তার নাগালে ছিল না।

### 🟡 NST-REV-2 — product তালিকায় মুছে ফেলা add-on group দেখাত

আর সেটা **ঠিক সেই লাইনের নিচে** যেখানে `tags: { where: NOT_DELETED }` সঠিকভাবে বসানো।
**বাইরে থেকে এই ফাঁক গুলো এভাবেই দেখায়** — একটা লাইন filter করা, তার নিচেরটা না।

### ঝাড়ুর সৎ হিসাব: ৩০-এর মধ্যে **২৭টা ঠিকই লেখা**

আর ওই ২৭-এর বেশিরভাগে filter বসালে **উল্টো ভাঙত**, কারণ ওই model গুলোয় `deletedAt`
কলামই নেই — **REV-RTN-4 ফাঁদের উল্টো দিক** (StockIssueLine · StocktakeLine ·
JournalLine · PayrollLine · AssemblyProductionLine · VariantValue · AddOnGroupItem ·
SupplierPaymentAllocation)।

এটা বলা দরকার, কারণ "৩০টা সন্দেহভাজন পেয়েছি" শুনতে যত ভয়ঙ্কর, সত্যিটা তত নয় — আর
**অন্ধভাবে তিরিশটা "ফিক্স" করলে আটটা module ভাঙত।**

### 📄 §7c বাসি নথি ছিল — দুটোই আগেই সারানো

দুটো type error **আগেই সারানো, আর প্রতিটায় কারণ লেখা comment আছে**:
`employees.mask()` এখন `T & { privateHidden?: true }` ফেরায় (*"the test was right and
the type was wrong"*), আর `gotPoints` `?? 0` — সাথে নোট যে এটা কিছু চাপা দিচ্ছে না,
কারণ assertion এখনো `> 0` দাবি করে।

অর্থাৎ ওই section-টা **নিজের §7d শিক্ষার শিকার**: *"documenting a limitation for ever
is how a system fills up with footnotes nobody reads."* TODO ফাইলে strike-through
করা হলো, নিজের নিয়ম মেনে।

**চালাতে:** schema বদলায়নি → `radian_api_rebuild.bat` → **`radian_sales_selftest.bat`**
(§6-এ promise parser-এর ৯টা check যোগ হয়েছে)

---

## §43 — API পড়ে গিয়েছিল: কারণ বাসি Prisma client (৩০ জুলাই ২০২৬)

rebuild-এর পর প্যানেল "The API is not answering" দেখাচ্ছিল। container-এর লগে
`soft-delete.extension.ts:110` থেকে গুচ্ছের `TS1005: ',' expected` — অর্থাৎ বাংলা comment
কোড হিসেবে পড়া হচ্ছে।

### যা আসলে হয়েছিল

লগটা **বিভ্রান্তিকর** ছিল। ডিস্কের ফাইল একেবারে ঠিক — TypeScript-এর নিজের parser দিয়ে
`src/`-এর **১৫১টা ফাইল** স্ক্যান করে **শূন্যটা** syntax error পেয়েছি। ওই crash-এর অবস্থা
আর ডিস্কে নেই; লগে পুরনো crash-loop-এর লাইন দেখাচ্ছিল।

আসল কারণ ভিন্ন, আর একটাই:

**`prisma/schema.prisma`-তে পাঁচটা নতুন model আছে, generated client-এ নেই।**

| | schema-তে | client-এ |
|---|---|---|
| `Position` · `AccessNode` · `PositionAccess` · `UserAccessOverride` · `CompanySetting` | ✅ আছে | ❌ নেই |
| `AppUser.positionId` · `AppUser.email` | ✅ আছে | ❌ নেই |

`node_modules/.prisma/client/index.d.ts` তারিখ **২৯ জুলাই ২০:২৬**, অথচ migration
ফোল্ডারগুলো **৩০ জুলাইয়ের**: `20260730013000_administration` ·
`20260730170000_company_settings` · `20260730193000_integrations` ·
`20260730203000_integrations_all` · `20260730203100_integrations_carry_keys`।

অর্থাৎ **model যোগ হয়েছে, `prisma generate` চলেনি**। ফলে ১০১টা type error, সবগুলো একই
আকারের — *"Property 'companySetting' does not exist on type PrismaService"*।

### এটা এই review অভিযানের কাজ নয়

`soft-delete.extension.ts` আমি এই পুরো ৯ পাসে **একবারও লিখিনি**, শুধু পড়েছি। আর ১০১টা
error-এর অবস্থান:

| ফাইল | error |
|---|---|
| `administration/access.service.ts` | 28 |
| `administration/people.service.ts` | 25 |
| `administration/registry.service.ts` | 15 |
| `administration/integrations.service.ts` | 14 |
| `administration/company.service.ts` | 11 |
| `administration/system.service.ts` | 6 |
| `finance/finance-mushak.service.ts` | 1 (`companySetting`) |
| `auth/auth.service.ts` | 1 (`AppUser.email`) |
| **আমার ৯ পাসের service ফাইল** | **0** |

**আজ Radian-এ দুটো আলাদা session কাজ করেছে** — একটা এই review, আরেকটা Administration +
Integrations module। দুটোরই পরিবর্তন একই গাছে মিশে আছে, তাই `git diff` দুটোই দেখাবে।
এটা লিখে রাখা দরকার, নইলে পরে দোষারোপ ভুল জায়গায় যাবে।

### আমার নিজের কাজে যা পাওয়া গেল ও সারানো হলো

`tsc` চালিয়ে **আমার ফাইলে ৩টা type error** পেয়েছি — তিনটেই **self-test ফাইলে**, একটাও
service কোডে নয়:

| ফাইল | কী | সারানো |
|---|---|---|
| `pos.selftest.ts` | `CreatePosSaleDto`-তে `payMode` **required**, ৩টা call-এ দিইনি | তিনটেতেই `payMode: 'full'` |
| `sales.selftest.ts` | method-এর নাম `addPayment()`, আমি `recordPayment()` ধরে নিয়েছিলাম (৬ জায়গায়) | নাম ঠিক করা, comment-ও |
| `items.selftest.ts` | `chain` টাইপ করেছিলাম `{id}[]`, কিন্তু `.sku` পড়ছিলাম | টাইপ চওড়া করা |

তিনটেই **API-র বাইরে** (`tsconfig.build.json` self-test বাদ দেয়), তাই এগুলোর কোনোটাই
API পড়ে যাওয়ার কারণ নয় — শুধু ওই তিনটে `.selftest.bat` চলত না।

**শিক্ষা, নিজের ঘাড়েই:** আমি সারাদিন `node -e` দিয়ে শুধু **syntax parse** করেছি আর
বলেছি "syntax পরিষ্কার" — যা সত্যি ছিল, কিন্তু **type check নয়**। DTO-র required field
বা method-এর নাম parse ধরতেই পারে না। এই গোটা review-তে যে ভুলটা বারবার ধরেছি
(**দুর্বল যাচাইকে যাচাই বলে চালানো**), সেটাই নিজে করেছি — দুইবার (এটা, আর §41-এর
audit পর্দার দাবি)।
