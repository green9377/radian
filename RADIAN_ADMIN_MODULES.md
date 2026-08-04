# Radian — Admin Panel Module Map + Module-Selection Kickoff

_তৈরি: 15 July 2026। Frontend (`apps/web`) পুরো analysis করে বের করা admin module তালিকা, আর **নতুন chat**-এ কোন module দিয়ে শুরু করব সেই সিদ্ধান্তের guideline। উৎস = frontend `_data/*` + `build_status.md` (locked) + business-context ownership।_

---

## ১. এক নজরে — কীভাবে পড়বে

- Frontend আগেই সব business logic ধরে বসে আছে (mock)। তাই **frontend-ই admin panel-এর spec**।
- প্রতিটা frontend feature একটা **owner module**-এ যায় (One Data One Owner)। নিচে সেই mapping।
- module দুই ভাগ: **🟢 LOCKED** (এখনই backend+admin বানানো যাবে) আর **🟠 NOT LOCKED** (আগে architecture project-এ lock করাতে হবে, তারপর)।

---

## ২. Frontend → Module mapping (evidence সহ)

| Frontend (route / `_data`) | কী ডেটা/feature | Admin module | Domain | Status |
|---|---|---|---|---|
| `/products`, `products.ts` | Product (নাম, দাম, category, occasion, zone, badge, stock, stars) | **Product Management** | Master Data | 🟢 LOCKED |
| `/categories/*`, `categories.ts` | Category + page section/tile/colour/budget/SEO/FAQ | **Category Management** | Master Data | 🟢 LOCKED (structure locked, content admin) |
| `/occasions/*` | Occasion taxonomy (birthday, love, mothersday…) | **Occasion / Tag master** | Master Data | 🟢 LOCKED |
| `productDetails.ts` (PDP) | variant, size, bundle, add-on, spec, craft, trust, video, nature | Core attr → **Product**; presentation (bundle/add-on/section) → **Ecommerce** | Master / Commerce | 🟢 Product / 🟠 PDP presentation |
| `/account/*`, `auth.ts` | Customer + Address | **Customer Management** | Master Data | 🟢 LOCKED |
| `orders.ts`, `order.ts`, `/account/orders`, `/track` | Order lifecycle, status, timeline, gift, reorder | **Sales Management** | Commerce | 🟢 LOCKED |
| `delivery.ts`, `/delivery-info`, checkout | delivery method, slot, capacity, cut-off, zone | **Delivery Management** | Operations | 🟢 LOCKED |
| (implicit) product/size stock | stock গোনা, low-stock | **Inventory** | Operations | 🟢 LOCKED |
| `promo.ts` | coupon (NEW15/RADIAN100/BLOOM500), free-delivery threshold | **Pricing & Offers** | Commerce | 🟢 LOCKED |
| `payment.ts` | payment method (online/COD), prepaid-only rule | **Sales** (method config) + gateway → Admin/Finance | Commerce | 🟢 Sales / gateway config |
| zone (Dhaka / All-BD, courier-safe) | delivery zone নিয়ম | **Delivery** (zone config) | Operations | 🟢 LOCKED |
| `cart.ts`, `/cart`, `useCartStore` | cart | **Ecommerce** | Commerce | 🟠 NOT LOCKED |
| `/checkout`, `useCheckoutStore` | checkout flow | **Ecommerce** | Commerce | 🟠 NOT LOCKED |
| `wishlist.ts`, `/wishlist`, groups | wishlist | **Ecommerce** | Commerce | 🟠 NOT LOCKED |
| `collections.ts`, `/collections/*` | budget tier + themed collection (merchandising) | **Ecommerce / Merchandising** | Commerce | 🟠 NOT LOCKED |
| `search.ts`, `/search` | catalog search | **Ecommerce** (derived, নিজস্ব owner নেই) | Commerce | 🟠 NOT LOCKED |
| `reminders.ts` | occasion reminder (WhatsApp offset) | **CRM / Customer Experience** | Commerce | 🟠 NOT LOCKED |
| reviews (এখন hardcoded 4.9/412) | product review/rating | **CRM / Reviews** (নাকি Google Business) | Commerce | 🟠 undecided |
| `journal.ts`, `/journal/*` | blog article | **Content / Blog CMS** | Marketing | 🟠 NOT started |
| `faq.ts`, `policies.ts`, `/faq /privacy /terms /refund` | FAQ + legal page | **Content / CMS** | Admin/Marketing | 🟠 NOT started |
| `about.ts` (Trade License/BIN/VAT/TIN/DBID + scan) | company profile + legal doc | **Settings / Company profile** | Administration | 🟠 config |
| `contact.ts` | contact channel + reason | **Content + CRM** | Admin | 🟠 |
| `countries.ts` | dial code reference | reference/config | — | config |
| `.env`: SSLCommerz, WhatsApp, Cloudinary, Resend | integration key | **Administration / Integrations** | Admin | config |

