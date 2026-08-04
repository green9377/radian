# নতুন chat-এর নির্দেশনা — Classification module (Categories দিয়ে শুরু)

_হালনাগাদ: 19 July 2026। নিচের **"paste করার মেসেজ"** হুবহু copy করে নতুন chat-এ দাও।_

---

## এক নজরে — এখন কোথায় আছি

**Product Management module পুরো শেষ, সব database-চালিত** (এই chat-এ হয়েছে):

| Screen | অবস্থা |
|---|---|
| Products · Stock · Margin · Health · Bulk · Trash · Funnel · Analysis | ✅ persist |
| Add-ons + group + rule + performance | ✅ persist (`/addons`) |
| Variant templates (colour/photo/text) | ✅ persist (`/variant-attributes`) |
| Upgrade products + performance | ✅ persist (`Product.upgradeOfProductId`) |
| Product editor — variant পিক, add-on auto+manual, upgrade inline, lead time | ✅ |

**তাই এখন Classification শুরু করার সময়** — Product এখনো **mock/hardcoded category**-র উপর দাঁড়িয়ে; আসল Category master দরকার।

---

## কোন module

### A. Classification module (master data) — **এই chat**
| Sub | কাজ | backend আছে? |
|---|---|---|
| **Categories** | category + sub-category গাছ (parent-child)। **সবচেয়ে জরুরি — প্রথমে এটাই** | ✅ পুরো CRUD আছে |
| **Occasions & Tags** | birthday/anniversary + recipient (her/him/parents)। Gift Finder ও occasion page এগুলো দিয়ে চলে | ✅ পুরো CRUD আছে |
| **Brands** | Lindt, Ferrero, Cadbury (chocolate/imported পণ্যে) | ❌ model + API বানাতে হবে |
| **Units** | stem / piece / lb / kg — দাম ও "what's inside" | ❌ model + API বানাতে হবে |

### B. Composition module — **পরের chat** (এখন নয়)
Items/components · Templates · **Media library** (Cloudinary — ছবি স্থায়ী করার জন্য, এখন add-on/variant/product ছবি refresh-এ হারায়)।

**ক্রম:** Categories → Occasions & Tags → Brands → Units।

---

## Categories — backend তৈরি, শুধু frontend বানাতে হবে

**API চালু আছে** (`apps/api/src/catalog/categories.ts`):

| Method | Endpoint | কাজ |
|---|---|---|
| GET | `/categories` | সব — `parent`, `children`, `_count.products` সহ |
| GET | `/categories?parentId=root` | শুধু top-level |
| GET | `/categories?parentId=<id>` | ওই parent-এর children |
| GET | `/categories/:id` | একটা |
| POST | `/categories` | তৈরি |
| PATCH | `/categories/:id` | edit |
| DELETE | `/categories/:id` | soft-delete |

**DTO:** `{ slug, name, parentId?, sortOrder?, isActive? }`
**Prisma model** (`Category`): `id · slug · name · parentId (self-FK, ২ স্তর) · sortOrder · isActive · products[] · soft-delete` — locked (DEC-PRD-001)।

**Tags API-ও তৈরি** (`/tags`): DTO `{ slug, name, type: OCCASION|RECIPIENT, sortOrder?, isActive? }`।

**Brand · Unit model নেই** — schema-তে যোগ করে migration লাগবে।

---

## যা বানাতে হবে (Categories)

1. Admin app-এ নতুন **Classification** section (sidebar-এ Product/Offers-এর মতো, নিজের sub-menu সহ) — অথবা এখনকার sidebar-এর "Categories"/"Occasions & Tags" entry দুটোকে সচল করা।
2. **Categories screen:** গাছ-কাঠামো (parent → sub), inline create/edit, drag বা sort number, প্রতি category-তে **product-count** (`_count.products`), active toggle, soft-delete।
3. admin client (`app/_data/api.ts`)-এ `createCategory/updateCategory/deleteCategory` যোগ (এখন শুধু `listCategories` আছে)।
4. **Product editor-কে আসল category-তে জোড়া** — এখন `CATEGORIES` array hardcoded; ওটা সরিয়ে `/categories` থেকে load করে dropdown/tree, `categoryId` সরাসরি পাঠাও (এখন নাম মিলিয়ে resolve করা হয়, ওটা ভঙ্গুর)।

