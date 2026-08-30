# Radian — Demo Deploy Guide (বিগিনার সংস্করণ)

> # 🛑 DO NOT FOLLOW THIS FILE ANY MORE (30 Aug 2026)
>
> These are instructions for deploying to **Vercel + Render + Neon**. All three
> are shut down; the whole system now lives on the Hostinger VPS.
>
> **Today's correct instructions:** `CLAUDE.md` §2 · `RADIAN_ACCOUNTS.md`
>
> Not deleted — the reasoning for each decision is written here and still
> earns its place. Only the STEPS are no longer followable.

_তৈরি: 26 July 2026। উদ্দেশ্য: প্রথমবার একটা ডেমো সার্ভারে Radian তোলা এবং ডোমেইন যুক্ত করা।_
_এই ফাইল ধাপে ধাপে পড়ুন। কোনো ধাপ লাফ দেবেন না — প্রতিটার আগেরটার উপর নির্ভরশীল।_

---

## ⚠️ হালনাগাদ — ৪ আগস্ট ২০২৬ (নিচের পুরনো লেখার আগে এটা পড়ো)

নিচের guide-টা ২৬ July-র। তখন থেকে প্রকল্প অনেক এগিয়েছে — **তিনটা জায়গায় পুরনো
লেখাটা এখন ভুল**, আর নতুন কিছু জিনিস যোগ হয়েছে যা deploy-এর সময় লাগবেই।

### ১. `apps/web` এখন সম্পূর্ণ live — অবশ্যই deploy হবে

পুরনো guide বলছে "storefront mock ডেটায় চলে, বাদ দাও" (W1)। **সেটা শেষ।**
Storefront এখন পুরোপুরি API-তে চলে: catalogue, cart, checkout (server-side
pricing), SSLCommerz (sandbox), track order, reviews, policy/FAQ/SEO — সব
admin-এর ডেটা থেকে। কাজেই deploy-এ এখন **চারটা** জিনিস উঠবে: PostgreSQL,
`apps/api`, `apps/admin`, `apps/web`।

### ২. নতুন environment variable (২৬ July-র পরে যোগ হয়েছে)

`.env.example`-এ সব আছে; production-এ এগুলোর আসল মান লাগবে:

- `PUBLIC_API_URL` — API-র ইন্টারনেট-ঠিকানা। **SSLCommerz-এর IPN/redirect
  এখানে আসে — localhost হলে payment সম্পূর্ণ হবে না।**
- `PUBLIC_WEB_URL` — storefront-এর ঠিকানা (robots.txt-এর sitemap pointer,
  payment শেষে ফেরার পথ)।
- `NEXT_PUBLIC_SITE_URL` — `apps/web`-এর sitemap/canonical-এর base।
- `WA_TPL_*` (ঐচ্ছিক) — WhatsApp template-এর নাম override। WhatsApp আর
  SSLCommerz-এর **আসল key admin → Integrations থেকে দেওয়া হয়, env লাগে না**
  (env শুধু fallback)। মালিক বলেছেন WhatsApp key পরে বসাবেন।

### ৩. যাচাইয়ের যন্ত্র: `RUN_TESTS.bat`

Deploy-এর আগে ও পরে regression suite চালাও (`RUN_TESTS.bat`, গভীরটা
`RUN_TESTS.bat full`) — ২৫টা locked business rule এক run-এ পরীক্ষা হয়,
শেষে ALL GOOD নয়তো কোন নিয়ম ভাঙল তার নাম। Production DB-তে `full` চালিয়ো
না (একটা delivered test order রেখে যায়)।

### ৪. Deploy-এর আগের checklist (এখনো বাকি যা)

- [ ] `docker-compose.prod.yml` বানানো (dev compose hot-reload-ওয়ালা, ওটা
      production-এর জন্য না)
- [ ] নতুন (fresh) `JWT_SECRET`
- [ ] `prisma migrate deploy` production DB-তে
- [ ] Test data পরিষ্কার: "(REGRESSION TEST)" ঠিকানার order, demo-* পণ্য,
      category slug (sobuj/radian/flower/demo-gifts — এগুলো Google-এ যায়!),
      duplicate occasion tag (love/love-romance)
