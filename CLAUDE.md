# Radian Business OS — প্রকল্পের স্থায়ী ব্রিফ

> **এটা কী:** নতুন কোনো কথোপকথন শুরু হলে Claude এই ফাইলটা নিজে থেকে পড়ে。
> উদ্দেশ্য একটাই — প্রতিবার শূন্য থেকে প্রকল্প আবিষ্কার না করা。
>
> **এটা কী নয়:** সম্পূর্ণ ডকুমেন্টেশন。 বিস্তারিত আছে `RADIAN_*.md` ফাইলগুলোতে;
> এখানে শুধু **যা না জানলে ভুল করব** সেটুকু。
>
> ⚠️ কিছু বদলালে এই ফাইলটাও বদলাতে হবে。 পুরনো ব্রিফ কোনো ব্রিফ না থাকার
> চেয়ে খারাপ — কারণ সেটা বিশ্বাস করে ভুল সিদ্ধান্ত নেওয়া হয়。

---

## ১. প্রকল্প কী

**Radian** — বাংলাদেশের ফুল ও উপহারের দোকান, এবং তার পুরো ব্যবসা চালানোর
সিস্টেম (Business OS)。 দুটো আলাদা জিনিস এক জায়গায়:

- **দোকান** (`apps/web`) — গ্রাহক যা দেখে
- **Business OS** (`apps/admin` + `apps/api`) — ২০+ module: পণ্য, order,
  মজুদ, ক্রয়, POS, ফেরত, ডেলিভারি, হিসাব, HR, মার্কেটিং, রিপোর্ট

মালিক: sobuj। ব্যবসার মডেল **FBR (Fulfilled by Radian)** — লক্ষ্য ৮৪ branch,
৬৪ জেলা。 পণ্য **assemble** হয় (ফুল + ফিতা + কাগজ → তোড়া), তৈরি হয় না —
তাই manufacturing/BOM লাগে না。

**ব্যবসার অগ্রাধিকার (সবসময় সামনে রাখতে হবে):** ২ ঘণ্টায় ডেলিভারি ·
একই দিনে · মধ্যরাতে · সারা দেশে · দ্রুত checkout · গ্রাহকের আস্থা。

---

## ২. গঠন ও চালানো

| অংশ | কী | পোর্ট |
|---|---|---|
| `apps/api` | NestJS + Prisma + PostgreSQL — **সব নিয়ম এখানে** | 4000 |
| `apps/admin` | Next.js — মালিক/স্টাফের পর্দা | 3001 |
| `apps/web` | Next.js — গ্রাহকের দোকান | 3000 |
| `postgres` | Docker container | 5433 (host) → 5432 |

**চালু করা:** `START_RADIAN.bat` (Docker জাগায়, container তোলে, API-র উত্তরের
জন্য অপেক্ষা করে, তারপর admin খোলে)。

**⚠️ admin আর web `docker-compose.yml`-এ নেই** — admin চলে host-এ
(`npm run dev`, START_RADIAN নিজেই খোলে)。 api আর web container-এ。

---

## ৩. কী কী বানানো হয়ে গেছে

**কোডই একমাত্র সত্য।** `apps/api/src`-এ ফোল্ডার থাকা মানে module-টা আছে:

```
administration  assembly  audit  auth      catalog   content   customers
delivery        finance   hr     intelligence  inventory  items
marketing       media     offers orders    pos       products  purchases
returns         seo       shop   storefront suppliers
```

**Storefront সম্পূর্ণ live** — catalogue, cart, checkout (server-side pricing),
SSLCommerz (sandbox), track order, review, policy/FAQ/SEO — সব API থেকে。
(পুরনো `RADIAN_PENDING.md`-এর W1 "web এখনো mock-এ" — **অচল**।)

**Auth সম্পূর্ণ আছে** (DEC-FIN-028) — `AuthGate` + global `AuthGuard`,
OWNER/MANAGER/STAFF role, টাকার কাজে ৪-সংখ্যার PIN।
(পুরনো guide-এর "কোনো guard নেই (D10)" — **অচল**।)

Migration: **৭৫টা**।

### কোন ডকুমেন্ট বিশ্বাস করব

