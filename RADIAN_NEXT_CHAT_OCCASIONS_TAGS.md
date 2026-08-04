# নতুন chat — Occasions & Tags (Classification module · ধাপ ২)

_হালনাগাদ: 19 July 2026। নিচের **"paste করার মেসেজ"** হুবহু copy করে নতুন chat-এ দাও।_

---

## এক নজরে — এখন কোথায় আছি

**Classification module ধাপ ১ (Categories) সম্পূর্ণ ও browser-এ যাচাই করা ✅**

| যা হয়েছে | অবস্থা |
|---|---|
| Category admin screen (tree · inline edit · sort · product-count · active toggle · soft-delete · live storefront preview) | ✅ |
| Full Category CMS/SEO editor (description · summary · image/icon/banner · meta · OG · navbar · featured) | ✅ persist |
| Category schema migration (`category_cms_fields`) + API + client | ✅ আসল DB-তে চলছে |
| Product editor আসল `/categories` + `categoryId`-তে জোড়া (top + sub cascade, edit-preselect) | ✅ live |

**তাই এবার ধাপ ২ = Occasions & Tags** — Category-র মতোই master data, **backend পুরো তৈরি, শুধু frontend বানাতে হবে।**

**ক্রম (মূল plan):** Categories ✅ → **Occasions & Tags (এই chat)** → Brands → Units।

---

## Occasions & Tags কী

- **Tag master** — occasion (birthday, anniversary, love…) আর recipient (her, him, parents, kids…) — Product-এর সাথে **many-to-many** (এক product-এ অনেক tag)। Gift Finder ও occasion page এগুলো দিয়ে চলে।
- **locked সিদ্ধান্ত:** Occasion = **Tag** (category নয়) · Product ↔ Tag = **m2m** (Category ছিল single FK, এটা আলাদা)। DEC-PRD-002।
- Category-র চেয়ে **সহজ** — কোনো parent-child নেই (flat), কোনো CMS/SEO field নেই। শুধু দুই ভাগ: **Occasions** ও **Recipients**।

---

## Tag backend — তৈরি (নতুন বানাতে হবে না)

**API চালু** (`apps/api/src/catalog/tags.ts`):

| Method | Endpoint | কাজ |
|---|---|---|
| GET | `/tags` | সব — `_count.products` সহ, ordered by type→sortOrder→name |
| GET | `/tags?type=OCCASION` / `?type=RECIPIENT` | ভাগ করে |
| GET | `/tags?search=` | নাম search |
| POST | `/tags` | তৈরি |
| PATCH | `/tags/:id` | edit |
| DELETE | `/tags/:id` | soft-delete |

**DTO:** `{ slug, name, type: "OCCASION" | "RECIPIENT", sortOrder?, isActive? }`
**Prisma model** (`Tag`): `id · slug(unique) · name · type(TagType: OCCASION|RECIPIENT) · sortOrder · isActive · products[] (implicit m2m) · soft-delete · audit`。

⚠️ **খেয়াল:** Category-র DELETE product/children থাকলে আটকায়; **Tag-এর DELETE আটকায় না** (product লাগানো থাকলেও soft-delete হয়)। UI-তে delete করার আগে product-count দেখিয়ে confirm করা ভালো ("N products use this — remove anyway?")। Tag-এ `findOne` endpoint নেই (শুধু list)।

---

## যা বানাতে হবে (frontend)

1. **admin client** (`app/_data/api.ts`)-এ যোগ করো (এখন শুধু `listTags` আছে):
   - `createTag`, `updateTag`, `deleteTag`
   - `listTagsSafe()` — **demo শুধু API unreachable হলে** (Category-র `listCategoriesSafe` প্যাটার্ন হুবহু কপি)
   - `tagSlug(name)` helper + `seedSampleTags()` (starter occasions+recipients POST করে)
   - নতুন demo ফাইল `_data/tagDemo.ts` (occasion + recipient sample, mixed active/inactive/empty)
2. **Tags admin screen** — দুই ভাগ (Occasions · Recipients), প্রতি ভাগে: inline create/edit · sort (up/down) · active toggle · product-count · soft-delete (confirm সহ)। উপরে stat card। ডানে/নিচে **live preview** (storefront-এ occasion chip / Gift Finder সারি যেমন দেখাবে)।
   - Category-র চেয়ে সহজ: tree নেই, editor pane লাগে না — Segments-এর মতো single-column list দুই সেকশনে, অথবা বাঁয়ে list + ডানে ছোট preview।
3. **sidebar** — "Occasions & Tags" entry এখন placeholder; `href="/tags"` দিয়ে সচল করো (Category যেভাবে হয়েছে)।
4. **route** — `app/tags/page.tsx` (বা `app/occasions-tags/`)।
5. **demo fallback নিয়ম** — API বন্ধ হলেই demo + কমলা "Demo data" badge; খালি DB = real, খালি screen + "Load samples"।

### Product editor tag-wiring (এই chat-এ শেষে, optional কিন্তু ভালো)
Product editor-এ occasion/recipient বাছাই এখনো **hardcoded `OCCASIONS`/`RECIPIENTS` array** (slug মিলিয়ে `apiTags`-এ resolve)। Category যেভাবে live করা হলো, tag-ও **আসল `/tags` থেকে live** করা যায় (occasion chips = type OCCASION, recipient chips = type RECIPIENT; `tagIds` সরাসরি পাঠাও)। `buildDto`-তে `tagIds` ইতিমধ্যে আছে — শুধু picker-এর উৎস live করতে হবে।

---