- [ ] Policy page-গুলো publish (৪টা draft পড়ে আছে; slug ঠিক করো:
      `/return-refund-policy` → `/refund-policy`) — **bKash/SSLCommerz merchant
      review-এর আগে এগুলো লাগবেই**
- [ ] GitHub repo **অবশ্যই private**; `.gitignore` যাচাই করা আছে (`.env`,
      `backups/` ঢুকবে না) — তবু push-এর আগে `git status` দেখে নাও
- [ ] SSLCommerz এখন sandbox — আসল merchant credential পেলে admin →
      Integrations-এ বসালেই live (কোড বদল লাগবে না)

---

## ০. আগে বুঝে নিন — এখানে "হোস্টিং" মানে কী

সাধারণ ওয়েবসাইট (HTML/WordPress) হোস্ট করা মানে **ফাইল আপলোড করা**। আপনার প্রজেক্ট সেরকম নয়।
Radian-এ **তিনটা আলাদা প্রোগ্রাম ২৪ ঘণ্টা চালু থাকতে হয়**, আর তারা নিজেদের মধ্যে কথা বলে:

| # | অংশ | আসলে কী | কী লাগে |
|---|---|---|---|
| ১ | **PostgreSQL** | সব ডেটা এখানে থাকে | ডেটাবেজ সার্ভার |
| ২ | **`apps/api`** (NestJS) | সব নিয়ম-কানুন, হিসাব, business rule | Node.js সার্ভার, সবসময় চালু |
| ৩ | **`apps/admin`** (Next.js) | আপনি যে পর্দাগুলো দেখেন | Node.js সার্ভার |
| ৪ | *`apps/web`* (Next.js) | গ্রাহকের দোকান | *আপাতত বাদ — নিচে কারণ* |

লোকালে এখন এটাই হচ্ছে: `docker-compose` তিনটা container চালায়, তারা `localhost`-এ একে অন্যকে খুঁজে পায়।
সার্ভারে একই জিনিস হবে, শুধু `localhost`-এর বদলে আসল URL বসবে।

> ⛔ **এই কারণেই সাধারণ cPanel / shared hosting-এ (Hostinger, Namecheap, GoDaddy-র ৳২০০–৫০০/মাসের প্যাকেজ) এটা চলবে না।** ওগুলো PHP ফাইল সার্ভ করার জন্য বানানো — Node.js process ২৪ ঘণ্টা চালাতে দেয় না, PostgreSQL দেয় না। টাকা দিয়ে কিনে ফেললে পুরোটাই নষ্ট হবে।

---

## ১. যে পথটা আমরা নিচ্ছি (এবং কেন)

| অংশ | কোথায় বসবে | খরচ |
|---|---|---|
| PostgreSQL | **Railway** | ↓ |
| `apps/api` | **Railway** (একই project-এ) | Hobby প্ল্যান **$5/মাস** (দুটো মিলে) |
| `apps/admin` | **Vercel** | **ফ্রি** (Hobby) |
| `apps/web` | এখন নয় | — |

**মোট: ~$5/মাস (~৳৬০০)।** ডেমোর জন্য ডোমেইন কিনতে হবে না — দুটো প্ল্যাটফর্মই ফ্রি সাব-ডোমেইন দেয়।

### কেন `apps/web` বাদ দিচ্ছি
`RADIAN_PENDING.md` → **W1**: storefront এখনো mock ডেটায় চলে, `:4000` API-র সাথে যুক্তই নয়।
এখন deploy করলে সেটা admin-এর ডেটা দেখাবে না — ডেমো দেখাতে গিয়ে বিভ্রান্তি বাড়বে। **আসল ডেমো = admin panel**, ওখানে ১৮টা module বসানো আছে। web পরে, W1 শেষ হলে।