---

## API-তে যা ইতিমধ্যে আছে (নতুন বানাতে হবে না)

- `/categories` — পুরো CRUD (উপরে)
- `/tags` — পুরো CRUD
- `/products` — Product module (add-on/variant/upgrade সহ, সব persist)
- `/addons`, `/variant-attributes` — Product-এর master data

## যা নেই — যোগ করতে হবে

- **Brand model + `/brands` API** (Category-র মতো একই প্যাটার্ন কপি করা যায়)
- **Unit model + `/units` API**
- Product-এ `brandId?`, `unitId?` FK (Brand/Unit locked হলে, migration-এ)

---

## paste করার মেসেজ (হুবহু copy করো)

> `D:\radian` folder এই chat-এ connect করো।
> আগে পড়ো `RADIAN_ADMIN_PROGRESS.md` (বিশেষত section ১০ ও শেষের locked সিদ্ধান্তগুলো), তারপর এই ফাইল `RADIAN_NEXT_CHAT_CLASSIFICATION.md`।
> Skill load: `radian-development-context` (আগে) → `radian-business-context`। module design করলে: `module-design-template` · `business-rules-writing` · `decision-log-writing` · `architecture-review`।
>
> আমরা এখন **Classification module** করব — **Categories দিয়ে শুরু**, তারপর Occasions & Tags → Brands → Units। Product Management শেষ ও পুরো database-চালিত; Product এখনো mock category-র উপর দাঁড়িয়ে, তাই Category master দরকার।
>
> Category-র **backend পুরো তৈরি** (`/categories` — list/create/update/delete, parent-child, product-count)। Tags-এরও (`/tags`)। **Brand ও Unit model নেই** — schema + API বানাতে হবে। তাই Categories আপাতত **frontend-এর কাজ**।
>
> admin = `apps/admin` (:3001) · storefront = `apps/web` (:3000) · API = `apps/api` (:4000)। নতুন screen ওই admin app-এ **হুবহু একই convention**-এ: English UI · brand token (globals.css) · বাঁয়ে section-nav + ডানে live preview · row editor-এ **CSS grid (flex নয়)** · search box-এ `ipt ipt-icon` (কখনো `pl-10` নয়) · full-width layout (`w-full`, `max-w` নয়) · **demo fallback: API বন্ধ হলেই কেবল demo + কমলা "Demo data" badge; খালি DB = demo নয়, খালি real screen + "Load samples" button**।
>
> আমি marketing-এর মানুষ, engineer নই — **visual-first**: আগে screen/flow বানিয়ে দেখাও, আমি localhost:3001-এ দেখে approve করলে তবে পরের ধাপ। উত্তর **বাংলায়**, কোড/UI English। প্রতি table-এ soft-delete + audit, টাকা = paisa (integer)।
>
> শুরু করো: (১) `/categories` কী দেয় ও `Category` Prisma model পড়ো, (২) Categories admin screen বানাও (গাছ: parent → sub · inline create/edit · sort · product-count · active toggle · soft-delete · create/update/delete client fn যোগ), (৩) তারপর Product editor-এর hardcoded `CATEGORIES` সরিয়ে আসল `/categories` + `categoryId`-তে জোড়ো। আমার feedback নিয়ে এগোও।

---

## নতুন assistant-কে যা মনে করিয়ে দিতে হবে (এই chat-এ শেখা)

