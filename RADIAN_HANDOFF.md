# Radian Frontend — Handoff / Status

_শেষ আপডেট: 15 July 2026। নতুন চ্যাট শুরুতে এই ফাইল পড়ো, তারপর `radian-development-context` skill লোড করো।_

## Project

- Radian Flower & Gift Shop — premium eCommerce, Bangladesh।
- Monorepo। Next.js app আছে **`D:\radian\apps\web`**-এ (root-এ নয়)।
- সব npm কমান্ড ওখান থেকে: `cd /d D:\radian\apps\web` → `npm run dev` / `npm run build`।
- LAN-এ টেস্ট: `npm run dev -- -H 0.0.0.0`, তারপর অন্য device-এ `http://<host-ipv4>:3000`।

## Conventions (মেনে চলতে হবে)

- উত্তর **Bangla script**-এ, concise। কোড/variable/technical term English।
- পুরো frontend এখন **mock data-driven** — সব ডেটা `app/_data/*.ts`-এ। backend নেই।
- **Config-driven routes:** নতুন page/collection/article যোগ করতে শুধু `_data/*`-এ config; view/route-এ হাত পড়ে না।
- **টাকা সবসময় paisa integer** (১ টাকা = ১০০ paisa)।
- **Zone filter:** "All Bangladesh" দিলে শুধু courier-safe (`zone: "both"`) প্রোডাক্ট।
- **GBE locked order** প্রতি page-এর নিচে: `Reviews → VisitStore → Footer`।
- কোনো **legal নম্বর / আসল পরিসংখ্যান বানানো যাবে না** — placeholder + draft banner।
- Backend এলে নিয়ম: **schema → API → frontend**, One Data One Owner, soft-delete + audit।

## Design tokens (globals.css)

purple `#470066` · purple-deep `#320049` · orchid `#cf43ea` · orchid-soft `#f9e9fd` · orchid-mid `#e9a8f5` · lavender `#f7f1fb` · lavender-deep `#efe4f7` · rosegold `#b76e79` · body `#3a2547` · body-soft `#7a6689` · font-display (serif) · shadow-soft · shadow-lift। Petal motif: `rounded-[50%_50%_50%_0] -rotate-45`।

## Live routes (সব internal লিংক live, কোনো dead নেই)

`/` · `/about` · `/contact` · `/products` (shop-all) · `/products/[slug]` ·
`/categories/[slug]` · `/categories/[slug]/[sub]` · `/occasions` · `/occasions/[slug]` ·
`/collections/[slug]` (under-1000, 1000-2000, 2000-3000, 3000-plus, **valentines**) ·
`/journal` · `/journal/[slug]` · `/search` · `/wishlist` · `/cart` · `/checkout` ·
`/order-success` · `/track` · `/delivery-info` · `/faq` · `/privacy-policy` · `/refund-policy` · `/terms` ·
`/account/login` · `/account` (Overview) · `/account/orders` · `/account/orders/[id]` ·
`/account/wishlist` · `/account/addresses` · `/account/profile`
— account section = **sidebar tab layout** (`AccountShell`): বাঁয়ে nav, ডানে panel, প্রতি tab আলাদা route (রেফারেন্স: knowledge-এর `radian-account-dashboard-design.html`)।

**Account interactive (functional mock, localStorage):**
- `useAddressStore` — Addresses tab = delivery/recipient address only, add/edit/delete/set-default (seed `SEED_DELIVERY_ADDRESSES`)।
- `useProfileStore` — Profile tab: avatar upload (data-URL, ≤1.5MB) + নিজের personal address (seed `DEMO_OWN_ADDRESS`)। name/phone/email session (read-only)।
- `useWishlistGroupStore` — Wishlist tab: user-created folder, item assign; standalone `/wishlist` (WishlistView) আলাদা থাকে, account tab = `WishlistPanel`।
- shared `.ipt` input class globals.css-এ। avatar sidebar user-card-এও দেখায়।

**UX extras (15 July):**
- `app/not-found.tsx` (premium 404), `app/error.tsx` (client error boundary + retry), `app/loading.tsx` (lavender skeleton, no spinner)।
- **Reorder** — `_data/reorder.ts` (snapshot label→id map, add-on বাদ) + `ReorderButton`; OrderCard (terminal), order detail, overview welcome-এ।
- **Occasion reminders** — `_data/reminders.ts` + `useReminderStore` (persist) + `RemindersSection` ("Dates Radian Remembers", add/delete, WhatsApp offset) — Overview-তে।