## Reference — Categories যেসব ফাইলে হয়েছে (হুবহু প্যাটার্ন কপি করো)

- `app/_components/CategoriesView.tsx` — two-pane container (list + editor + demo/empty/samples)
- `app/_components/CategoryEditor.tsx` — right editor (Tags-এ এত বড় লাগবে না)
- `app/_data/categoryDemo.ts` — demo + SAMPLE seed
- `app/categories/page.tsx` — route
- `app/_data/api.ts` — `ApiCategoryNode`/`CategoryWrite` + CRUD + `listCategoriesSafe` + `seedSampleCategories`
- `AdminSidebar.tsx` — "Categories" entry-তে `href` যোগ

Tags-এ এগুলোর সরল সংস্করণ বানাও: `TagsView.tsx` · `_data/tagDemo.ts` · `tags/page.tsx` · api.ts-এ tag CRUD।

---

## নিয়ম যা মানতেই হবে (এই chat-এ শেখা)

1. **`.ipt` CSS ফাঁদ** — search box-এ `ipt ipt-icon` (কখনো `pl-10` নয়), row editor-এ **CSS grid** (flex নয়)।
2. **Full-width** — list screen `w-full` + `px-6 md:px-8 xl:px-10 2xl:px-12`; KPI strip `2xl:grid-cols-*`।
3. **Demo নিয়ম** — API **unreachable** হলেই demo + কমলা badge; **খালি DB ≠ demo** (real + "Load samples")।
4. **One Data One Owner** — Tag নিজ master; Product শুধু m2m দিয়ে reference (কোনো field নকল নয়)।
5. **locked module-ই কেবল** — Tag/Brand/Unit সব Master Data-তে locked ✅। Ecommerce **locked নয়** — ছুঁয়ো না।
6. **চ্যাটে বাংলা** (script), UI/কোড English · concise · user-কে অন্ধভাবে মেনো না, critically evaluate।
7. **টাকা = paisa** (Tag-এ টাকা নেই, কিন্তু নিয়ম মনে রাখো) · soft-delete + audit সব table-এ।
8. **Tag-এ migration লাগবে না** (model তৈরি)। শুধু frontend + client fn। (Brand/Unit-এ পরে migration লাগবে।)
9. **visual-first** — আগে screen বানিয়ে localhost:3001-এ দেখাও, approve হলে পরের ধাপ।

---

## চালানোর নিয়ম (host)

- Docker (DB+API): `cd /d D:\radian` → `docker compose up -d postgres api`
- Admin: `cd /d D:\radian\apps\admin` → `npm run dev` → http://localhost:3001/tags
- storefront (লাগলে): `apps/web` → http://localhost:3000
- typecheck: `cd apps/admin` → `npx tsc --noEmit`

---

## paste করার মেসেজ (হুবহু copy করো)

> `D:\radian` folder এই chat-এ connect করো।
> আগে পড়ো `RADIAN_ADMIN_PROGRESS.md` (section ১০ + শেষের locked), তারপর `RADIAN_NEXT_CHAT_OCCASIONS_TAGS.md`।
> Skill load: `radian-development-context` (আগে) → `radian-business-context`।
>
> Classification module-এর **Categories সম্পূর্ণ** (screen + CMS/SEO editor + migration + product-এ live জোড়া, সব যাচাই করা)। এখন **ধাপ ২ = Occasions & Tags**।
>
> Tag-এর **backend পুরো তৈরি** (`/tags` — list/create/update/delete, type=OCCASION|RECIPIENT, product-count, soft-delete)। Tag model আছে, **migration লাগবে না** — শুধু **frontend**।
>
> admin = `apps/admin` (:3001)। নতুন screen একই convention-এ: English UI · brand token · search box `ipt ipt-icon` (কখনো `pl-10` নয়) · row editor CSS grid (flex নয়) · full-width (`w-full`) · demo fallback: API বন্ধ হলেই demo + কমলা "Demo data" badge, খালি DB = real + "Load samples"।
>
> আমি marketing-এর মানুষ, engineer নই — **visual-first**: আগে screen বানিয়ে localhost:3001-এ দেখাও, আমি approve করলে পরের ধাপ। উত্তর **বাংলায়**, কোড/UI English।
>
> শুরু করো: (১) `/tags` কী দেয় ও `Tag` model পড়ো, (২) Tags admin screen বানাও — দুই ভাগ Occasions ও Recipients, প্রতি ভাগে inline create/edit · sort · product-count · active toggle · soft-delete (product থাকলে confirm) · live preview; api.ts-এ `createTag/updateTag/deleteTag/listTagsSafe/seedSampleTags` + `_data/tagDemo.ts` যোগ; sidebar "Occasions & Tags" সচল + `app/tags/page.tsx`, (৩) তারপর (optional) Product editor-এর hardcoded occasion/recipient picker-কে আসল `/tags`-এ live করো (`tagIds` সরাসরি)। Reference: Categories যেসব ফাইলে হয়েছে (`CategoriesView.tsx`, `categoryDemo.ts`, api.ts category block) — সরল সংস্করণ কপি করো। আমার feedback নিয়ে এগোও।

---

## এরপর (Occasions & Tags শেষ হলে)

- **Brands** — model + `/brands` API **নেই**, বানাতে হবে (Category প্যাটার্ন, parent-child ছাড়া) + migration + Product-এ `brandId?` FK।
- **Units** — model + `/units` API **নেই**, বানাতে হবে + migration + Product-এ `unitId?` FK।
- (দুটোতেই schema migration লাগবে — Docker-এ two-step: `migrate dev` → `exec api prisma generate` → `restart api`।)
