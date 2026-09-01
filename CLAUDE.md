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

### 📍 READ `RADIAN_ENVIRONMENTS.md` FIRST (1 Sep 2026)

Everything about **where things run and why they stay apart** now lives in
`RADIAN_ENVIRONMENTS.md`, in the repo: the containers and their real names, the
start commands, the backup schedule, the branch rules, and the DNS.

**Why it moved out of here:** this file is in `.gitignore`, so it exists on one
laptop and is in **no backup at all**. Anything a future session must not get
wrong belongs in the repo instead.

Three things from it worth carrying in the head:

- containers are `radian_*_dev` now; `docker-compose.prod.yml` and
  `.env.production` are gone. Start with
  `docker compose -f docker-compose.stack.yml --env-file .env.development …`
- **`git fetch` before touching anything.** On 1 Sep this folder was 72 commits
  behind, with stale copies of 27 files sitting on top of it
- a **catch-all DNS wildcard** sends every name we have not explicitly created
  to the OLD trading shop — and the old shop's own admin resolves through it, so
  it must not be deleted

### ⚠️ EVERYTHING IS ON THE VPS — nowhere else (owner, 30 Aug 2026)

**"Go and look" means the VPS. Not localhost, not Vercel, not Render.**
The owner's instruction: *"amder r akhon kichui others kothaw nei sob amder
vps a ache. amder kon kaj akhon r others kothaw jabe na."*

| part | live address | where it runs |
|---|---|---|
| `apps/web` | **https://development.radianbd.com** | container `radian_web_dev` |
| `apps/admin` | **https://admin.development.radianbd.com** | container `radian_admin_dev` |
| `apps/api` | **https://api.development.radianbd.com** | container `radian_api_dev` |
| images | **https://media.development.radianbd.com** | Caddy file_server |
| DB | internal network only | container `radian_postgres_dev` |

> ⚠️ **The container names and the compose file CHANGED on 1 Sep 2026.** The box
> now runs two stacks — development in `/root/apps/radian`, the live shop in
> `/root/apps/radian-live` — so the containers carry `${STACK}` in their names
> and `docker-compose.prod.yml` **no longer exists**. Anything still saying
> `*_prod` or `docker-compose.prod.yml` is stale; the data volume did not
> change (`radian_radian_pg_prod`, external on purpose).

All on one machine: Hostinger `srv1937497.hstgr.cloud` (187.53.129.45). Caddy
holds 80/443 and gets its own Let's Encrypt certificates.

```
write code → verify it myself → commit → git push origin main
                                          │
                                          ▼
                    ⚠️ the VPS does NOT pull by itself — deploy by hand
                                          │
                                          ▼
                              this is where the owner looks ↓
```

**How to ship to the VPS** (hPanel → VPS → Web console):

```
cd /root/apps/radian
git pull
docker compose -f docker-compose.stack.yml --env-file .env.development up -d --build api admin web
```

The last step takes 3–6 minutes. A new migration applies itself when the API
starts (`prisma migrate deploy`). Build only what changed — rebuilding all
three when one changed is minutes of the owner's time for nothing.

The live shop is the same command in `/root/apps/radian-live` with
`--env-file .env.live`. **Never run it without meaning to:** that is the real
shop's stack, and `RADIAN_PENDING.md` records what may go there.

⚠️ Caddy holds 80/443 for BOTH stacks and lives on its own in
`docker-compose.edge.yml`. Rebuilding a stack must never touch it, or every
certificate on the box is reissued for nothing.

> ⚠️ **Vercel · Render · Neon are HISTORY, not instructions.** Checked on
> 30 Aug: `radian-api-qnt6.onrender.com` answers nothing at all. The old
> addresses (`radian-admin.vercel.app`, `radian-web-tan.vercel.app`) must never
> come back into any document as "live". Somebody goes there and concludes the
> site is broken — that mistake has already been made once.

**`NEXT_PUBLIC_*` is build-time** — changing `.env.production` without a
**rebuild** changes nothing in web/admin (`up -d --build`).

**So without a push AND a VPS deploy, the owner sees nothing.** If you cannot
say "go to this link and look", the work is not finished. Always run
`BUILD_CHECK.bat` before pushing, because `start:dev` swallows type errors
(see §5).

### ⚡ VPS production (Hostinger) — THE ONLY system (29 Aug, confirmed 30 Aug)

