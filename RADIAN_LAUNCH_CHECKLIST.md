# Radian — ২৫ আগস্ট Launch Checklist

_তৈরি: ১৭ আগস্ট ২০২৬। মালিকের সিদ্ধান্ত: **২৫ আগস্ট, আসল domain-এ পুরো project launch**._
_হাতে সময়: **৮ দিন**._

> **এই ফাইলটা কী:** ২৫ তারিখে দোকান খোলার জন্য যা যা সত্যি হতে হবে, আর যা
> খোলার পরেও করা যায় — দুটোর মাঝে একটা **কাটা-দাগ**।
>
> **কাটা-দাগের নিয়ম (একটাই):**
> **টাকা হারায়, গ্রাহকের বিশ্বাস হারায়, বা আইন ভাঙে — শুধু এটুকু launch-এর আগে।**
> বাকি সব পরে। "সুন্দর হতো যদি" কখনো blocker নয়।

---

## ০. আগে যা যাচাই করেছি (আন্দাজ নয় — Vercel, Render আর কোড দেখে)

| যা দেখলাম | অবস্থা |
|---|---|
| Vercel projects | **দুটো** — `radian-admin`, `radian-web`। দুটোই `main` থেকে。 |
| Vercel domains | শুধু `*.vercel.app`। **কোনো আসল domain বসানো নেই।** |
| Render services | **একটাই** — `radian-api`, branch `main`, plan **free**, Singapore |
| Git branches | **শুধু `main`**। `production` branch নেই。 |
| SSLCommerz কোড | **সম্পূর্ণ** — Admin → Integrations → Payment-এ Store ID/password + `Live` টিক দিলেই live。 কোডে আর কিছু বদলাতে হবে না。 |
| Terms / Refund / Privacy | **এখনো draft** (বোর্ডের ২ নম্বর কাজ) |

### 🔴 এখান থেকে সবচেয়ে বড় কথাটা

**আসল (production) environment এখনো তৈরিই হয়নি।** যা আছে সব **demo** —
একটাই DB, একটাই API, `.vercel.app` ঠিকানা। `RADIAN_DEPLOY_PLAN.md`-এ যে
দুই-জগতের ছবি আঁকা (demo → real), তার **দ্বিতীয় জগৎটা কাগজেই আছে**।

মানে ২৫ তারিখে খোলা = আসল environment **শূন্য থেকে বানানো**: আসল Neon DB,
আসল Render service, আসল Vercel project, domain, DNS, SSL, সব key নতুন করে。
এটা কোড লেখার কাজ নয় — কিন্তু সময় এটাই সবচেয়ে বেশি খাবে。

---

## ১. LAUNCH BLOCKER — এগুলো ছাড়া ২৫ তারিখে খোলা যাবে না

### ক. আসল জগৎ তৈরি — **Hostinger VPS-এ** (মালিকের সিদ্ধান্ত, ১৭ আগস্ট)

**সিদ্ধান্ত:** আসল project যাবে **Hostinger VPS (KVM)**-এ — Vercel/Render-এ নয়。
demo যেখানে আছে সেখানেই থাকবে (ফ্রি, `main` branch)。

**কেন এখনই, পরে নয়:** পরে সরানো মানে **চলতি দোকান** সরানো — আসল order,
আসল টাকা, আসল গ্রাহক মাঝপথে। এখন সরালে ভাঙার মতো কিছুই নেই。
সাথে খরচ ~$7/মাস (Vercel Pro + Render + Neon ধরলে $30–45), আর Vercel-এর
Hobby plan বাণিজ্যিক কাজে বৈধ নয় — সেই প্রশ্নটাও থাকে না。

> ### ⚠️ আমি VPS-এ SSH করতে পারি না — এবং এটাই স্থাপত্য ঠিক করে দিয়েছে
>
> আমার sandbox-এ সাধারণ outbound network নেই (পরীক্ষা করে দেখা: DNS
> resolve হয় না, যেকোনো host-এর ২২/৪৪৩ পোর্ট অগম্য)。 তাই আমি **কখনোই**
> আপনার VPS-এ সরাসরি ঢুকে কিছু করতে পারব না。
>
> **সমাধান — GitHub Actions deploy করবে, আমি নয়।** আমি workflow আর script
> লিখে commit করব; GitHub-এর নিজের মেশিন VPS-এ SSH করে deploy করবে。
> ফলে আজকের অভ্যাস অক্ষত থাকে: **`main`/`production`-এ push = deploy**。
> আপনাকে VPS-এ হাত দিতে হবে **একবারই** — শুরুর bootstrap-এ。

