# ~~Radian Demo — আপনার ধাপগুলো (ক্লিক বাই ক্লিক)~~ · SUPERSEDED

> # 🛑 DO NOT FOLLOW THIS FILE ANY MORE (30 Aug 2026)
>
> These are instructions for deploying to **Vercel + Render + Neon**. All three
> are shut down; the whole system now lives on the Hostinger VPS.
>
> ⚠️ **THE ENV TABLES BELOW ARE NOW WRONG.** Copying `PUBLIC_API_URL`,
> `PUBLIC_WEB_URL` or `PUBLIC_ADMIN_URL` from here means the customer's card is
> charged and the order stays unpaid. That is exactly what happened on 27 Aug.
>
> **Today's correct instructions:** `CLAUDE.md` §2 (deploying to the VPS) and
> `RADIAN_ACCOUNTS.md` (what each account does).
>
> Not deleted — the reasoning for each decision is written here and still earns
> its place. Only the STEPS are no longer followable.

_কোডের কাজ শেষ (Phase 0)। এই ফাইলটা এখন থেকে আপনার。_
_মোট সময় ~৪৫ মিনিট। এক বসায় শেষ করতে হবে না — যেকোনো ধাপে থেমে পরে চালু করা যায়।_

> 🔐 **সারাক্ষণ মনে রাখার একটা নিয়ম:** কোনো পাসওয়ার্ড, `DATABASE_URL`, বা
> API key **আমাকে চ্যাটে পাঠাবেন না**। ওগুলো সরাসরি ওই ওয়েবসাইটের ঘরে
> paste করবেন। আমি শুধু বলবো কোন ঘরে কী বসবে।

> ❗ **আটকে গেলে:** "কোন ধাপে" আর "লাল লেখাটা হুবহু কী" — এই দুটো দিলেই ধরা যাবে।

---

## ধাপ ০ — push করার আগে একবার (২ মিনিট)

`D:\radian`-এ **`BUILD_CHECK.bat`** ডাবল-ক্লিক করুন। শেষে "পরিষ্কার" লেখা
দেখলে এগোন。

> **কেন আলাদা ফাইল, `radian_fix_generate.bat` থাকতে:** ওটা Prisma client
> বানায় **কনটেইনারের ভেতরে**। কনটেইনারের নিজের `node_modules` আছে, তাই
> Windows-এর ফোল্ডারটা অক্ষত থেকে যায় — অথচ `npm run build` আর VS Code
> দুটোই Windows-েরটাই পড়ে। schema বদলালে তাই এখানে পুরনো type থেকে যায়。
> `BUILD_CHECK.bat` সেই দিকটা ঠিক করে, আর ফলটা পর্দায় দেখায়。
>
> (`radian_build.bat` কিছু দেখায় না — ইচ্ছাকৃত, সব `_build.log`-এ যায়।)

---

## ধাপ ১ — GitHub (১৫ মিনিট)

### ১ক. Git ইনস্টল

