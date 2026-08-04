# Radian Backend — Kickoff / Handoff

_তৈরি: 15 July 2026। **নতুন chat শুরুতে** এই ফাইল + `RADIAN_HANDOFF.md` পড়ো, তারপর skills লোড করো।_

## এই phase-এর লক্ষ্য

Frontend (Next.js, `apps/web`) এখন **feature-complete কিন্তু পুরোটা mock** — সব ডেটা `app/_data/*` আর `app/_store/*` (localStorage)। এই phase-এ **backend** বানাব আর mock → API swap করব।

**মূল নিয়ম (dev-context skill থেকে):**

- Build order প্রতি module-এ: **Database schema → Backend API/business rules → Frontend swap**।
- **শুধু locked module** বানাব। `build_status.md` দেখো। Ecommerce module **locked নয়** — storefront-নির্দিষ্ট entity (cart, checkout flow, wishlist, customer account) এখনই backend-এ বানানো যাবে না; আগে architecture project-এ lock করাতে হবে।
- **One Data One Owner** · **Soft delete only** (`deleted_at`) · **Audit + activity timeline everywhere** · **Everything admin-configurable** · downstream module শুধু completed event consume করে।
- যেকোনো locked rule enforce করলে কোড কমেন্টে `DEC-XXX-NNN` cite করো।
- কোনো gap/conflict পেলে **থামো, flag করো** — এখানে business rule redesign নয়, architecture project-এ resolve।

## Build sequence (dependency order)

1. Item, Category, Unit, Brand, **Product**
2. Warehouse, Branch
3. **Customer**, Supplier, Vendor, Employee
4. Tax Management
5. Purchase → Inventory → Quality → Delivery
6. **Sales** → Pricing & Offers → POS → Returns & Refunds

Storefront-কে সবচেয়ে দ্রুত জ্যান্ত করতে সাজেস্টেড সূচনা-পথ: **Item/Product → Customer → Sales Order** (এতেই product list + customer + order history আসল হয়ে যায়)। Sales Order-এ মনে রাখো: self vs gift = order-level attribute; **DEC-MOD-003** — stock deduct হয় Delivery Processing-এ, Order Confirmation-এ নয়।

## শুরুতেই যে সিদ্ধান্তগুলো জিজ্ঞেস করবে

1. **Tech stack** — DB (সাজেশন: PostgreSQL), framework/ORM (যেমন NestJS + Prisma, বা Django, বা Supabase)। Hosting কোথায়?
2. **Repo layout** — একই monorepo-তে `apps/api` (frontend `apps/web`-এর পাশে)? shared types package (`packages/types`)?
3. **আসল auth** — frontend এখন mock WhatsApp OTP (code `123456`)। আসল OTP provider কী (WhatsApp Business API / Twilio / SMS gateway)? নাকি interim?
4. **প্রথম module** কোনটা (সাজেশন: Product + Customer → Sales)।
5. **Ecommerce module** এখন lock করা হবে কি না (storefront cart/checkout/account backend-এর জন্য দরকার) — নাকি আপাতত Sales/Customer/Product দিয়েই এগোব।

## Frontend swap-points (কোথায় হাত পড়বে)

কোডে সব swap জায়গা কমেন্টে চিহ্নিত: `⇄ SWAP HERE`। খুঁজতে —
`cd apps/web && grep -rn "SWAP HERE" app`

প্রধানগুলো: `_data/order.ts` (placeOrder → POST /orders), `_data/orders.ts` (GET /orders), `_data/products.ts`/`productDetails.ts` (catalog fetch), `_data/wishlist.ts`, `_data/auth.ts` (OTP + /me), `_store/*` persist store (localStorage → server session/API)।

## Skills (নতুন chat-এ লোড করবে)

- `radian-development-context` — locked status, build sequence, naming, core principles (সবসময় আগে)।
- `radian-business-context` — "কেন" (business reasoning)।
- `module-design-template` · `business-rules-writing` · `decision-log-writing` · `architecture-review` — module design/rule/decision-এর সময়।

## Access / setup যা লাগবে

- **Folder:** `D:\radian` connect (frontend + এই handoff এখানেই)।
- **DB:** stack ঠিক হলে local Postgres (Docker) বা managed (Supabase/Neon) — user-এর সিদ্ধান্ত।
- **Env quirk:** sandbox-এ `next build` চলে না (Windows SWC binary + offline npm) — frontend verify **হোস্টে `npm run build`**। Backend Node হলে sandbox-এ migration/test চালানো যেতে পারে, কিন্তু sandbox ephemeral (persist হয় না)।
- Convention: উত্তর **Bangla script**, concise; কোড/technical term English।

## Communication rules (এই project)

Bangla script only · concise, no filler · user suggest করলেই মেনো না — critically evaluate, better হলে সেটাই recommend · One Data One Owner · soft-delete + audit সবসময়।