### কেন Railway, Render নয়
Render-এর ফ্রি প্ল্যানে দুটো সমস্যা ডেমোর জন্য বিব্রতকর — ১৫ মিনিট কেউ না ঢুকলে সার্ভার ঘুমিয়ে যায় (পরের ক্লিকে ~১ মিনিট সাদা স্ক্রিন), আর **ফ্রি PostgreSQL ৩০ দিন পর ডেটাসহ মুছে যায়**। Railway-র $5 প্ল্যানে এ দুটোর কোনোটাই নেই।

### কেন admin আলাদা করে Vercel-এ
Next.js Vercel-এরই বানানো — কোনো config লাগে না, repo দেখিয়ে দিলেই হয়। Railway-তে দিলে Dockerfile নিয়ে ধস্তাধস্তি করতে হতো।

> ⚠️ Vercel Hobby তাদের terms-এ **demo/portfolio/শেখার জন্য অনুমোদিত, বাণিজ্যিক ব্যবহারে নয়**। ডেমো পর্যায়ে ঠিক আছে; আসল বিক্রি শুরু হলে Pro ($20/মাস) লাগবে অথবা তখন সব Railway-তে সরিয়ে নেবেন।

---

## ২. ধাপ ০ — কোডে ৩টা জিনিস ঠিক করা (এগুলো ছাড়া deploy ফেল করবে)

লোকালে `docker-compose` আপনার app চালায় **development mode**-এ (`npm run dev`, `nest start --watch`)। ওটা ধীর, বেশি RAM খায়, আর সার্ভারে ক্র্যাশ করে। Production-এ আগে **build** করতে হয়, তারপর চালাতে হয়।

### ০.১ `apps/api/Dockerfile` — production build যোগ করুন

এখন শেষ লাইনগুলো এরকম:

```dockerfile
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]
```

বদলে দিন:

```dockerfile
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
```

**কী হলো:**
- `npm run build` — TypeScript কে চালানোর উপযোগী JavaScript-এ রূপান্তর (`dist/` ফোল্ডার)
- `npx prisma migrate deploy` — সার্ভার চালু হওয়ার আগে **আপনার ২২টা migration নতুন DB-তে বসিয়ে দেবে**। এটাই আপনার `radian_*_migrate.bat` ফাইলগুলোর সার্ভার-সংস্করণ। (`migrate dev` নয় — ওটা ডেটা মুছে ফেলতে পারে।)
- `node dist/main` — build করা app চালু

> ✅ **এতে আপনার লোকাল setup ভাঙবে না।** `docker-compose.yml`-এ `command: npm run start:dev` লাইনটা এই `CMD`-কে override করে, তাই লোকালে আগের মতোই watch-mode-এ চলবে।

### ০.২ Railway-তে `PORT` হাতে সেট করবেন না

`apps/api/src/main.ts` ইতিমধ্যেই ঠিক আছে — `process.env.PORT ?? 4000` পড়ে। Railway নিজে একটা `PORT` ঢুকিয়ে দেয়।
আপনি যদি Railway-র env-এ নিজে `PORT=4000` লিখে দেন, Railway আপনার app খুঁজে পাবে না → "Application failed to respond"। **তাই `.env` কপি করার সময় `PORT` লাইনটা বাদ দিন।**

### ০.৩ ডেমোতে আসল API key দেবেন না

আপনার `.env`-এ SSLCommerz, WhatsApp, Cloudinary, Resend-এর আসল key আছে। ডেমো সার্ভার ইন্টারনেটে খোলা থাকবে।

- `SSLCOMMERZ_*` → **sandbox/test credentials**, আর `SSLCOMMERZ_IS_LIVE=false`
- `JWT_SECRET` → ডেমোর জন্য **নতুন একটা** বানান (লোকালেরটা নয়)
- WhatsApp/Resend → ডেমোতে না দিলেও চলবে (ওই ফিচার শুধু কাজ করবে না)

---

## ৩. ধাপ ১ — GitHub-এ কোড তোলা

Railway আর Vercel দুটোই **GitHub থেকে কোড টেনে নেয়**। তাই এটা আগে করতেই হবে।
ভালো খবর: আপনার `.gitignore` ইতিমধ্যেই ঠিক আছে এবং আগে কখনো commit হয়নি, তাই **`.env` ফাঁস হওয়ার ঝুঁকি নেই**।

