# Radian — Deployment প্ল্যান (Demo + Real, দুই ভার্সন)

> # 🛑 DO NOT FOLLOW THIS FILE ANY MORE (30 Aug 2026)
>
> These are instructions for deploying to **Vercel + Render + Neon**. All three
> are shut down; the whole system now lives on the Hostinger VPS.
>
> **Today's correct instructions:** `CLAUDE.md` §2 · `RADIAN_ACCOUNTS.md`
>
> Not deleted — the reasoning for each decision is written here and still
> earns its place. Only the STEPS are no longer followable.

_তৈরি: ৪ আগস্ট ২০২৬। `RADIAN_DEPLOY_GUIDE.md`-এর উত্তরসূরি।_
_পুরনো guide-এ Railway + Vercel ছিল ($5/মাস, web বাদ)। মালিকের সিদ্ধান্ত অনুযায়ী
এখন **সম্পূর্ণ ফ্রি** stack, চারটা অংশই উঠবে, এবং **শুরু থেকেই দুই environment**।_

---

## ১. মূল সিদ্ধান্ত — দুইটা আলাদা জগৎ

```
        ┌─────────────────────────┐        ┌─────────────────────────┐
        │      DEMO (staging)     │        │    REAL (production)    │
        │    ফ্রি · বানানো ডেটা      │        │  টাকা লাগবে · আসল ডেটা   │
        ├─────────────────────────┤        ├─────────────────────────┤
        │ demo DB (আলাদা)          │        │ real DB (আলাদা)          │
        │ demo API                │        │ real API                │
        │ demo admin              │        │ real admin              │
        │ demo storefront         │        │ real storefront         │
        │ SSLCommerz sandbox      │        │ SSLCommerz live         │
        │ পাসওয়ার্ড-দেয়াল আছে       │        │ আসল login (D10)         │
        └───────────┬─────────────┘        └────────────▲────────────┘
                    │                                   │
         সব update/upgrade এখানে         পাশ করলে তবেই এখানে
         আগে test হবে      ─────────────────────►
```

**নিয়ম (এটাই আপনার চাওয়া, লিখে রাখলাম):**

1. কোনো নতুন feature/fix সরাসরি real-এ যাবে **না**।
2. আগে demo-তে উঠবে → `RUN_TESTS.bat` পাশ করবে → আপনি চোখে দেখে approve করবেন।
3. তারপরই real-এ promote হবে।
4. দুই environment-এর **ডেটাবেজ কখনো এক হবে না**। Demo-তে বানানো নাম/নম্বর,
   real-এ আসল গ্রাহক।

**Git-এ এটা যেভাবে হবে:**

| Branch | কোথায় যায় | কে push করে |
|---|---|---|
| `main` | Demo — push করলেই auto deploy | রোজকার কাজ এখানে |
| `production` | Real — `main` থেকে merge করলে auto deploy | শুধু approve হওয়ার পর |

---

## ২. Demo-র stack — খরচ ৳০

| # | অংশ | কোথায় | ফ্রি সীমা | যথেষ্ট? |
|---|---|---|---|---|
| ১ | **PostgreSQL** | **Neon** | ০.৫ GB storage, ১০০ compute-hour/মাস, কার্ড লাগে না, মেয়াদ শেষ হয় না | ✅ ডেমো ডেটার জন্য যথেষ্ট |
| ২ | **apps/api** (NestJS) | **Render** | ৭৫০ ঘণ্টা/মাস, Docker সাপোর্ট, কার্ড লাগে না | ✅ একটা service সারা মাস |
| ৩ | **apps/admin** (Next.js) | **Vercel Hobby** | ১০০ GB bandwidth/মাস | ✅ |
| ৪ | **apps/web** (Next.js) | **Vercel Hobby** | (একই কোটা) | ✅ ১০০-২০০ ভিজিটরে ধারে-কাছেও যাবে না |

**মোট: $0/মাস।** কোনো ধাপে ক্রেডিট কার্ড লাগবে না।

### কেন Railway নয় (পুরনো guide বদলালাম কেন)

Railway-র ফ্রি trial ৩০ দিনে শেষ, তারপর $5/মাস বাধ্যতামূলক। আপনি বলেছেন
"আপাতত ফ্রি-তে সব test করা যায় এমন জায়গা" — তাই Neon + Render + Vercel।
এই তিনটার ফ্রি টিয়ারের **মেয়াদ শেষ হয় না**।

### দুইটা সীমা আগেই জেনে রাখুন

**ক) Render ফ্রি service ১৫ মিনিট নীরব থাকলে ঘুমিয়ে যায়** — পরের ক্লিকে ৩০-৬০
সেকেন্ড সাদা স্ক্রিন। ডেমো কাউকে দেখানোর সময় এটা বিব্রতকর।
→ **সমাধান:** cron-job.org (ফ্রি) দিয়ে প্রতি ১০ মিনিটে API-র `/health`-এ একটা
ping। আমি `/health` endpoint-টা এমনভাবে বানাবো যে **সে DB ছোঁবে না** — তাহলে
API জেগে থাকবে কিন্তু Neon-এর compute-hour পুড়বে না। (দুইটা একসাথে সামলানোর
এটাই কৌশল।)