| # | কাজ | কার হাতে |
|---|---|---|
| A1 | `production` branch — real-এ যা যায় তা আলাদা রাখার একমাত্র উপায় | আমি |
| A2 | **VPS তৈরি** (Ubuntu 22/24, KVM 1 বা 2), IP নেওয়া | **আপনি** |
| A3 | **Bootstrap script একবার চালানো** — Docker, firewall, deploy user, SSH key。 আমি script দেব, আপনি VPS terminal-এ paste করবেন | আমি লিখব · **আপনি চালাবেন** |
| A4 | GitHub secrets: `VPS_HOST`, `VPS_SSH_KEY` | **আপনি** (script যে key ছাপবে সেটাই) |
| A5 | `docker-compose.prod.yml` — api + admin + web + **postgres**, সব এক বাক্সে | আমি |
| A6 | **nginx + Let's Encrypt** — তিনটে ঠিকানা, স্বয়ংক্রিয় নবায়ন | আমি |
| A7 | **GitHub Actions deploy workflow** — push → build → VPS-এ deploy | আমি |
| A8 | **DNS** — Hostinger-এ A record: `radianbd.com`, `www`, `admin`, `api` → VPS IP | **আপনি** (বা আমি বলে দেব ঠিক কী বসাতে হবে) |
| A9 | migration + প্রথম OWNER account + দোকানের প্রথম settings | আমি |
| A10 | সব `NEXT_PUBLIC_*` ও `PUBLIC_API_URL` আসল domain-এ | আমি |
| A11 | CORS আসল domain-এ | আমি |

> ⚠️ **DNS ছড়াতে ২৪–৪৮ ঘণ্টা লাগতে পারে**, আর সেটা কারও তাড়াহুড়ো শোনে না।
> A2 আর A8 যত আগে হয় তত ভালো — **আজ হলে সবচেয়ে ভালো**。

> ⚠️ **VPS মানে server-এর দেখভাল আমাদের।** SSL নবায়ন, disk ভরে যাওয়া, RAM
> শেষ হওয়া, নিরাপত্তা আপডেট — Vercel/Render যেগুলো নিঃশব্দে করত。 তাই
> D1 (backup) এখানে আরও বেশি জরুরি, কম নয়。

### খ. টাকা — একটাও ভুল চলবে না

| # | কাজ | কেন blocker |
|---|---|---|
| B1 | **SSLCommerz LIVE store ID/password** বসানো + `Live` টিক | sandbox-চাবিতে আসল টাকা আসে না。 আপনি বলেছেন দিয়ে দিয়েছেন — **demo-র DB আমি এখান থেকে পড়তে পারি না**, তাই এটা আপনি টিক দিলে আমি এগোব |
| B2 | আসল টাকায় **একটা সত্যিকারের order** — নিজের কার্ড/bKash-এ | sandbox পাশ করা মানে live পাশ করা নয়。 ৳১০-এর একটা পণ্য বানিয়ে নিজেই কিনব, তারপর refund |
| B3 | success / fail / cancel / **IPN** চারটে URL আসল API-তে | IPN ভুল হলে **টাকা কাটবে কিন্তু order confirm হবে না** — সবচেয়ে খারাপ ব্যর্থতা |
| B4 | Delivery charge, VAT, offer — checkout-এ server-এর হিসাবই চূড়ান্ত | দাম নিয়ে ভুল = সরাসরি লোকসান |
| B5 | COD চালু আছে ও কাজ করে | gateway আটকালে দোকান যেন বন্ধ না হয় (নিচের "নিরাপত্তা জাল") |

### গ. আইন ও বিশ্বাস