1. **`.ipt` CSS ফাঁদ** — `globals.css` Tailwind-এর পরে load হয়, তাই `.ipt`-এর `padding`/`width` shorthand `pl-10`/`w-[…]` নীরবে বাতিল করে। search box-এ **`ipt ipt-icon`**, row editor-এ **grid** ব্যবহার করো।
2. **Full-width layout** — সব list/dashboard screen `w-full` (`max-w-[1320px]` নয়), padding `px-6 md:px-8 xl:px-10 2xl:px-12`। KPI strip `2xl:grid-cols-8`। edit form-এ শুধু `max-w-[1500px]`।
3. **Demo fallback নিয়ম (গুরুত্বপূর্ণ, এই chat-এ ঠিক হয়েছে)** — API **unreachable** হলেই demo + badge। **খালি DB ≠ demo** — API চললে খালি হলেও real mode, খালি screen + এক ক্লিকে **"Load samples"** (আসল POST করে seed করে)।
4. **migration চালানোর দ্বৈত-ধাপ (নাহলে চলমান container পুরনো client ধরে রাখে → 500)**:
   `docker compose run --rm api npx prisma migrate dev --name <নাম>`
   → `docker compose exec api npx prisma generate` → `docker compose restart api`
   (শুধু `run --rm`-এ generate করলে throwaway container-এ যায়, চলমান API পায় না।)
5. **sandbox-এ `prisma generate` টাইমআউট করে** (নেটওয়ার্ক) — তাই sandbox-এ API typecheck stale-client error দেখাবে; আসল যাচাই user-এর Docker-এ restart-এ। কোড schema-র সাথে মিলছে কিনা যত্ন করে দেখো।
6. **One Data One Owner** — Category/Tag/Brand/Unit নিজ নিজ master; Product শুধু FK দিয়ে reference করবে, কোনো field নকল হবে না।
7. **locked module-ই কেবল** — `build_status.md`: Category/Unit/Brand সব Master Data-তে **locked ✅**, বানানো নিরাপদ। Ecommerce **locked নয়** — ওটা ছুঁয়ো না।
8. **row-এ ঘর/টাইপ persist** — derived (items থেকে) state হলে edit সাথে সাথে local-এ দেখাও, API call ৪০০–৬০০ms debounce করো; নইলে টাইপ করলে ঘর snap-back করে (upgrade discount-এ এই bug হয়েছিল)।
9. **ছবি এখনো স্থায়ী নয়** — add-on/variant/product ছবি `URL.createObjectURL` (blob), refresh-এ হারায়। Media library (Composition) এলে ঠিক হবে। Category-তে সাধারণত ছবি লাগে না, কিন্তু সীমাটা মনে রেখো।

---

## আমার কাছ থেকে কী access লাগবে

- **শুধু `D:\radian` folder connect** — আর কিছু না।
- Docker চালু (DB + API): `cd /d D:\radian` → `docker compose up -d postgres api`
- Admin চালাতে: `cd /d D:\radian\apps\admin` → `npm run dev` → http://localhost:3001
  (cmd-এ drive বদলাতে `cd /d`; PowerShell-এ শুধু `cd`। window খোলা রাখতে হয়।)
- storefront লাগলে: `cd /d D:\radian\apps\web` → `npm run dev` → http://localhost:3000

---

## Product module থেকে বকেয়া (Classification-এ নয়, পরে)

- **Media library** (Composition) — সব ছবি স্থায়ী করবে।
- **Funnel Phase 2** — storefront tracking (view/cart/checkout impression); তখন add-on/product funnel-এর উপরের ধাপ ও per-page attach rate ভরবে।
- **GA4/Pixel outbound** — Google/FB ads-এর জন্য; আলাদা ভবিষ্যৎ আলোচনা।
- **storefront PDP** — variant = আলাদা page; **upgrade = একই page-এ option (navigate নয়)** — locked, `RADIAN_ADMIN_PROGRESS.md`-এ বিস্তারিত।