| ফাইল | অবস্থা |
|---|---|
| `RADIAN_ADMIN_PROGRESS.md` | module-ভিত্তিক সবচেয়ে বিস্তারিত (৩০ জুলাই) |
| `RADIAN_PRODUCT_DECISIONS_3AUG.md` · `_2AUG` | সাম্প্রতিকতম সিদ্ধান্ত |
| `RADIAN_*_MODULE_ARCHITECTURE.md` | ওই module-এর নকশা ও DEC-নিয়ম |
| `RADIAN_DEPLOY_PLAN.md` · `_STEPS.md` | deployment (৪ আগস্ট) |
| ~~`RADIAN_DEPLOY_GUIDE.md`~~ | **পুরনো** (২৬ জুলাই) — উপরে সংশোধনী আছে |
| ~~`RADIAN_PENDING.md`~~ | **আংশিক পুরনো** (২৩ জুলাই) — অনেক item শেষ |
| `radian-development-context` skill | **build_status অংশটা পুরনো** — Finance/Marketing "not started" লেখা, অথচ দুটোই বানানো。 নীতিগুলো (core_principles) এখনো সঠিক |

**সন্দেহ হলে ডকুমেন্ট নয়, কোড দেখব।** এবং ফাইলটা পুরনো মনে হলে সেটা
মালিককে বলব, চুপচাপ ধরে নেব না।

---

## ৪. ঘরের নিয়ম (আলোচনার বাইরে)

1. **একবারে একটা page বা feature।** মালিক দেখে অনুমোদন না দেওয়া পর্যন্ত
   পরেরটায় যাব না।
2. **ব্যবসার নিয়ম আমি বানাব না।** অস্পষ্ট হলে **জিজ্ঞেস করব**। অনুমান করে
   লিখে ফেলা এই প্রকল্পে সবচেয়ে ব্যয়বহুল ভুল।
3. **শুধু সম্মতি জানানো নিষিদ্ধ।** মালিকের প্রস্তাবের চেয়ে ভালো পথ থাকলে
   সেটা বলব — কেন ভালো তা সহ। দীর্ঘমেয়াদি রক্ষণাবেক্ষণ > দ্রুত শেষ করা।
4. **One Data One Owner** — এক তথ্যের এক মালিক-module। অন্যরা FK দিয়ে
   দেখবে, কপি করবে না।
5. **Soft delete only** — `deletedAt`। ব্যবসায়িক সারির জন্য কখনো hard DELETE নয়।
6. **Audit everywhere** — কে, কখন, কী→কী বদলাল।
7. **সবকিছু admin থেকে বদলানো যাবে** — ব্যবসার মান কোডে hardcode নয়।
8. **ক্রম:** schema → API/business rule → frontend। উল্টো কখনো নয়。
9. **উত্তর বাংলায়**, সংক্ষেপে। কোড, variable, technical term, error message
   ইংরেজিতে。
10. **DEC-XXX-NNN আইডি** কোডের মন্তব্যে উল্লেখ করব, যাতে "কেন এই নিয়ম"
    পরে খুঁজে পাওয়া যায়。

### নকশার ভাষা
Premium · আবেগী · পরিচ্ছন্ন · minimal · আস্থা জাগানো。 প্রচুর whitespace,
বড় ছবি, নরম ছায়া, গোল কোণা, বড় CTA。 **পর্দা কখনো ভিড় মনে হবে না।**
রং: brand purple, pink, soft lavender, white; accent rose gold。

---

## ৫. ফাঁদ — যেগুলোতে ইতিমধ্যে পা পড়েছে

এগুলো তাত্ত্বিক নয়। প্রতিটা একবার করে ভুগিয়েছে。