| # | কাজ | কেন blocker |
|---|---|---|
| C1 | **Terms + Refund Policy publish** | merchant approval এগুলো লাইভ দেখতে চায়, আর ফেরতের নিয়ম লেখা না থাকলে প্রথম ঝগড়াতেই হারবেন |
| C2 | Privacy Policy publish | গ্রাহকের নাম-ফোন-ঠিকানা নিচ্ছেন |
| C3 | যোগাযোগের আসল তথ্য — ফোন, ঠিকানা, ইমেইল | নেই মানে গ্রাহকের চোখে "ভুয়া সাইট" |
| C4 | Order confirmation গ্রাহকের কাছে পৌঁছায় | টাকা দিয়ে কোনো খবর না পাওয়া = প্রথম দিনেই বিশ্বাস শেষ |
| C5 | Footer-এ social profile | এখন `socials: []` — একটাও icon নেই (বোর্ডের ৩ নম্বর) |

### ঘ. ভাঙলে যেন ফেরানো যায়

| # | কাজ | কেন blocker |
|---|---|---|
| D1 | আসল DB-র **automatic backup** চালু | একটা ভুল query = সব order উধাও, ফেরার পথ নেই |
| D2 | Rollback পথ পরীক্ষা করা | খারাপ deploy গেলে ১ মিনিটে আগেরটায় ফেরা |
| D3 | `PRE_DEPLOY_CHECK.bat` — demo-র বানানো ডেটা যেন real-এ না যায় | test order আসল হিসাবে ঢুকলে খাতা মিথ্যা বলবে |

---

## ২. খোলার পরে — blocker নয়

এগুলো ভালো কাজ, কিন্তু একটাও গ্রাহকের টাকা বা বিশ্বাস নষ্ট করে না। **২৫-এর
আগে হাত দেব না**, নইলে উপরের তালিকা শেষ হবে না。

- Meta `review_request` template approval → review-র WhatsApp ডাক
- Delivery module DEC-DLV-016/017 প্রমাণ করা (COD reconciliation)
- Journal-এর লেখা, SEO সাজানো, Google Business যুক্ত করা
- Loyalty, Referral, Affiliate, Campaign
- Assembly pipeline গভীর পরীক্ষা
- Intelligence-এর forecast, KPI
- Admin-এর বাকি ১৯২ পর্দার সৌন্দর্য
- "সম্পূর্ণ dynamic" করার বাকি অংশ (নিচে দেখুন)

---

## ৩. "Dynamic" — launch-এর আগে কতটুকু লাগবে

আপনার সংজ্ঞা যদি হয় *"দোকান খোলার পর যে জিনিস বদলাতে আমাকে ডাকতে হয়,
সেটা dynamic নয়"* — তাহলে **launch-এর আগে কেবল সেই জিনিসগুলো লাগবে যা
প্রথম মাসেই বদলাতে হবে**:

দাম · stock · delivery charge ও zone · slot ও কাট-অফ সময় · banner ও ছবি ·
পণ্যের লেখা · নীতি-পাতা · offer/coupon · দোকানের ফোন-ঠিকানা-সময়

এগুলোর প্রায় সবই ইতিমধ্যে admin থেকে বদলায়。 **বাকিটা খুঁজে বের করার একটাই
সৎ উপায়** — কোডে hardcode শিকার: `apps/web` আর `apps/api` স্ক্যান করে
ফাইল-লাইন ধরে তালিকা。 ওটা **launch-এর আগে চালাব** (আধা দিন), কিন্তু
**সারাব শুধু blocker-গুলো** — বাকিটা তালিকায় থাকবে, পরে。

---

## ৪. ৮ দিন — দিন ধরে

| দিন | কী |
|---|---|
| **১৭ (আজ)** | **আপনি:** VPS বানান, IP দিন。 DNS বসান (A2, A8) — ছড়াতে সময় লাগে, আজ শুরু হলে ১৯ তারিখে তৈরি。 **আমি:** Terms + Refund + Privacy লিখে publish (C1, C2) + bootstrap script ও compose লেখা শুরু |
| **১৮** | `production` branch, `docker-compose.prod.yml`, nginx + SSL, GitHub Actions workflow (A1, A5–A7)。 আপনি bootstrap চালাবেন + secrets বসাবেন (A3, A4) |
| **১৯** | প্রথম আসল deploy। migration, OWNER account, দোকানের settings (A9–A11)। তিনটে ঠিকানাই https-এ উঠবে |
| **২০** | SSLCommerz live + IPN + **আসল টাকায় একটা order ও refund** (B1–B3) |
| **২১** | Hardcode শিকার + যা blocker তা সারানো。 যোগাযোগের তথ্য, footer social (C3, C5) |
| **২২** | **পুরো যাত্রা আমি একা চালাব** real-এ — order → assemble → delivery → review → return → হিসাব。 ফাঁক থাকলে এদিনই ধরা পড়বে |
| **২৩** | **আপনি নিজে চালাবেন**, আমি পাশে。 আপনার ধরা প্রতিটা জিনিস সারানো |
| **২৪** | Backup + rollback পরীক্ষা (D1–D3)。 শেষ মেরামত。 **নতুন কোনো feature নয়** |
| **২৫** | **খোলা।** এবং সারাদিন পাহারা |