**খ) Neon-এর ১০০ compute-hour/মাস** — DB ৫ মিনিট নীরব থাকলে ঘুমায়, প্রথম
query-তে ~আধ সেকেন্ডে জাগে। উপরের কৌশলে ডেমো ব্যবহারের সময়টুকুই গোনা হবে,
মাসে ১০০ ঘণ্টার ধারে-কাছে যাবে না। (যদি কখনো যায়, Supabase ফ্রি-তে সরানো
আধ ঘণ্টার কাজ — connection string বদলানো ছাড়া কিছু না।)

### ⚠️ Real version-এ Vercel Hobby চলবে না

Vercel-এর terms-এ Hobby প্ল্যান **অ-বাণিজ্যিক** ব্যবহারের জন্য। ডেমো/শেখা/test
= ঠিক আছে। কিন্তু যেদিন আসল বিক্রি শুরু হবে, সেদিন থেকে Hobby ব্যবহার terms
ভাঙা। তখন দুটো পথ:

| পথ | খরচ | মন্তব্য |
|---|---|---|
| Vercel Pro | $20/মাস/ইউজার | সহজ, কিন্তু ৳২৪০০/মাস |
| **একটা VPS-এ চারটাই** (Hetzner/DigitalOcean) | **$5-7/মাস** | `docker-compose.prod.yml` দিয়ে, terms-এর ঝামেলা নেই, পূর্ণ নিয়ন্ত্রণ — **আমার সুপারিশ** |

আমি এখনই `docker-compose.prod.yml` বানিয়ে রাখবো, যাতে real-এ যাওয়ার দিন
নতুন করে কিছু বানাতে না হয়।

---

## ৩. কার কী কাজ

### 🤖 আমার কাজ (কোড — আপনি হাত দেবেন না)

| # | কাজ | কেন লাগবে |
|---|---|---|
| ১ | `apps/api/Dockerfile` production-ready করা | এখন `start:dev` চলে — সার্ভারে ক্র্যাশ করবে |
| ২ | `/health` endpoint (DB ছাড়া) | Render-এর health check + ping কৌশল |
| ৩ | `render.yaml` blueprint | Render-এ আপনার কাজ ১৫টা ক্লিক থেকে ১টায় নামবে |
| ৪ | `docker-compose.prod.yml` | real version-এর জন্য (এখনই বানিয়ে রাখা) |
| ৫ | নতুন `JWT_SECRET` তৈরি (demo + real আলাদা) | লোকালেরটা ইন্টারনেটে দেওয়া যাবে না |
| ৬ | `.env.demo.example` + `.env.production.example` | কোন variable কোথায় বসবে, তালিকা করে দেওয়া |
| ৭ | `main.ts`-এ CORS বন্ধ করা | এখন `enableCors()` খালি = পৃথিবীর যে কেউ API ডাকতে পারে |
| ৮ | ~~পাসওয়ার্ড-দেয়াল~~ → ডেমো noindex তালা | **সংশোধন:** login আসলে বানানোই আছে (DEC-FIN-028 — AuthGate + global AuthGuard + role + PIN)। পুরনো guide-এর D10 তথ্যটা অচল। তাই দেয়ালের বদলে দরকার ছিল Google-কে ঠেকানো |
| ৯ | Test data cleanup script | "(REGRESSION TEST)" order, `demo-*` পণ্য, `sobuj`/`radian`/`flower` slug — এগুলো Google-এ চলে যাবে |
| ১০ | Policy page publish + slug fix (`/return-refund-policy` → `/refund-policy`) | bKash/SSLCommerz merchant review-এর পূর্বশর্ত |
| ১১ | `git init` + `.gitignore` যাচাই + প্রথম commit | `.env` যেন ভুলেও না ওঠে |
| ১২ | `RUN_TESTS.bat` চালিয়ে ২৫টা business rule পাশ যাচাই | deploy-এর আগে ও পরে |
| ১৩ | প্রতি ধাপে বাংলায় হাতে-ধরা নির্দেশ + error এলে সমাধান | আপনি আটকাবেন না |

### 👤 আপনার কাজ (অ্যাকাউন্ট ও ক্লিক — আমি করতে পারি না)

| # | কাজ | সময় | কেন আমি পারি না |
|---|---|---|---|
| ১ | GitHub অ্যাকাউন্ট + **private** repo `radian` | ৫ মিন | আপনার পরিচয়ে খুলতে হবে |
| ২ | Git ইনস্টল (git-scm.com) + প্রথম `git push` | ১০ মিন | আপনার PC-তে লগইন লাগে |
| ৩ | Neon অ্যাকাউন্ট → project `radian-demo` | ৩ মিন | — |
| ৪ | Render অ্যাকাউন্ট → Blueprint দিয়ে API deploy | ৫ মিন | — |
| ৫ | Vercel অ্যাকাউন্ট → দুইটা project (admin, web) | ১০ মিন | — |
| ৬ | Dashboard-এ env variable বসানো (আমি তালিকা দেবো) | ১০ মিন | পাসওয়ার্ড/key |
| ৭ | cron-job.org-এ ping সেট করা | ৩ মিন | — |
| ৮ | চোখে দেখে যাচাই (checklist আমি দেবো) | ১০ মিন | approve আপনারই |
| — | **পরে:** ডোমেইন কেনা, SSLCommerz merchant, WhatsApp key | — | টাকা/কাগজপত্র |