---

## ৩. Admin Panel — Fixed module তালিকা

### 🟢 Phase A — এখনই বানানো যায় (LOCKED, frontend-backed)

সবচেয়ে বেশি frontend-নির্ভর, তাই সবচেয়ে বেশি ROI:

| # | Admin module | frontend-এ ওজন | scope (এক লাইনে) |
|---|---|---|---|
| 1 | **Product Management** | ভারী | পণ্য CRUD: নাম, দাম, category, occasion, zone, badge, stock, ছবি |
| 2 | **Category Management** | ভারী | category + page config (section/tile/colour/budget/SEO/FAQ) |
| 3 | **Customer Management** | মাঝারি | customer + address, order history link |
| 4 | **Sales Management** | ভারী | order list, status বদল, timeline, gift, reorder, invoice |
| 5 | **Delivery Management** | ভারী | method, slot + capacity, cut-off, zone, surcharge |
| 6 | **Pricing & Offers** | মাঝারি | coupon, free-delivery threshold, price rule |
| 7 | **Inventory** | হালকা (implicit) | stock per product/size, low-stock alert |

**Supporting locked (back-office, frontend-এ সরাসরি নেই কিন্তু দরকার):**
Unit · Brand · Tax · Supplier · Vendor · Warehouse · Branch · Employee · Purchase · Quality · POS · Returns & Refunds।

### 🟠 Phase B — আগে architecture-এ lock, তারপর admin

| Admin module | কী থাকবে |
|---|---|
| **Ecommerce** | cart, checkout flow, wishlist, PDP presentation (bundle/add-on/section), collections/merchandising, search |
| **CRM / Customer Experience** | occasion reminder, review/rating, contact reason |
| **Content / CMS** | journal/blog, FAQ, legal page (privacy/refund/terms), homepage content |
| **Settings / Company + Integrations** | company legal doc (Trade License/BIN/VAT/TIN/DBID), SSLCommerz/WhatsApp/Cloudinary/Resend key |
| **Marketing & Growth** | campaign, SEO, ads, loyalty (not started) |

---

## ৪. সুপারিশ — কোন module দিয়ে শুরু (সিদ্ধান্ত নতুন chat-এ)

Build sequence (dependency) মানলে সবচেয়ে দ্রুত storefront জ্যান্ত হয় এই ৩টায়:

**Product → Customer → Sales**

কারণ: Product হলে catalog আসল হয়, Customer হলে login/account আসল, Sales হলে অর্ডার আসল ও order-history জ্যান্ত। এই তিনটা শেষ হলেই frontend-এর mock-এর বড় অংশ আসল API-তে চলে যায়। Delivery + Pricing এদের সাথেই লাগে (Sales order-এ delivery method + coupon দরকার), তাই ওই দুটো ঠিক পরেই।

চূড়ান্ত সিদ্ধান্ত তোমার — নতুন chat-এ ঠিক করব।

---

## ৫. নতুন chat Kickoff — Guideline

### ধাপ ০ — যা লোড/পড়তে হবে (এই ক্রমে)
1. **Folder connect:** `D:\radian`
2. **পড়ো:** এই ফাইল (`RADIAN_ADMIN_MODULES.md`) → `RADIAN_BACKEND_HANDOFF.md` → `RADIAN_HANDOFF.md` → `apps/api/SETUP.md`
3. **Skills লোড:** `radian-development-context` (আগে) → `radian-business-context`। module design শুরু করলে: `module-design-template` · `business-rules-writing` · `decision-log-writing` · `architecture-review`
4. **PDP spec দরকার হলে:** `PDP_DATA_CONTRACT.md` (তবে ওটা Ecommerce — এখন build নয়)

### ধাপ ১ — সিদ্ধান্ত (নতুন chat-এর মূল কাজ)
- কোন module প্রথম? (সুপারিশ: **Product**)
- ওই module-এর জন্য frontend-এর কোন `_data` ফাইল spec? (নিচের তালিকা)
- Ecommerce এখন lock করা হবে কি না।