| ফাঁদ | কী হয় | করণীয় |
|---|---|---|
| **`start:dev` TypeScript error গিলে ফেলে** | `scripts/dev.mjs` ইচ্ছাকৃতভাবে type-error-এর উপর দিয়ে API চালু রাখে (এক ভুলের জন্য দোকান বন্ধ না হোক)। তাই লোকালে সব ঠিক দেখায়, অথচ `npm run build` ফেল | push/deploy-এর আগে **সবসময় `BUILD_CHECK.bat`** |
| **Prisma client দুই জায়গায়** | `radian_fix_generate.bat` client বানায় **কনটেইনারের ভেতরে**; Windows-এর `node_modules` অচল থেকে যায় — অথচ VS Code আর `npm run build` ওটাই পড়ে | schema বদলালে **`BUILD_CHECK.bat`** (host-এ generate করে) |
| **cmd বাংলা আঁকতে পারে না** | `.bat`/script-এ বাংলা `echo` করলে পর্দায় `aªòaªç` আবর্জনা | **ছাপার লেখা ইংরেজিতে**, মন্তব্য বাংলায় |
| **`.env` দুই জায়গায়** | root `.env` + `apps/api/.env` (Prisma CLI-র জন্য) | DB বদলালে **দুটোই** বদলাতে হবে (T2) |
| **`NEXT_PUBLIC_*` build-time** | deploy-এর পরে বদলালে কিছুই হয় না | বদলে **Redeploy** |
| **`/health` কখনো DB ছোঁবে না** | ফ্রি Postgres-এ মাসিক compute-hour সীমা; প্রতি ১০ মিনিটের ping DB জাগালে কোটা ৪ দিনে শেষ | `app.controller.ts`-এর `health()`-এ একটাও query নয় |
| **Render/Railway-তে `PORT` হাতে দেওয়া** | "Application failed to respond" | env-এ `PORT` **রাখব না** |
| **`docker-compose.yml`-এর `command:`** | Dockerfile-এর `CMD` override করে | তাই Dockerfile production-এ বদলালেও লোকাল dev অক্ষত |
| **Order hard-delete করা যায় না** | lines · payment · return · redemption সব FK-এ ধরা | `deletedAt` বসাব |
| **slug বদলালে লিংক মরে** | শেয়ার করা/বিজ্ঞাপনের পুরনো ঠিকানা 404 | Admin → SEO-তে redirect বসাতে বলব |

---

## ৬. দুই environment — Demo আর Real

```
DEMO (staging)  ──── পাশ করলে ────►  REAL (production)
ফ্রি · বানানো ডেটা                     আসল গ্রাহক · আসল টাকা
branch: main                          branch: production
```

**নিয়ম:** কোনো update সরাসরি real-এ যাবে না। আগে demo → `RUN_TESTS.bat`
পাশ → মালিকের চোখে দেখা → তবেই promote。 **ডেটাবেজ দুটো কখনো এক হবে না।**

বিস্তারিত: `RADIAN_DEPLOY_PLAN.md`।

---

## ৭. যন্ত্রপাতি (১২৫টা `.bat`-এর মধ্যে যেগুলো আসলে লাগে)

| ফাইল | কাজ |
|---|---|
| `START_RADIAN.bat` | সব চালু করা (রোজ একবার) |
| **`RADIAN_DOCTOR.bat`** | **সব ঠিক আছে কিনা এক পর্দায়** — আটকালে প্রথমে এটা |
| `BUILD_CHECK.bat` | prisma generate + build (push/deploy-এর আগে) |
| `RUN_TESTS.bat` | ২৫টা locked business rule (`full` দিলে গভীর) |
| `PRE_DEPLOY_CHECK.bat` | DB-তে যা ইন্টারনেটে যাওয়া উচিত নয় |
| `radian_migrate.bat` · `radian_fix_generate.bat` | migration (কনটেইনারে) |
| `radian_backup.bat` · `radian_restore.bat` | DB ব্যাকআপ |
| `radian_api_logs.bat` | API-র log |

> ⚠️ `RUN_TESTS.bat full` production DB-তে চালাব না — একটা delivered
> test order রেখে যায়。

---

## ৮. কীভাবে কাজ হবে

বিস্তারিত `RADIAN_WORKFLOW.md`-এ। সংক্ষেপে:

- **নতুন feature** → আমি আগে প্রশ্ন করব (ব্যবসার নিয়ম অনুমান করব না) →
  প্রতিযোগীদের দেখব → নকশা দেখাব → অনুমোদনের পর কোড
- **ভাঙছে** → আগে `RADIAN_DOCTOR.bat`-এর ফল, তারপর error-এর হুবহু লেখা
- **বুঝতে চান** → যে ফাইল/পর্দার কথা, তার নাম বললেই হবে

---

_সর্বশেষ হালনাগাদ: ৪ আগস্ট ২০২৬ — deployment প্রস্তুতির পর।_