**১.** [github.com](https://github.com)-এ অ্যাকাউন্ট খুলুন → **New repository** → নাম `radian` → **Private** বেছে নিন (গুরুত্বপূর্ণ) → README/gitignore কিছু যোগ করবেন **না** → Create।

**২.** [git-scm.com/download/win](https://git-scm.com/download/win) থেকে Git ইনস্টল করুন (সব default রেখে Next চাপতে থাকুন)।

**৩.** `D:\radian` ফোল্ডারে PowerShell খুলুন (ফোল্ডারে Shift+ডান-ক্লিক → "Open PowerShell window here") এবং এক এক লাইন চালান:

```powershell
git init
git add .
git status
```

> 🔎 `git status`-এর তালিকায় **`.env` আছে কিনা দেখুন। থাকলে থামুন** — `.gitignore` কাজ করছে না, আমাকে বলুন। না থাকলে এগিয়ে যান।

```powershell
git commit -m "Radian Business OS — initial commit"
git branch -M main
git remote add origin https://github.com/<আপনার-ইউজারনেম>/radian.git
git push -u origin main
```

প্রথম push-এ GitHub লগইন চাইবে — ব্রাউজার খুলে অনুমতি দিন।

**এই ধাপের আসল লাভ:** ডেপ্লয় বাদ দিলেও, আজকের পর থেকে আপনার ৩ মাসের কাজের একটা ব্যাকআপ থাকল। এখন কোনো `db_reset.bat` ভুলে চালালেও কোড ফেরত আনা যাবে।

**এরপর থেকে প্রতিবার কাজ শেষে:**

```powershell
git add .
git commit -m "কী বদলালো তার এক লাইন"
git push
```

---

## ৪. ধাপ ২ — Railway-তে ডেটাবেজ

**১.** [railway.com](https://railway.com) → GitHub দিয়ে Sign up → **Hobby প্ল্যান ($5/মাস)** নিন। (ফ্রি trial-এ $5 ক্রেডিট ৩০ দিনের, তারপর সার্ভিস বন্ধ হয়ে যাবে — ডেমো টিকিয়ে রাখতে Hobby দরকার।)

**২.** **New Project** → **Deploy PostgreSQL** → এক ক্লিকে DB তৈরি।

**৩.** DB-র উপর ক্লিক → **Variables** ট্যাব → `DATABASE_URL` দেখতে পাবেন। এটাই আপনার সার্ভার-ডেটাবেজের ঠিকানা। কপি করার দরকার নেই, পরের ধাপে Railway নিজেই জুড়ে দেবে।

---

## ৫. ধাপ ৩ — Railway-তে API

**১.** একই project-এ **New** → **GitHub Repo** → `radian` বেছে নিন।

**২.** সার্ভিসটা তৈরি হলে তার **Settings** ট্যাবে যান:
- **Root Directory** → `apps/api` ← **সবচেয়ে গুরুত্বপূর্ণ সেটিং।** এটা না দিলে Railway পুরো repo-কে একটা app ভেবে ফেল করবে।
- Builder → **Dockerfile** (আপনার `apps/api/Dockerfile` আছে বলে নিজেই ধরে নেবে)

**৩.** **Variables** ট্যাবে গিয়ে যোগ করুন:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` ← হুবহু এটাই লিখুন |
| `JWT_SECRET` | নতুন একটা লম্বা random লেখা |
| `JWT_REFRESH_EXPIRY_DAYS` | `30` |
| বাকিগুলো | `.env` থেকে, **`PORT` আর `NEXT_PUBLIC_API_URL` বাদ দিয়ে** |

`${{Postgres.DATABASE_URL}}` লেখাটা Railway-র নিজস্ব ভাষা — "পাশের Postgres সার্ভিসের ঠিকানাটা এখানে বসাও"। DB-র পাসওয়ার্ড বদলালেও এটা নিজে নিজে ঠিক থাকবে।

**৪.** **Settings → Networking → Generate Domain** → একটা ঠিকানা পাবেন, যেমন `radian-api-production.up.railway.app`। **এটা লিখে রাখুন**, পরের ধাপে লাগবে।

**৫.** **Deployments → View Logs** দেখুন। যা দেখতে চান:

```
Applying migration ...
22 migrations found
Nest application successfully started
```

**৬.** ব্রাউজারে `https://<আপনার-api-ঠিকানা>/products` খুলুন। JSON (`[]` বা ডেটার তালিকা) এলে **API লাইভ** ✅ (নতুন DB খালি, তাই `[]` আসাই স্বাভাবিক।)

---

## ৬. ধাপ ৪ — Vercel-এ Admin Panel

**১.** [vercel.com](https://vercel.com) → GitHub দিয়ে Sign up → **Add New → Project** → `radian` repo → Import।

**২.** Configure পর্দায়:
- **Root Directory** → **Edit** চাপুন → `apps/admin` বেছে নিন ← আবারও, এটাই মূল সেটিং
- Framework Preset → Next.js (নিজেই ধরে নেবে)

**৩.** **Environment Variables**-এ একটাই লাগবে:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<ধাপ ৩-এর api ঠিকানা>` (শেষে `/` দেবেন না) |

> ⚠️ **এটা বিগিনারদের সবচেয়ে কমন ফাঁদ।** `NEXT_PUBLIC_` দিয়ে শুরু হওয়া variable **build-এর সময়ই** কোডের ভেতর ঢুকে যায়। Deploy হওয়ার পরে এটা বদলালে কিছুই হবে না — **আবার Redeploy করতে হবে**। ভুল হলে লক্ষণ: পর্দা খোলে কিন্তু সব খালি, ব্রাউজার console-এ `localhost:4000` fetch error।

**৪.** **Deploy** → ২-৩ মিনিট → `radian-xxxx.vercel.app` ঠিকানা পাবেন।

**৫.** খুলুন। sidebar-এ Products, Customers, Orders, Inventory, Finance… সব দেখা যাবে। **আপনার ডেমো লাইভ** ✅

---

## ৭. ধাপ ৫ — ডোমেইন

### ডেমোর জন্য: কিছুই করতে হবে না
`radian-xxxx.vercel.app` ঠিকানাটা আসল, HTTPS-সহ, যে কাউকে পাঠানো যায়। **ডেমো পর্যায়ে ডোমেইন কেনা টাকা নষ্ট।**

### তবু নিজের ডোমেইন চাইলে

**১.** [namecheap.com](https://namecheap.com) বা [porkbun.com](https://porkbun.com)-এ কিনুন (`.com` ~$10–12/বছর)। বাংলাদেশি `.com.bd` নয় — কাগজপত্র লাগে, ডেমোর জন্য ঝামেলা।

**২.** Vercel-এ: Project → **Settings → Domains** → আপনার ডোমেইন লিখুন → Vercel বলে দেবে ঠিক কী বসাতে হবে।

**৩.** ডোমেইন যেখান থেকে কিনেছেন, সেখানকার DNS পাতায় সেটা বসান:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | Vercel-এর দেওয়া IP |
| `CNAME` | `www` | `cname.vercel-dns.com` |

**৪.** ২৪ ঘণ্টা পর্যন্ত অপেক্ষা লাগতে পারে (সাধারণত ১০-৩০ মিনিট)। HTTPS সার্টিফিকেট Vercel নিজে বসিয়ে দেবে।

> 💡 **পরামর্শ:** আসল ডোমেইন কিনলেও ডেমোটা `staging.radian…`-এ রাখুন, মূল ঠিকানায় নয়। তাহলে পরে আসল সাইট চালু করার সময় ডেমোটা সরাতে হবে না।

---

## ৮. 🔴 ডেমো লিংক কাউকে পাঠানোর আগে — অবশ্যই পড়ুন

কোড ঘেঁটে দেখলাম: **`apps/admin`-এ কোনো লগইন নেই, আর `apps/api`-তে কোনো guard নেই** (`@UseGuards` একটাও পাওয়া যায়নি)। উপরন্তু `main.ts`-এ `app.enableCors()` খালি — অর্থাৎ **পৃথিবীর যেকোনো সাইট আপনার API-তে কল করতে পারবে।**

মানে দাঁড়ায়: **যে কেউ ওই লিংক পেলে গ্রাহকের ফোন নম্বর দেখতে পারবে, order cancel করতে পারবে, refund দিতে পারবে।** এটাই `RADIAN_PENDING.md`-এর **D10**।

ডেমো পর্যায়ে যা করবেন:

1. **লিংক শুধু নিজের/বিশ্বস্ত কারো কাছে** — সোশ্যাল মিডিয়া বা পোর্টফোলিওতে নয়
2. **আসল গ্রাহকের ডেটা ঢোকাবেন না** — বানানো নাম/নম্বর দিয়ে ডেমো সাজান
3. **আসল payment key নয়** — sandbox only (ধাপ ০.৩)

চাইলে আমি **একটা সহজ পাসওয়ার্ড-দেয়াল** বসিয়ে দিতে পারি (Next.js middleware, ~২০ লাইন, ফ্রি) — লিংক খুললেই ইউজারনেম/পাসওয়ার্ড চাইবে। ডেমো অন্যকে দেখানোর আগে এটা করে নেওয়াই বুদ্ধিমানের কাজ। **আসল Roles & Permissions module (D10) পরে, লাইভে যাওয়ার আগে।**

---

## ৯. যাচাই তালিকা (ধাপে ধাপে টিক দিন)

- [ ] `git status`-এ `.env` **নেই**
- [ ] GitHub repo **Private**
- [ ] Railway logs-এ `22 migrations` + `Nest application successfully started`
- [ ] `https://<api>/products` → JSON আসে
- [ ] Vercel-এ `NEXT_PUBLIC_API_URL` বসানো এবং **তারপর** deploy হয়েছে
- [ ] admin খুললে sidebar-এর module গুলো দেখা যায়
- [ ] একটা Product তৈরি করে **রিফ্রেশ করলে টিকে থাকে** ← এটাই প্রমাণ করে DB সত্যিই যুক্ত
- [ ] পাসওয়ার্ড-দেয়াল বসানো (লিংক শেয়ার করার আগে)

---

## ১০. ভুল হলে কোথায় দেখবেন

| যা দেখছেন | সম্ভাব্য কারণ | সমাধান |
|---|---|---|
| Railway: "Application failed to respond" | `PORT` হাতে সেট করা | Variables থেকে `PORT` মুছুন |
| Railway build fail: `Cannot find module` | Root Directory ভুল | `apps/api` দিয়েছেন কিনা দেখুন |
| Railway logs: `P1001 Can't reach database` | `DATABASE_URL` ভুল | হুবহু `${{Postgres.DATABASE_URL}}` লেখা আছে কিনা |
| Admin খোলে কিন্তু সব খালি | `NEXT_PUBLIC_API_URL` ভুল বা build-এর পরে বসানো | ঠিক করে **Redeploy** |
| Console-এ `CORS` error | API ঠিকানায় `/` বা `http://` ভুল | `https://`, শেষে `/` নেই |
| Vercel build fail: TypeScript error | লোকালে `--watch` ছিল, তাই ধরা পড়েনি | `cd apps/admin && npm run build` লোকালে চালিয়ে আগে ঠিক করুন |

---

## ১১. এরপর কী (লাইভে যাওয়ার আগে)

ডেমো দাঁড়ালে ক্রমটা হবে:

1. বাকি migration + মালিক-যাচাই (Offers · Delivery · Returns · Supplier · Finance ধাপ ১)
2. **D10** — Roles & Permissions (লাইভের পূর্বশর্ত)
3. **D1** — report ১০০ order-এর বেশি হলে ভুল সংখ্যা দেখায়
4. **W1 + W2** — storefront-কে API-তে আনা, checkout-এ click-এই order save
5. তারপর আসল ডোমেইন + আসল payment key

---

_প্রশ্ন আটকে গেলে: কোন ধাপে, আর error-এর লেখাটা হুবহু — এই দুটো দিলে ধরা যাবে।_