The whole stack runs on the owner's Hostinger VPS. **Vercel, Render and Neon
are all SUSPENDED (29 Aug, owner's order)** — not deleted: Vercel projects
paused, Render service suspended (Resume button in dashboard), Neon endpoint
suspended (any connection wakes it; full dump also at
`/root/apps/radian/backups/neon_demo.sql`). Everything now happens on the VPS.

**Walked on 30 Aug 2026 to make sure the words above are still true:**
`api.development.radianbd.com/health` answers · the shop renders and every
image on it comes from `media.development.radianbd.com` (not ImageKit) ·
admin lists orders and the newest code is live on it ·
`radian-api-qnt6.onrender.com` answers **nothing at all**. An order was pushed
through the whole circle on the VPS: stock dropped 4 → 3 at preparing, and
delivering it while unpaid was correctly refused.

✅ **SETTLED 30 Aug — the API writes to the VPS's OWN database, not Neon.**
This was flagged loudly as an open risk for a few hours, so here is the proof
rather than a reassurance. Three orders, queried directly against Neon:

| order | created through | in Neon? |
|---|---|---|
| RAD-69010 | 29 Aug, the old Render API | ✅ yes |
| RAD-76123 | 30 Aug, **the VPS API** | ❌ no |
| RAD-78489 | 30 Aug, the owner's own order | ❌ no |

So the innocent explanation was the true one: the VPS database was restored
from a Neon dump taken AFTER 29 Aug, which is why old orders appear in both,
and the two have gone their separate ways since. **Neon is a frozen snapshot,
not a live system** — useful only as one more copy of that day's data.

⚠️ The lesson worth keeping: "old orders are visible on the new system" proves
a restore happened, NOT that the two are the same database. Write something
new on one and look for it on the other — that is the only question that
answers itself.

Owner's rule (29 Aug): the shop lives on the DEVELOPMENT subdomain — the bare
radianbd.com stays untouched for the future official launch.

> ⚠️ **`radianbd.com` is NOT empty and NOT ours to point anywhere** (checked
> 30 Aug). It runs the owner's **existing, trading shop** — getCommerce 3.0.0,
> its own admin at `app-area.radianbd.com`, a live cart, real prices, Google
> Tag Manager, and **395 URLs in Google's index** (201 `/product/<slug>`,
> 167 `/category/<slug>`, 9 blog posts). Our system serves flat `/[slug]`, so
> **not one of those URL shapes survives a cutover** without a redirect map.
>
> Owner's ruling, 30 Aug: *"tmi ki akhonei real domain a add krbe? ata kintu
> akhon dorkar nai"* · *"live ar ktha vule jaw."* **Build the system first.**
> Do not touch the bare domain, its DNS, or the old shop's data. The cutover
> and any migration are their own later conversation —
> `RADIAN_PHASE6_DIRECTION.md` §3 keeps the measurements for whoever opens it.

| part | URL | where |
|---|---|---|
| web | https://development.radianbd.com | container `radian_web_prod` |
| admin | https://admin.development.radianbd.com | container `radian_admin_prod` |
| api | https://api.development.radianbd.com | container `radian_api_prod` |
| db | internal only | container `radian_postgres_prod`, PG16, full Neon demo data restored (193 tables, 128 migrations, 0 errors) |
| media | https://media.development.radianbd.com | Caddy file_server from `/root/apps/radian/media` (immutable cache, nosniff) |