### ধাপ ২ — প্রতি module-এ কাজের ছন্দ (অপরিবর্তনীয়)
**Schema → API/business rules → Frontend swap।**
- প্রতি table-এ: `id`, `createdAt`, `updatedAt`, `deletedAt?` (soft-delete only)
- soft-delete extension enable হবে প্রথম model-এই (`apps/api/SETUP.md` → "Soft-delete extension (model phase)")
- locked rule enforce করলে কোড কমেন্টে `DEC-XXX-NNN` cite
- gap/conflict পেলে থামো, flag করো — redesign architecture project-এ

### ধাপ ৩ — module অনুযায়ী spec ফাইল (কোনটা খুলতে হবে)

| Module প্রথম নিলে | frontend spec ফাইল | swap-point |
|---|---|---|
| **Product** | `_data/products.ts`, `productDetails.ts`, `categories.ts` | `products.ts`, `getProductDetail()` |
| **Customer** | `_data/auth.ts`, `_store/useAuthStore.ts`, `useAddressStore.ts`, `useProfileStore.ts` | `_data/auth.ts` (OTP + /me) |
| **Sales** | `_data/order.ts`, `orders.ts`, `reorder.ts`, `_store/useOrderStore.ts` | `order.ts` (placeOrder), `orders.ts` (GET) |
| **Delivery** | `_data/delivery.ts`, `promo.ts` (free-delivery) | checkout delivery calc |
| **Pricing & Offers** | `_data/promo.ts`, `payment.ts` | coupon apply, payment options |

### ধাপ ৪ — পরিবেশ মনে রাখা
- Backend live চলছে Docker-এ: `postgres` (:5432, healthy) · `api` (NestJS+Prisma, :4000) · `web` (:3000)
- api-তে file-watch polling নেই — কোড বদলালে `docker compose restart api`
- Windows host-এ `next build`/Prisma binary sandbox-এ চলে না — চূড়ান্ত verify হোস্টে
- উত্তর **Bangla script**, concise; user suggest করলেই মেনো না — critically evaluate

---

## ৬.৫ Working style — VISUAL-FIRST (গুরুত্বপূর্ণ)

User marketing-এর মানুষ, software engineer নন। Code পড়ে business logic বোঝা বা সমস্যা খুঁজে বের করা তাঁর জন্য কঠিন — **visually সহজ**। তাই এই project-এ নিয়ম:

- প্রতিটা module-এ **আগে visual** — admin screen-এর mockup, data flow diagram, বা business-rule flow **ছবিতে** দেখাও (show_widget / mockup)। User approve করলে তবেই পেছনে schema/API code।
- Frontend যেভাবে চোখে দেখে দেখে বানানো হয়েছে, admin panel-ও ঠিক সেভাবে — **দেখতে দেখতে decide**।
- business logic ব্যাখ্যা, সমস্যা/gap flag, সমাধান — সব যতটা সম্ভব **ছবি + সহজ Bangla ভাষায়**, jargon কম।
- code দেখানোর দরকার হলে আগে এক লাইনে "এটা কী করছে" সহজ ভাষায় বলো।

## ৭. নতুন chat-এ পেস্ট করার প্রথম মেসেজ (হুবহু কপি করো)

> `D:\radian` folder এই chat-এ connect করো।
> পড়ো এই ক্রমে: `RADIAN_ADMIN_MODULES.md` → `RADIAN_BACKEND_HANDOFF.md` → `RADIAN_HANDOFF.md` → `apps/api/SETUP.md`।
> Skill লোড: `radian-development-context` (আগে), তারপর `radian-business-context`।
>
> আমরা **Product Management** module দিয়ে শুরু করব (তোমার suggested পথ Product → Customer → Sales)।
> আমি marketing-এর মানুষ, engineer নই — তাই **visual-first** চাই: আগে Product admin screen-এর mockup + business-rule flow ছবিতে দেখাও, আমি বুঝে approve করলে তারপর schema → API।
> কাজের ছন্দ: Schema → API → Frontend swap। প্রতি table-এ soft-delete + audit।
>
> শুরু করো: (১) Product module-এর জন্য frontend `_data/products.ts` + `productDetails.ts` + `categories.ts` analysis, (২) Product admin panel কী কী screen/field লাগবে তার একটা visual mockup, (৩) তারপর অপেক্ষা করো আমার approval-এর।

---

## ৬. নমনীয়তা নীতি (তোমার কথা অনুযায়ী)

সব আগে থেকে locked নয় — দরকারে বদলে এগোব। শুধু:
- **শক্ত রাখি (বদলানো ব্যয়বহুল):** One Data One Owner · soft-delete + audit · টাকা = paisa · owner-module flow
- **খোলা রাখি (যখন দরকার বদলাই):** কোন module আগে · scope · UI · কোন feature কখন · integration

এটাই "নমনীয় কিন্তু এলোমেলো নয়"।