> 🔐 **নিরাপত্তার নিয়ম:** কোনো পাসওয়ার্ড, `DATABASE_URL`, বা API key আমাকে
> চ্যাটে পাঠাবেন না। ওগুলো সরাসরি Neon/Render/Vercel-এর dashboard-এ বসাবেন।
> আমি শুধু বলবো "কোন ঘরে কী বসাতে হবে"।

---

## ৪. ধাপের ক্রম

| Phase | কী হবে | কে | নির্ভরশীল |
|---|---|---|---|
| **0** | কোড প্রস্তুতি (আমার ১৩টা কাজ) | 🤖 | — |
| **1** | GitHub repo + প্রথম push | 👤 (আমি নির্দেশ দেবো) | Phase 0 |
| **2** | Neon-এ `radian-demo` DB | 👤 | Phase 1 |
| **3** | Render-এ API + migration চলা | 👤 | Phase 2 |
| **4** | Vercel-এ admin + web | 👤 | Phase 3 (API URL লাগবে) |
| **5** | পাসওয়ার্ড-দেয়াল + ping + যাচাই তালিকা | 🤖 + 👤 | Phase 4 |
| **6** | ডেমো ডেটা সাজানো (বানানো পণ্য/order) | 👤 | Phase 5 |
| **7** | *পরে:* real version — VPS + ডোমেইন + live payment | দুজনে | ডেমো approve হলে |

**একবারে একটা Phase।** Phase শেষ হলে আমি দেখাবো, আপনি approve করলে পরেরটা।

---

## ৫. Phase 0-এর পর env variable কোথায় কী বসবে

_(আগাম দেখে রাখুন — Phase 3/4-এ এই তালিকা ধরে কাজ হবে)_

**Render (API service):**

| Variable | মান |
|---|---|
| `DATABASE_URL` | Neon-এর connection string |
| `JWT_SECRET` | আমি যেটা বানিয়ে দেবো (demo-রটা) |
| `JWT_REFRESH_EXPIRY_DAYS` | `30` |
| `PUBLIC_API_URL` | Render-এর দেওয়া ঠিকানা |
| `PUBLIC_WEB_URL` | Vercel web-এর ঠিকানা |
| `SSLCOMMERZ_IS_LIVE` | `false` |
| `SSLCOMMERZ_STORE_ID` / `_PASSWORD` | sandbox credential |
| `IMAGEKIT_*` | `.env` থেকে |
| ~~`PORT`~~ | ❌ **দেবেন না** — Render নিজে দেয় |

**Vercel (admin project):** `NEXT_PUBLIC_API_URL` = Render-এর ঠিকানা (শেষে `/` নয়)
**Vercel (web project):** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_IMAGE_BASE`

> ⚠️ `NEXT_PUBLIC_` দিয়ে শুরু হওয়া variable **build-এর সময়ই** কোডে ঢুকে যায়।
> Deploy-এর পরে বদলালে কিছু হবে না — **Redeploy করতে হবে**।

---

## ৬. এখন যা ভাঙা আছে (Phase 0-এ আমি ঠিক করবো)

| যাচাই করলাম | অবস্থা |
|---|---|
| `apps/api/Dockerfile` | ❌ `CMD npm run start:dev` — production build নেই |
| `docker-compose.prod.yml` | ❌ নেই |
| `git` | ❌ init-ই হয়নি, কোনো backup নেই |
| Prisma migration | ✅ **৭৫টা** (পুরনো guide-এ ২২ লেখা ছিল — সেটা অচল) |
| `.gitignore` | ✅ ঠিক আছে (`.env`, `backups/` বাদ) |
| `apps/web/Dockerfile` | ✅ আছে |
| `apps/admin/Dockerfile` | ❌ নেই (Vercel-এ লাগবে না, VPS-এ লাগবে) |
| admin login / API guard | ✅ **আছে** — কোড পড়ে দেখলাম: `AuthGate` + global `AuthGuard` + OWNER/MANAGER/STAFF role + টাকার কাজে ৪-সংখ্যার PIN। পুরনো guide-এর "কোনো guard নেই (D10)" কথাটা অচল |
| CORS | ❌ `enableCors()` খালি = সব খোলা |

---

## ৭. পরের ধাপ

আপনি "হ্যাঁ" বললে আমি **Phase 0** শুরু করবো — উপরের ১৩টা কোড-কাজ।
শেষ হলে diff দেখিয়ে বুঝিয়ে দেবো, তারপর Phase 1-এ আপনাকে GitHub-এ হাতে ধরে
নিয়ে যাবো।