Collections: `kind: "budget" | "theme"` — budget tier আর themed (valentines = occasion `love`) আলাদা chip-group।

## এখনো draft / placeholder (আসল তথ্য এলে বসাতে হবে)

- About → Trade License / BIN / VAT / TIN / DBID নম্বর ও scan (`_data/about.ts`, `documents[]`)।
- Contact → phone / WhatsApp / email (`_data/contact.ts`) — আসল digit বসালে deep-link কাজ করবে।
- Journal → ৪টা placeholder আর্টিকেল (`_data/journal.ts`, `JOURNAL_DRAFT`)।
- সব page-এ studio/team ছবি = gradient placeholder।

## সদ্য যোগ হলো — Customer Account (15 July, mock)

**সিদ্ধান্ত:** (১) auth = **WhatsApp login (mock)** — phone → OTP; (২) order = **seeded history ∪ live** placed order।

- **Auth:** `_data/auth.ts` (Customer/Address model, `DEMO_CUSTOMER`, mock OTP) + `_store/useAuthStore.ts` (persist)। Demo: যেকোনো valid BD ফোন + OTP **`123456`** → login। কোনো আসল যাচাই/নিরাপত্তা নেই।
- **Order model extend:** `_data/order.ts`-এ `OrderStatus` (placed→confirmed→preparing→out_for_delivery→delivered/cancelled) + `timeline: OrderEvent[]` + `ORDER_STATUS_META` + `statusStage()` (DeliveryTimeline-এর 7-stage-এর সাথে map)।
- **Seed:** `_data/orders.ts` — ৬টা sample order (নানা status)। `getAllOrders(live)` = live (useOrderStore) ∪ seed, `findOrder(id, live)`।
- **Pages:** `/account/login` (WhatsApp OTP flow), `/account` (dashboard: stats + active/recent orders + addresses), `/account/orders` (list + status filter), `/account/orders/[id]` (progress tracker + history + receipt)। সব `AccountGuard`-এ (login না থাকলে redirect)।
- **Header:** NavIcons-এ Account link — logged-in হলে `/account`, নয়তো `/account/login`।
- সব নতুন page-এ GBE locked order (Reviews → VisitStore → Footer) আছে।
- **Verify:** sandbox-এ `next build` চলে না (Windows SWC binary + offline npm)। tsc-ও edited file-এ ভুয়া error দেয়। নতুন সব file tsc-clean। **হোস্টে `npm run build` চালিয়ে চূড়ান্ত যাচাই বাকি।**

⇄ সব swap-point কমেন্টে চিহ্নিত: Auth/Ecommerce module lock হলে data source API হবে, shape এক থাকবে।

## Finishing tasks (পরে — frontend polish, deferred)

Frontend আপাতত **feature-complete (mock)**। এগুলো finishing phase-এ:

1. **Deep frontend analysis** — সব page একসাথে রিভিউ (consistency, spacing, edge cases, empty states)।
2. **Mobile-friendly deep pass** — প্রতি page ছোট স্ক্রিনে যাচাই, tap target, overflow, sticky bar।
3. **SEO deep pass** — metadata/OG per route, sitemap, robots, structured data (Product/Breadcrumb), semantic headings, alt text (আসল ছবি এলে)।
4. আসল content/asset swap — product ছবি, About legal docs, Contact digits, Journal আর্টিকেল।

## পরের phase — Backend (নতুন chat)

Backend/admin panel নতুন chat-এ ধাপে ধাপে। বিস্তারিত kickoff + সিদ্ধান্ত: **`D:\radian\RADIAN_BACKEND_HANDOFF.md`**।
নিয়ম: schema → API → frontend, One Data One Owner, soft-delete + audit, locked module-ই কেবল।
Frontend swap-point চিহ্নিত: কোডে `⇄ SWAP HERE` (grep করলেই সব পাবে)।

## Environment quirk (গুরুত্বপূর্ণ)

Sandbox-এর Linux mount **edit-করা (re-written) ফাইলে মাঝে মাঝে stale/truncated cache** দেখায় — ফলে `tsc` ঐসব ফাইলে ভুয়া error দেয়। **নতুন-তৈরি ফাইলে সমস্যা নেই।** আসল ফাইল (`D:\radian`) সবসময় ঠিক থাকে। আসল যাচাই = হোস্টে `npm run build`।