[git-scm.com/download/win](https://git-scm.com/download/win) → ডাউনলোড → সব
default রেখে **Next → Next → Install**। শেষে PC একবার restart দিলে ভালো।

### ১খ. GitHub অ্যাকাউন্ট ও repo

1. [github.com](https://github.com) → **Sign up** (sobujgazi77@gmail.com দিয়েই)
2. উপরে ডানে **+** → **New repository**
3. Repository name: `radian`
4. **🔴 Private বেছে নিন** — এটা সবচেয়ে গুরুত্বপূর্ণ ক্লিক। Public হলে
   আপনার পুরো ব্যবসার লজিক সবার সামনে。
5. "Add a README" / "Add .gitignore" — **কিছুই টিক দেবেন না**
6. **Create repository**

পরের পাতায় একটা ঠিকানা দেখাবে —
`https://github.com/আপনার-নাম/radian.git`। **সেটা কপি করে রাখুন।**

### ১গ. কোড পাঠানো

`D:\radian` ফোল্ডারে গিয়ে ফাঁকা জায়গায় **Shift + ডান-ক্লিক** →
**"Open PowerShell window here"** (বা "Open in Terminal")。

আমি ইতিমধ্যে `git init` করে প্রথম commit বানিয়ে রেখেছি — তাই আপনার শুধু
তিনটা লাইন:

```powershell
git remote add origin https://github.com/আপনার-নাম/radian.git
git branch -M main
git push -u origin main
```

প্রথম push-এ ব্রাউজার খুলে GitHub লগইন চাইবে → **Authorize** দিন।

### ১ঘ. ⚠️ যাচাই — এই একটা জিনিস না দেখে এগোবেন না

GitHub-এ repo-টা খুলে **ফাইলের তালিকায় `.env` খুঁজুন。**

- `.env.example`, `.env.demo.example`, `.env.production.example` **থাকবে** ✅
  (এগুলোতে শুধু নমুনা, কোনো আসল পাসওয়ার্ড নেই)
- খালি `.env` বা `.env.secrets.local` **থাকবে না** ✅

দ্বিতীয়টা যদি দেখেন — **থামুন, আমাকে বলুন।**

> 💡 আজকের পর থেকে প্রতিবার কাজ শেষে:
> ```powershell
> git add .
> git commit -m "কী বদলালো, এক লাইন"
> git push
> ```
> এটাই আপনার ব্যাকআপ। কোনোদিন `db_reset.bat` ভুলে চালালেও কোড ফেরত আসবে।

---

## ধাপ ২ — Neon (ডেটাবেজ) · ৫ মিনিট

1. [neon.com](https://neon.com) → **Sign up with GitHub** (কার্ড লাগবে না)
2. **New Project**
   - Project name: `radian-demo`
   - Postgres version: **16**
   - Region: **Asia Pacific (Singapore)** ← ঢাকার সবচেয়ে কাছে
3. তৈরি হলে **Connection string** দেখাবে。
   - **"Pooled connection" টগলটা বন্ধ রাখুন** ← গুরুত্বপূর্ণ。
     Prisma-র migration pooler দিয়ে চলে না, `P1001` error দেবে。
   - শেষে `?sslmode=require` আছে কিনা দেখুন。
4. স্ট্রিংটা কপি করে **সাময়িকভাবে Notepad-এ রাখুন** — পরের ধাপে লাগবে,
   তারপর Notepad-টা মুছে ফেলবেন。

---

## ধাপ ৩ — Render (API) · ১০ মিনিট

1. [render.com](https://render.com) → **Sign up with GitHub**
2. **New → Blueprint** ← "Web Service" নয়, **Blueprint**
3. আপনার `radian` repo বেছে দিন → **Connect**

   Render নিজেই `render.yaml` পড়ে সব সেটিং বসিয়ে নেবে (root directory,
   Dockerfile, health check, region — সব)। আপনাকে শুধু গোপন মানগুলো দিতে হবে。

4. Render যে ঘরগুলো জিজ্ঞেস করবে:

| ঘর | কী বসাবেন |
|---|---|
| `DATABASE_URL` | ধাপ ২-এর Neon স্ট্রিং |
| `JWT_SECRET` | `D:\radian\.env.secrets.local` ফাইল খুলে **DEMO_JWT_SECRET**-এর মান |
| `PUBLIC_API_URL` | এখন `https://radian-api-demo.onrender.com` লিখে রাখুন (deploy শেষে মিলিয়ে নেবেন) |
| `PUBLIC_WEB_URL` | এখন ফাঁকা — ধাপ ৪-এ ভরবো |
| `PUBLIC_ADMIN_URL` | এখন ফাঁকা — ধাপ ৪-এ ভরবো |
| `IMAGEKIT_*` · `NEXT_PUBLIC_IMAGE_BASE` | `D:\radian\.env` থেকে কপি |
| `SSLCOMMERZ_STORE_ID` / `_PASSWORD` | **ফাঁকা রাখুন** — ফাঁকা মানে sandbox |

5. **Apply / Create** → Render build শুরু করবে (~৫-৮ মিনিট, প্রথমবার বেশি)

6. **Logs**-এ যা দেখতে চান:

```
Applying migration `2025...`
...
75 migrations found
[CORS] allowed: http://localhost:3000, ...
[Radian API] listening on 10000 (NODE_ENV=production)
```

7. উপরে service-এর ঠিকানা দেখাবে (`https://radian-api-demo.onrender.com`)。
   ব্রাউজারে খুলুন `<ঠিকানা>/health` → এরকম আসবে:

```json
{"ok":true,"at":"2026-08-04T...","uptimeSec":42}
```

**এলে API লাইভ ✅** (নতুন DB খালি, তাই `/products` খুললে `[]` আসাই স্বাভাবিক。)

8. ধাপ ৩-এর আসল ঠিকানাটা `PUBLIC_API_URL` ঘরে ঠিক আছে কিনা মিলিয়ে নিন。

---

## ধাপ ৪ — Vercel (admin + দোকান) · ১৫ মিনিট

**দুইটা আলাদা project বানাতে হবে** — একই repo, ভিন্ন ফোল্ডার。

### ৪ক. Admin panel

1. [vercel.com](https://vercel.com) → **Sign up with GitHub**
2. **Add New → Project** → `radian` → **Import**
3. Configure পর্দায়:
   - Project Name: `radian-admin-demo`
   - **Root Directory → Edit → `apps/admin`** ← মূল সেটিং, ভুল হলে build ফেল
   - Framework: Next.js (নিজেই ধরবে)
4. **Environment Variables**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | ধাপ ৩-এর Render ঠিকানা (**শেষে `/` নয়**) |

5. **Deploy** → ২-৩ মিনিট → `radian-admin.vercel.app` পাবেন

### ৪খ. গ্রাহকের দোকান

1. আবার **Add New → Project** → `radian` → Import
2. - Project Name: `radian-web-demo`
   - **Root Directory → `apps/web`**
3. **Environment Variables**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Render ঠিকানা |
| `API_INTERNAL_URL` | একই Render ঠিকানা |
| `NEXT_PUBLIC_SITE_URL` | `https://radian-web-tan.vercel.app` |
| `NEXT_PUBLIC_IMAGE_BASE` | `.env` থেকে |
| `NEXT_PUBLIC_DEMO_MODE` | `true` ← **ভুলবেন না** |

> `NEXT_PUBLIC_DEMO_MODE=true` মানে দোকানটা Google-কে বলবে "আমাকে
> খুঁজো না"。 না দিলে `demo-rose-1` জাতীয় test পণ্য search result-এ
> ঢুকে যাবে, আর একবার ঢুকলে সরাতে সপ্তাহ লাগে。

4. **Deploy**

### ৪গ. 🔴 Render-এ ফিরে দুটো ঘর ভরুন

এটা না করলে **admin খুলবে কিন্তু সব ফাঁকা দেখাবে**。

Render → radian-api-demo → **Environment**:

| ঘর | মান |
|---|---|
| `PUBLIC_ADMIN_URL` | `https://radian-admin.vercel.app` |
| `PUBLIC_WEB_URL` | `https://radian-web-tan.vercel.app` |

Save → Render নিজে restart করবে。 Logs-এ `[CORS] allowed:` লাইনে এখন
দুটো vercel ঠিকানাই দেখা যাবে。

---

## ধাপ ৫ — ঘুম ঠেকানো · ৩ মিনিট

Render-এর ফ্রি service ১৫ মিনিট নীরব থাকলে ঘুমায় (পরের ক্লিকে ~১ মিনিট
সাদা পর্দা)。

1. [cron-job.org](https://cron-job.org) → ফ্রি অ্যাকাউন্ট
2. **Create cronjob**
   - URL: `https://radian-api-demo.onrender.com/health`
   - Schedule: **every 10 minutes**
3. Save

> `/health` ইচ্ছাকৃতভাবে ডেটাবেজ ছোঁয় না。 তাই API জেগে থাকবে, কিন্তু
> Neon ঘুমিয়েই থাকবে — মাসের ১০০ compute-hour কোটা পুড়বে না。
> **এই কারণেই `/products`-এ ping করবেন না।**

---

## ধাপ ৬ — যাচাই তালিকা

এক এক করে টিক দিন。 যেটায় আটকাবেন, সেটার নাম বলবেন。

- [ ] GitHub repo **Private**, আর তালিকায় খালি `.env` **নেই**
- [ ] Render Logs-এ `75 migrations` + `listening on`
- [ ] `<api>/health` → `{"ok":true,...}`
- [ ] `<api>/products` → `[]` (খালি DB, ঠিক আছে)
- [ ] Render Logs-এ `[CORS] allowed:` লাইনে দুটো vercel ঠিকানাই আছে
- [ ] Admin খুললে **login পর্দা আসে** (মালিক অ্যাকাউন্ট বানানোর সুযোগ দেবে)
- [ ] Login করে sidebar-এ Products, Orders, Finance… সব দেখা যায়
- [ ] একটা Product বানিয়ে **refresh করলে টিকে থাকে** ← এটাই প্রমাণ DB সত্যিই যুক্ত
- [ ] `<web>/robots.txt` খুললে `Disallow: /` লেখা ← ডেমো Google-এ যাবে না
- [ ] cron-job চালু

---

## ভুল হলে কোথায় দেখবেন

| যা দেখছেন | কারণ | সমাধান |
|---|---|---|
| Render: "Application failed to respond" | `PORT` হাতে বসিয়েছেন | Environment থেকে `PORT` মুছুন |
| Render logs: `P1001 Can't reach database` | Neon-এর **pooled** স্ট্রিং দিয়েছেন | pooled টগল বন্ধ করে সাধারণ স্ট্রিং নিন |
| Render logs: `P1001` + `sslmode` | শেষে `?sslmode=require` নেই | যোগ করুন |
| Render build fail: `Cannot find module` | render.yaml পড়েনি (Blueprint-এর বদলে Web Service বানিয়েছেন) | মুছে **Blueprint** দিয়ে আবার |
| Admin খোলে, সব ফাঁকা, console-এ **CORS** | Render-এ `PUBLIC_ADMIN_URL` ফাঁকা বা ভুল | ধাপ ৪গ করুন |
| Admin খোলে, সব ফাঁকা, console-এ **localhost:4000** | Vercel-এ `NEXT_PUBLIC_API_URL` ভুল বা deploy-এর পরে বসানো | ঠিক করে **Redeploy** (build-এর সময়ই কোডে ঢোকে) |
| প্রথম ক্লিকে ~১ মিনিট সাদা | Render ঘুমিয়েছিল | ধাপ ৫ করেছেন? |
| Vercel build fail: TypeScript error | লোকালে watch-mode ছিল, ধরা পড়েনি | `cd apps\admin` → `npm run build` লোকালে চালিয়ে ঠিক করুন |

---

## এরপর কী

ডেমো দাঁড়ালে:

1. **ডেমো ডেটা সাজানো** — বানানো নাম/নম্বর দিয়ে পণ্য, category, order
2. `PRE_DEPLOY_CHECK.bat` চালিয়ে দেখা কিছু আটকে আছে কিনা
3. Policy page ৪টা লেখা ও publish (bKash/SSLCommerz merchant review-এর পূর্বশর্ত)
4. **তারপর real version** — VPS + ডোমেইন + আসল payment key
   (`docker-compose.prod.yml` + `Caddyfile` বানিয়ে রাখা আছে)