> ⚠️ **২৪ তারিখে নতুন feature লিখব না।** শেষ দিনে লেখা কোড শেষ দিনেই ভাঙে。

---

## ৫. সৎ কথা — ঝুঁকি কোথায়

**১. আসল environment শূন্য থেকে বানানো** — ৮ দিনের মধ্যে সবচেয়ে বড় অংশ, আর
এটা কোডের কাজ নয় বলে সহজ মনে হয়。 হয় না。 DNS ছড়াতে ২৪–৪৮ ঘণ্টা লাগতে পারে,
আর সেটা কারও তাড়াহুড়ো শোনে না。 **তাই domain আজ কিনতে হবে।**

**২. SSLCommerz live approval আমাদের হাতে নেই।** আপনি বলেছেন দিয়ে দিয়েছেন —
যদি সত্যিই live key হাতে থাকে, ঝুঁকি নেই。 না থাকলে ২৫ তারিখ ওদের অফিসের
উপর নির্ভর করবে, আমাদের উপর নয়。

**৩. Render free plan ঘুমায়** — $7 না দিলে আসল গ্রাহক সাদা পর্দা পাবে。

### নিরাপত্তা জাল (এটা রাখুন, তাহলে ২৫ তারিখ আর ভয়ের থাকে না)

**COD দিয়ে খুলুন, gateway তার পাশে।** অনলাইন পেমেন্ট তৈরি থাকলে চালু থাকবে;
approval না এলে ২৫ তারিখেই COD-তে দোকান খুলবে, আর key আসার দিন এক টিকে
gateway চালু হবে。 **তারিখটা তখন আর কারও অনুমতির উপর ঝুলে থাকে না।**

---

## ৬. এখন আপনার তিনটে কাজ (আজ)

1. **VPS বানান** — Hostinger → VPS → **Ubuntu 24.04**, KVM 1 হলেও চলবে,
   KVM 2 হলে স্বস্তি。 তৈরি হলে **IP ঠিকানাটা দিন**。
2. **DNS বসান** — Hostinger-এর DNS-এ চারটে A record, সবগুলো ওই IP-তে:
   `@` · `www` · `admin` · `api`。 ছড়াতে সময় লাগে, তাই আজ。
3. **SSLCommerz-এর key live না sandbox — নিশ্চিত করুন।** demo-র DB আমি
   পড়তে পারি না。 live হলে বলুন, sandbox হলে আজই merchant application。

**আমি আজ শুরু করছি:** Terms + Refund + Privacy (C1, C2) — আপনার কোনো
সিদ্ধান্তের জন্য অপেক্ষা করে না。 সাথে bootstrap script আর
`docker-compose.prod.yml` লেখা。

---

## ৭. যা আমি করতে পারি না — আগেই বলে রাখি

| জিনিস | কেন | তাই যা হবে |
|---|---|---|
| VPS-এ SSH | আমার sandbox-এ outbound network নেই (পরীক্ষিত) | GitHub Actions deploy করবে; আপনি একবার bootstrap চালাবেন |
| demo/real DB সরাসরি পড়া | Neon-এর connector নেই | যা DB-তে আছে তা আপনাকে বলতে হবে (যেমন SSLCommerz key) |
| Hostinger account দেখা | connector নেই | plan, IP, DNS — আপনার কাছ থেকে |
| ব্রাউজারে পর্দা দেখা | Chrome extension যুক্ত নেই | আপনি screenshot দিলে দেখব |
| `BUILD_CHECK.bat` চালানো | Windows batch, আমার দিক Linux | বদলে `tsc --noEmit` + drift check + no-bangla নিজে চালাই |

**যা পারি:** কোড লেখা ও যাচাই, git, Vercel ও Render-এর build দেখা ও
redeploy দেওয়া, ওয়েব পাতা পড়া。