- **Images live on the VPS since 29 Aug (owner's order), NOT ImageKit.**
  `media.ts` writes to `MEDIA_DIR=/media` (bind mount `./media`), Caddy serves
  the same folder at `MEDIA_DOMAIN`. All 97 ImageKit files were copied to
  `./media/radian/<folder>/` and every DB URL rewritten
  (ik.imagekit.io/rqkfk9lzw → media.development.radianbd.com; pre-rewrite dump
  at `backups/pre_media_rewrite.sql`). ImageKit account still holds the old
  copies as a free spare — nothing new goes there. The media folder is data:
  it must survive rebuilds and belongs in any future offsite backup.

- Caddy (container `radian_caddy`) owns 80/443, gets Let's Encrypt certs
  itself; web/admin/api/db have NO published host ports any more — the old
  http://187.53.129.45[:port] addresses no longer serve anything
- DNS: radianbd.com is on Cloudflare (account Borhangazi1997@gmail.com),
  registrar Namecheap. Records `@`, `*`, `admin.development`,
  `api.development` → A 187.53.129.45, all **DNS only** (grey cloud — orange
  would break Caddy's cert issuance)
- 29 Aug evening: admin+api certs issued; development.radianbd.com cert was
  still retrying (stale hostget-NS cache at Let's Encrypt; self-heals, Caddy
  retries automatically)
- Full .env.production (28 vars) includes ANTHROPIC_API_KEY and SSLCommerz
  sandbox (testbox/qwerty). WHATSAPP_* and RESEND_API_KEY were NEVER set
  anywhere (not on Render either) — features silently off until keys exist

- VPS: `srv1937497.hstgr.cloud`, AlmaLinux 10, KVM 4 (4 vCPU / 16GB / 200GB), root via Hostinger Web console (hPanel → VPS → Web console, auto-login)
- Code at `/root/apps/radian`, cloned via GitHub deploy key `radian-vps` (read-only)
- Run: `cd /root/apps/radian && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build postgres api admin web caddy` (docker-compose.ip.yml was only for the IP phase — no longer used)
- `.env.production` lives ONLY on the VPS (chmod 600). It needed `DIRECT_URL` added (schema.prisma requires it) — same value as `DATABASE_URL` there
- `docker-compose.ip.yml` publishes ports for the IP phase; when radianbd.com DNS points at the VPS, drop it and start `caddy` from docker-compose.prod.yml instead (config already written), then rebuild web+admin with https URLs (NEXT_PUBLIC_* is build-time)
- Still empty in VPS env (values live only in Render env): WHATSAPP_*, RESEND_API_KEY, ANTHROPIC_API_KEY. SSLCommerz blank = sandbox (intended). Neon URL kept at `/root/.neon_url` for re-syncs
- To update the VPS: web terminal → `cd /root/apps/radian && git pull && docker compose ... up -d --build`
- ⚠️ VPS clone carries LOCAL edits (29 Aug): `apps/admin/Dockerfile.prod` + `docker-compose.prod.yml` got `NEXT_PUBLIC_WEB_URL` (fixes admin "View website" opening the Vercel demo). The SAME edit sits uncommitted in the local repo — commit it with the next push, then on the VPS run `git checkout -- apps/admin/Dockerfile.prod docker-compose.prod.yml` before `git pull`
- ⚠️ Local repo had an UNPUSHED commit (0ac42d0 "Gateway screen...") + 40 uncommitted WIP files when the VPS was set up — VPS deliberately runs origin/main (ec400a4), and nothing was pushed from here so the WIP would not leak to demo. Also `.git/index.lock` is stale since 26 Aug and undeletable from the sandbox — remove it on Windows before the next commit
- Daily DB backup: root cron `15 3 * * * /root/radian_backup.sh` → `/root/apps/radian/backups/daily_<1-7>.sql` (weekday rotation, tested)
- Checkup on the VPS (231 GETs, ALL CLEAR 29 Aug): make a temp `AppSession` row for an OWNER user in psql, then `docker exec -e RADIAN_TOKEN=<token> radian_api_prod node scripts/checkup.mjs`; delete the session row after

### লোকাল (এখন আর ব্যবহার হয় না, ইতিহাসের জন্য রইল)

| অংশ | পোর্ট |
|---|---|
| `apps/api` | 4000 |
| `apps/admin` | 3001 |
| `apps/web` | 3000 |
| `postgres` (Docker) | 5433 (host) → 5432 |

`START_RADIAN.bat` এখনো কাজ করে (Docker জাগায়, container তোলে, admin খোলে)。
admin আর web `docker-compose.yml`-এ নেই — admin চলত host-এ `npm run dev`-এ。
**কিন্তু মালিককে "localhost:3001-এ দেখুন" বলা যাবে না** — ওটা চালু নেই。

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
| `RADIAN_PRODUCT_DECISIONS_6AUG.md` · `_3AUG` · `_2AUG` | সাম্প্রতিকতম সিদ্ধান্ত |
| `RADIAN_*_MODULE_ARCHITECTURE.md` | ওই module-এর নকশা ও DEC-নিয়ম |
| `RADIAN_DEPLOY_PLAN.md` · `_STEPS.md` | deployment (৪ আগস্ট) |
| `RADIAN_WHATSAPP_SETUP.md` · `RADIAN_MESSENGER_INSTAGRAM.md` | messaging চ্যানেল — সেটআপ, সিদ্ধান্ত, ফাঁদ (৬ আগস্ট) |
| ~~`RADIAN_DEPLOY_GUIDE.md`~~ | **পুরনো** (২৬ জুলাই) — উপরে সংশোধনী আছে |
| `RADIAN_PENDING.md` | **চলমান কাজের একমাত্র বোর্ড** (৭ আগস্ট) — উপরের অংশ সবসময় তাজা; নিচের A–F পুরনো backlog |
| **`RADIAN_PHASE8_DIRECTION.md`** | **⬅️ FIRST READ OF A NEW CHAT (1 Sep)** — what Phase 7 closed, what is on the table for Phase 8, the test rows left on the system, and the traps. **Phases 0–7 CLOSED** |
| `RADIAN_PHASE7_DIRECTION.md` | Phase 7 hand-over — **closed 1 Sep**. History now; read only for why a Phase 7 decision was made |
| **`RADIAN_ORDER_MAP_AND_TESTS.md`** | **read right after it** (31 Aug) — which modules an order is joined to and by what (26 files), the 11 doors of the lifecycle, and 39 tests marked walked or not |
| `RADIAN_PHASE6_DIRECTION.md` | Phase 6 hand-over — **closed 31 Aug**. History now; read only for why a Phase 6 decision was made |
| `RADIAN_PHASE5_DIRECTION.md` | Phase 5 hand-over — **closed 30 Aug**. History now; read only for what Checkout & Payment already contains |
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
4a. ## 💰 Every movement of money lands in Finance (owner, 30 Aug 2026)

   > *"income POS-a hok ba order-a ba others kothaw finance-a sob kichu
   > thakbe, ar cost-o joto jaygay hok finance-a sob thakbe. **Finance hlo
   > business ar asol life** jekhane tk poysar len den sob kichu clear
   > thakbe."*

   No module keeps money to itself. Income or cost, wherever it happens, it
   becomes an entry in Finance — and if it did not reach Finance, treat it as
   not having happened.

   **Checked on 30 Aug before this was written down; every path already hands
   off:** POS sale and shift close · order delivered · COD collected · online
   payment and the gateway's own cut (DEC-FIN-029) · refunds · returns ·
   delivery cost and rider remittance · purchases and supplier payments ·
   stock issue · payroll · loyalty / referral / affiliate.

   **The question for anything new is one question:** does money move? Then the
   Finance hand-off is the last step, not the screen.

   ⚠️ The hand-off always fires on the **completed event**, through the owning
   module's own flow. Never post an entry into Finance by hand to skip past a
   module.
5. **Soft delete only** — `deletedAt`। ব্যবসায়িক সারির জন্য কখনো hard DELETE নয়।
6. **Audit everywhere** — কে, কখন, কী→কী বদলাল।
7. **সবকিছু admin থেকে বদলানো যাবে** — ব্যবসার মান কোডে hardcode নয়।
8. **ক্রম:** schema → API/business rule → frontend। উল্টো কখনো নয়。
9. ## 🚫 প্রকল্পে বাংলা নয় — **মন্তব্যেও নয়** (মালিক, ১৭ আগস্ট ২০২৬)

   **বাংলা কেবল এই চ্যাটে, আমাদের কথাবার্তায়। ফাইলে নয়।**

   > **পরের কথোপকথনের জন্য মনে রাখার কথা:** আগের নিয়মে মন্তব্যে বাংলা
   > চলত。 **আর চলবে না।** নতুন কোনো ফাইলে, নতুন কোনো লাইনে বাংলা
   > লিখব না — কোড নয়, string নয়, **comment নয়**, commit message নয়,
   > `.bat`-এর লেখা নয়। একটা অক্ষরও নয়。

   পুরনো বাংলা মন্তব্য ইংরেজিতে অনুবাদ করা হচ্ছে (ধাপে ধাপে —
   ৫,০০০+ জায়গা)。 কোনো ফাইলে হাত দিলে **সেই ফাইলের বাংলা মন্তব্যও
   তখনই ইংরেজি করে দেব** — আলাদা কাজ হিসেবে নয়, একই সাথে。

   **ব্যতিক্রম মাত্র তিনটে**, কারণসহ scanner-এর ALLOW তালিকায় — এগুলো
   মন্তব্য নয়, **চালু জিনিস**, সরালে ফিচার বা আইন ভাঙে:
   গ্রাহক বাংলায় লিখলে chat-AI-এর বাংলা উত্তর · NBR-এর মূসক ৬.৩ form
   (আইনে বাংলা বাধ্যতামূলক) · মালিকের টাইপ করা বাংলা zone-নাম চেনার regex。

   **ভরসা স্মৃতি নয়, যন্ত্র:** `no-bangla.selftest.mjs` প্রতিটা
   BUILD_CHECK আর RUN_TESTS-এ চলে。 ৳ চিহ্নটা টাকা, বাংলা নয় — ওটা চলবে。

   **আর মালিককে দেখানো নকশা/mockup-ও ইংরেজিতে** (ওগুলো পর্দারই ছবি;
   ১১ আগস্ট এই ভুলেই মালিকের মেজাজ গেছে)。
10. **এখানে সব, real-এ শুধু switch।** (মালিকের নির্দেশ, ৭ আগস্ট) প্রতিটা
    feature/integration এখানে sandbox/test মোডে সম্পূর্ণ চলা চাই — real-এ
    যাওয়া মানে কেবল key/switch বদলানো, নতুন কিছু বানানো নয়। কোনো ঝুঁকি
    সরাসরি real-এ নেওয়া যাবে না।

    ## ⚠️ Stop calling this a demo (owner, 30 Aug 2026)

    > *"amder ata k akhono kn tmi demo blso? ata kintu demo na."*

    `development.radianbd.com` is **the system**. Real orders are placed here,
    real accounts are kept here, and every piece of work is verified here.
    Only the **gateway key** is sandbox — not the system.

    Calling it a demo makes it sound disposable, and nobody takes a fault in a
    disposable thing seriously. Write **"the system"**, or the address itself.
    What comes later is **"the live shop"** (the bare radianbd.com).
11. **আগে নিজে যাচাই, তারপর মালিক।** (মালিকের নির্দেশ, ৭ আগস্ট) মালিককে
    কোনো ধাপ বলার আগে সেটা live system-এ নিজে দেখে নিতে হবে। আধা-যাচাই
    করা নির্দেশ দিয়ে পরে দিক বদলানো — এটাই সবচেয়ে বেশি সময় নষ্ট করেছে
    (FB/WhatsApp-এ হয়েছে)। মালিকের কাছে কাজ যাবে **একবারই — শেষ অবস্থায়**।
    চলমান সব কাজের হিসাব এক জায়গায়: `RADIAN_PENDING.md`।
    **"লাইভ" = §২-এর ঠিকানাগুলো, localhost নয়।** কাজ শেষ মানে push হয়ে
    গেছে, VPS-এ deploy হয়েছে, আর আমি নিজে ওই লিংকে গিয়ে দেখে এসেছি —
    তার আগে নয়。
12. **মন্তব্য কম।** কোড নিজেই যা বলে তা মন্তব্যে লিখব না。 "কেন এভাবে"
    বলার দরকার হলে দু-এক লাইন。 বড় ব্যাখ্যা, সিদ্ধান্ত আর ইতিহাস যাবে
    `radian` ফোল্ডারের `RADIAN_*.md` ফাইলে — কিছু বদলালে ওখানে হালনাগাদ
    করে রাখব, যাতে পরের বার নিজে পড়েই বুঝি。
14. ## 💳 One money screen, everywhere — `MoneyBlock.tsx` (owner, 21 Aug)

    **Never design another payment or bill screen.** Wherever money is
    counted or taken, this is the one shape:
    `apps/admin/app/_components/MoneyBlock.tsx`

    - **Grand total** on top, biggest thing on the panel (option D, the
      owner picked it himself), with the small arithmetic under it
      (subtotal − discount + charges + VAT)
    - under it, **four small doors**: `Discount` (taka or %) ·
      `Charge` (named, as many as needed) · `Adjustment` (± round-off) ·
      `VAT`. A door opens a small field in place; otherwise the screen
      stays clean
    - **Payment** — as many methods as wanted, the list scrolls on its
      own, and the amounts balance themselves against the bill
      (`usePayRows`)
    - **The Complete / Save button never leaves the screen.** Exactly two
      things scroll: the item list and the payment list
    - white screens pass `tone="light"`

    Screens still carrying their own payment or discount UI (purchase
    bill, POS due board, returns refund, new order / order edit) move onto
    this block phase by phase — the list lives in `RADIAN_PENDING.md`.

15. ## 🌐 Global rules — one shop, one setting (owner, 21 Aug 2026)

    **"off krle sob jaygay off, on krle sob jaygay on."** If a thing is true
    about the SHOP, it is written once and every module reads it. A module owns
    only what is true about that module alone.

    Locked so far: **payment methods + their accounts** (Setup → Payment
    methods, `PaymentMethodMaster` + Finance money accounts, DEC-GBL-001/006) ·
    **VAT rate** (Finance owns it, DEC-GBL-002) · **company identity**
    (CompanySetting owns BIN/name/address/signatory, DEC-GBL-003).

    The audit of what else is still duplicated lives in
    `RADIAN_GLOBAL_RULES.md` — read it before adding any new setting screen.

13. **DEC-XXX-NNN আইডি** মন্তব্যে উল্লেখ করব, যাতে "কেন এই নিয়ম" পরে
    খুঁজে পাওয়া যায়。

16. ## 🔘 Buttons are BOLD and clear — always (owner, 22 Aug 2026)

    **"amder alwas button sob bold hobe and clear hobe, ata mone rekho."**

    Every button on every screen: **bold weight**, real size (not 12px grey
    text), and it must say what it does. A two-way choice — Chips / Image
    cards, Colour / Photo / Text — is a coloured switch: the live half carries
    the colour, an icon and a soft shadow; the other half stays quiet. Which
    one is on has to read across the room.

    The reference implementations, approved by the owner: the Show-as switch
    in `TagsView.tsx` and the mode switch in `VariantAttributes`.

17. ## 🧹 No loose prose on a screen — it lives behind the ⓘ (owner, twice)

    No page-header paragraph, no grey sentence under a field, no second line
    explaining a switch. The explanation goes in `Info` (`ItemEditor.tsx`),
    the small ⓘ that opens on hover. It is still there for whoever wants it
    and silent for everyone else.

    The count cards at the top of a master screen follow one shape: brand
    colours only (purple · orchid · rose gold · soft purple), a coloured spine
    on the left, the icon in a tinted square, the number large, and any
    explanation behind the ⓘ. The chooser column on a two-pane master screen
    is the deep purple panel. Reference: Occasions & Tags, Brands, Variants.

18. ## 🔢 One quantity control — `QtyStepper.tsx` (owner, 26 Aug 2026)

    **Never build another − / + control.** Wherever a quantity is set, it is
    this one: `apps/admin/app/_components/QtyStepper.tsx` and its twin
    `apps/web/app/_components/Common/QtyStepper.tsx` (same shape, both apps).

    - **the number is always typeable.** Half the old steppers printed it in a
      `<span>`, so 40 roses meant forty clicks. That is the complaint that
      started this rule
    - while the field has focus it keeps its own draft, so an empty box or a
      half-typed `1.` is allowed; `min` clamps on blur, `max` bites while
      typing (stock, returnable qty)
    - `size="sm" | "md" | "lg"`, `grow` to fill a cell, `decimal` for kg-style
      quantities, arrow keys step, Enter commits
    - ⚠️ a tile that carries one **cannot be a `<button>`** — an input inside a
      button cannot be typed into. Give the tile `role="button"` and its own
      key handler, as the POS and purchase pickers do

### নকশার ভাষা
Premium · আবেগী · পরিচ্ছন্ন · minimal · আস্থা জাগানো。 প্রচুর whitespace,
বড় ছবি, নরম ছায়া, গোল কোণা, বড় CTA。 **পর্দা কখনো ভিড় মনে হবে না।**
রং: brand purple, pink, soft lavender, white; accent rose gold。

---

## ৫. ফাঁদ — যেগুলোতে ইতিমধ্যে পা পড়েছে

এগুলো তাত্ত্বিক নয়। প্রতিটা একবার করে ভুগিয়েছে。

| ফাঁদ | কী হয় | করণীয় |
|---|---|---|
| **commit-এর author ভুল হলে Vercel চুপচাপ আটকায়** | ১৭ আগস্ট: দুটো push গেল, GitHub-এ কোডও গেল, কিন্তু demo-তে কিচ্ছু বদলাল না。 build লাল হয়নি — deployment-এর অবস্থা ছিল **`BLOCKED`**, যেটা dashboard-এ না তাকালে দেখাই যায় না。 কারণ: commit author ছিল `sobuj <sobujgazi77@gmail.com>` → GitHub account `radian-business`, যে Vercel team-এ নেই。 Vercel অচেনা author-এর deployment বানায় **না**。 | commit করার আগে **`git config user.email` যা আছে তাই** — `-c user.email=...` দিয়ে কখনো override করব না。 এই repo-তে সঠিক পরিচয় `green9377 <amiparboinshaallah@gmail.com>`。 push-এর পরে Vercel MCP-তে `list_deployments` দেখে নিশ্চিত হব state `READY` |
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
| **A soft-deleted row keeps its number** | 21 Aug: one deleted return (RTN-000004) and every new return died on P2002 — the unique index does not care about `deletedAt`, but `prisma.db` hides the row, so the counter handed out a number that already existed | number generators read the **raw** client (`this.prisma.x`), never `this.prisma.db`, and retry on P2002 (`withNextReturnNo`, `withNextNo`) |
| **বাইরে পাঠানোর কোড দুই জায়গায়** | staff-এর reply যেত, AI-এরটা যেত না — web chat-এ ধরা পড়ত না কারণ browser নিজেই এসে দেখে | সব outbound **`ChannelSender`** দিয়ে; নতুন চ্যানেল = ওখানে একটা `case` |

---

## ৬. দুই environment — the system আর the live shop

```
THE SYSTEM                 ──── passes ────►  THE LIVE SHOP
development.radianbd.com                      radianbd.com (later)
our own orders and books                      real customers, real money
gateway sandbox key                           gateway real key
branch: main                                  branch: production
```

**Rule:** no update goes straight to the live shop. The system first →
`RUN_TESTS.bat` passes → the owner sees it → only then promote.
**The two databases are never joined.**

⚠️ The left-hand side is **not a demo** (§4 rule 10). Real orders are placed
there and real books are kept; only the gateway key is sandbox.

বিস্তারিত: `RADIAN_DEPLOY_PLAN.md`।

---

## ৭. যন্ত্রপাতি (১২৫টা `.bat`-এর মধ্যে যেগুলো আসলে লাগে)

| ফাইল | কাজ |
|---|---|
| `START_RADIAN.bat` | সব চালু করা (রোজ একবার) |
| **`RADIAN_DOCTOR.bat`** | **সব ঠিক আছে কিনা এক পর্দায়** — আটকালে প্রথমে এটা |
| **`RADIAN_CHECKUP.bat`** | **যন্ত্র নিজেই নিজের দোষ খোঁজে** (৯ আগস্ট) — ২১৭টা GET খুলে দেখে: crash, ভাঙা ছবি, imageUrl-এ CSS, error-এ বাংলা, ফিরে আসা বানানো লেখা。 endpoint-এর তালিকা controller পড়ে বানায়, তাই নতুন route যোগ হলেও পুরনো হয় না。 **কেবল পড়ে — production-এও নিরাপদ**。 `demo` = ইন্টারনেটের demo, `screens` = admin-এর ১৯২টা পাতাও খুলে দেখে (playwright লাগে) |
| `BUILD_CHECK.bat` | prisma generate + build (push/deploy-এর আগে) |
| `RUN_TESTS.bat` | ২৫টা locked business rule (`full` দিলে গভীর) |
| `PRE_DEPLOY_CHECK.bat` | DB-তে যা ইন্টারনেটে যাওয়া উচিত নয় |
| `radian_migrate.bat` · `radian_fix_generate.bat` | migration (কনটেইনারে) |
| `radian_backup.bat` · `radian_restore.bat` | DB ব্যাকআপ |
| `radian_api_logs.bat` | API-র log |
| **`radian_pitr.sh`** (VPS) | weekly base backup, prunes spent WAL, and prints the archiver's health. Cron: Sunday 03:30 |
| **`radian_offsite.sh`** (VPS) | hourly copy of books, images, env files and a git mirror to `gdrive:RadianBackup` |

> ⚠️ WAL archiving fails **silently** — the shop keeps serving while nothing is
> copied. That is why `radian_pitr.sh` prints `pg_stat_archiver` every run. The
> archive folder must stay owned by **uid 70** (postgres inside the alpine
> image, not the usual 999).

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
