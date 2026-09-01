# ENVIRONMENTS — what runs where, and the rules that keep them apart

_Written 1 Sep 2026, after the box was inspected end to end. Everything below
was read off the running system, not off an older document._

**Why this file is in the repo:** `CLAUDE.md` is NOT in git (`.gitignore` line
27), so it lives on one laptop and is in no backup at all. Anything a future
session must not get wrong belongs here, where GitHub and the Drive copy can
both hold it.

---

## 1. Today there is ONE environment: development

`development.radianbd.com` is the whole system. There is no live stack yet, and
that is deliberate (owner, 1 Sep): **finish everything here, then go live once**,
rather than maintaining two half-built copies.

| part | address | container |
|---|---|---|
| shop | https://development.radianbd.com | `radian_web_dev` |
| admin | https://admin.development.radianbd.com | `radian_admin_dev` |
| api | https://api.development.radianbd.com | `radian_api_dev` |
| images | https://media.development.radianbd.com | Caddy, from `./media` |
| database | internal network only | `radian_postgres_dev` |
| HTTPS | all four names | `radian_caddy` |

- host: Hostinger KVM 4 — 4 CPU, 15 GB RAM, 199 GB disk (12% used)
- code: `/root/apps/radian`, branch **main**
- database: 24 MB, 194 tables, 135 migrations, 104 orders, 31 products
- data volume: `radian_radian_pg_prod`, **external and named outright** — a
  compose-named volume carries the project name, so a renamed folder silently
  starts an EMPTY database that looks exactly like losing everything

### Starting it

```
cd /root/apps/radian
docker compose -f docker-compose.stack.yml --env-file .env.development up -d --build api admin web
docker compose -f docker-compose.edge.yml  --env-file .env.edge          up -d
```

`docker-compose.prod.yml` and `.env.production` are **gone**: "prod" had come to
mean development, which is the kind of name that sends a command to the wrong
container at 2am. The retired env file sits at
`/root/retired/env.production.retired-20260901` on the VPS.

⚠️ **Caddy is its own compose project** (`name: radian_edge`). Without that it
lands in the stack's project and calls the stack's four containers orphans —
and one `--remove-orphans` then deletes the shop.

---

## 2. What makes this "development" — the rules

1. **Test data is allowed here.** Test orders, shifts, expenses. The books are
   real books, but this is where things get broken on purpose.
2. **The gateway stays sandbox.** `SSLCOMMERZ_IS_LIVE=false`, store `testbox`.
   Real money never moves here.
3. **Search engines are kept out.** All four names carry
   `X-Robots-Tag: noindex, nofollow`. This is a full second copy of the shop and
   Google had no reason not to index it against the real one.
4. **Two of the four cores** (`CPU_LIMIT=2`), so that when a live stack shares
   the box, a rebuild or a load test here cannot starve a checkout there.
5. **Nothing goes from here straight to a live shop.** The live stack, when it
   exists, gets its own database, media folder and env file, and receives only
   commits that already ran here.

⚠️ This is **not a demo** (owner, 30 Aug). Real orders are placed here and real
books are kept; only the gateway key is sandbox. Write "the system", or the
address.

---

## 3. How work ships

```
write code
  -> a branch, never straight to main
  -> VPS: git checkout <branch> && docker compose ... up -d --build
  -> read the build output for "error TS"
  -> merge to main once green, then deploy main
  -> git log --oneline -1 ON THE VPS   <- do not skip this
  -> open the live link and LOOK
```

Branching first is not ceremony: on 1 Sep it caught three TypeScript errors
before main saw them, and a compose change that would have taken the shop down.

⚠️ **The repo is worked on from more than one place.** On 1 Sep the laptop
folder was found **72 commits behind** origin/main, with stale copies of 27
files sitting uncommitted on top; committing them would have deleted a day of
somebody else's work. **`git fetch` before touching anything.**

Branches: `main` (the system) - `production` (reserved, empty until the live
shop is built) - `security-31aug` (the 31 Aug audit work, parked and NOT merged;
most of that tree is older than main, so take it file by file, never wholesale).
Twelve finished branches were deleted on 1 Sep.

---

## 4. Backups

| what | how often | where |
|---|---|---|
| the books | **every write** (WAL archiving, gzipped) | `backups/wal` -> Drive |
| full database copy | weekly, Sunday 03:30 | `backups/base_*` -> Drive |
| nightly dump | 03:15 | `backups/daily_1..7.sql` -> Drive |
| product images | hourly | `media/` -> Drive |
| code + env files | hourly | git mirror + `env-files.tgz` -> Drive |

Scripts: `radian_pitr.sh` (weekly base, prune, and it prints the archiver's
health every run) and `radian_offsite.sh` (hourly, rclone to
`gdrive:RadianBackup`).

⚠️ **WAL archiving fails SILENTLY.** The shop keeps serving while nothing is
copied. It failed exactly that way on 1 Sep: the folder was owned by uid 999 —
the usual postgres uid — and the alpine image runs as **uid 70**.

⚠️ **rclone uses its shared Google client_id, which Google retires during 2026.**
When it goes the Drive copies stop, silently. A private client_id is needed
before then.

⚠️ The Drive folder holds `env-files.tgz`, which contains real secrets. It is in
the owner's own Drive; that folder must not be shared.

---

## 5. DNS — the fact that will bite

`radianbd.com` is on Cloudflare (`pola` / `matteo.ns.cloudflare.com`).

| name | resolves to |
|---|---|
| `radianbd.com`, `www` | **180.94.20.28** - the owner's existing, trading shop |
| `development.radianbd.com` + admin/api/media | **187.53.129.45** - this VPS |
| **anything else, at any depth** | **180.94.20.28** - a catch-all wildcard |

Measured: `zzqq123.radianbd.com` and even `deep.zzqq123.radianbd.com` answer with
the old shop's address.

⚠️ **Do NOT delete or repoint that wildcard.** `app-area.radianbd.com` — the old
shop's own admin — and `mail.radianbd.com` resolve through it. Removing it
breaks the trading shop.

The safe pattern is the one already in use: **an explicit A record per name we
serve.** The live stack will need its own (`live`, `admin.live`, `api.live`,
`media.live` -> 187.53.129.45, DNS-only / grey cloud; a proxied record stops
Let's Encrypt from issuing).

---

## 6. What is not built yet

- **The live stack.** `docker-compose.stack.yml` already runs either side; what
  is missing is the second clone (`/root/apps/radian-live`, branch
  `production`), its `.env.live`, its own `radian_live_pg` volume, and the DNS
  records above. `.env.live.example` carries the full shape.
- **Order confirmations.** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_VERIFY_TOKEN` and `RESEND_API_KEY` are **empty** — a customer who
  orders today is told nothing, and nothing raises an error.
- **Meta webhooks** still point at the dead Render host, so WhatsApp, Messenger
  and Instagram messages stop arriving with nothing in any log.
- **Opening balances** have never been posted (`goLiveDate` is null), which is
  why the books show cash below zero.

The finish line the owner approved on 1 Sep, in order: backups - the security
work - the real gateway key - order confirmations - the real catalogue -
opening balances - a full order walk - clearing the test data - adding
`radianbd.com`.
