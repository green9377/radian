# Radian — what each account does

> Written for the owner. What each account is, why it is needed, what it costs,
> and which ones need touching on the day the real shop opens.
>
> ⚠️ **Rewritten 30 Aug 2026.** The previous version presented Vercel · Render ·
> Neon as the running system. **They are not running any more** — everything is
> on one Hostinger VPS. Leaving the old text would send somebody to a dead
> address to conclude the site was broken.

---

## Compared to a real shop

The shop used to be spread across **five rented rooms** — the shopfront in one
place, the manager in another, the warehouse in a third. Now the **whole shop
is in one building we own**: the Hostinger VPS.

```
customer opens development.radianbd.com
        │
        ▼
┌─ HOSTINGER VPS (one machine, ours) ────────────────────┐
│                                                        │
│   Caddy ─── the doorman: takes every request, does TLS │
│     │                                                  │
│     ├─ web    → the customer's shop                    │
│     ├─ admin  → your admin panel                       │
│     ├─ api    → the manager (every business rule)      │
│     ├─ media  → the picture cupboard                   │
│     └─ postgres → warehouse + ledgers (database)       │
│                                                        │
└───────────────┬────────────────────────────────────────┘
                │
                ├──── takes money through SSLCOMMERZ
                ├──── AI answers come from ANTHROPIC
                └──── messages go through META (WhatsApp/Messenger)

   And the master plans (the code) live on GITHUB — the deeds.
```

**Why moving from rented rooms to our own building helps:** nothing falls
asleep any more (on Render's free tier the API slept after 15 minutes and a
customer got 40 seconds of blank screen), there is no build limit, and having
everything in one place makes the books easier to reconcile.

**Cost:** one rent instead of several, and it does not grow into separate
bills as the shop grows.

---

## What is needed now

### 1. Hostinger VPS — the whole shop
- **Runs:** everything — web, admin, api, images, database. One machine.
- **Address:** `srv1937497.hstgr.cloud` (187.53.129.45), AlmaLinux 10,
  KVM 4 (4 vCPU / 16GB / 200GB)
- **Live links:**
  - shop — https://development.radianbd.com
  - admin — https://admin.development.radianbd.com
  - api — https://api.development.radianbd.com
  - images — https://media.development.radianbd.com
- **How you get in:** hPanel → VPS → Web console (logs in by itself)
- **⚠️ It does not update itself.** When new code reaches GitHub, somebody has
  to run `git pull` + rebuild on the VPS (the commands are in CLAUDE.md §2).
- **For the real shop:** the same machine, with `radianbd.com` added.

### 2. GitHub — the safe holding the code (the deeds)
- **Holds:** the whole project — `github.com/green9377/radian`
- **Cost:** free, for ever.

### 3. Cloudflare — the address book (DNS)
- **Does:** sends anyone typing `radianbd.com` to the VPS.
- **Account:** Borhangazi1997@gmail.com · registrar: Namecheap
- **⚠️ Rule:** every record stays **DNS only** (grey cloud). Turning it orange
  breaks the VPS's certificate renewal.

### 4. SSLCommerz — the cash counter (payments)
- **Does:** takes the customer's card / bKash / Nagad money and pays it into
  your bank.
- **Store:** `radianbd0live` (RADIANBD)
- **Keeps:** **2.5%** on almost every channel (AMEX 3.5%, NPSB 0%)
- **Pays out to:** BRAC Bank, Natun Bazar, A/C 2071119390001 — once **Tk 2,500**
  has built up, and not on bank holidays
- **Now:** sandbox (play money). Going live means changing the Store ID and
  password, nothing more.

### 5. Anthropic — the AI staff member
- **Does:** writes the Inbox AI's replies to customer chat.
- **Cost:** pay per use — a few dollars a month.

### 6. Meta — WhatsApp · Messenger · Instagram
- **Does:** order updates reach the customer on WhatsApp, and messages from all
  three channels land in the Inbox.
- **⚠️ Webhook addresses are now:**
  `https://api.development.radianbd.com/webhooks/whatsapp` and `/webhooks/meta`.
  **After the VPS move these must be changed in Meta's dashboard too** —
  otherwise messages quietly stop arriving, with no error visible anywhere.

---

## No longer in use

| service | state |
|---|---|
| **Vercel** | stopped (projects paused). The old addresses answer nothing |
| **Render** | stopped (service suspended). Checked 30 Aug — answers nothing |
| **Neon** | endpoint suspended. A full copy of the data is on the VPS at `backups/neon_demo.sql` |
| **ImageKit** | no new image goes there; the old copies sit as a free spare |

⚠️ None of these has been **deleted** — let them sit a while, in case something
has to be brought back. But no document will describe them as "live" again.

---

## On the day the real shop opens

| task | where | how long |
|---|---|---|
| point `radianbd.com` at the VPS | Cloudflare | 15 min |
| put the SSLCommerz live keys in | Admin → Integrations | 5 min |
| **check all three addresses** | VPS `.env.production` | 10 min |
| change the webhook addresses | Meta dashboard | 10 min |
| real data (categories, delivery, policies) | admin panel | 1–2 hours |
| **walk one order from start to finish** | yourself | 30 min |

⚠️ **Do not skip the third one.** `PUBLIC_API_URL`, `PUBLIC_WEB_URL`,
`PUBLIC_ADMIN_URL` — two of the three were wrong on demo, and when they are
wrong nothing appears broken: the customer's card is charged and the order
stays unpaid. That is exactly what happened on 27 Aug.

⚠️ **Do not skip the last one either.** Before announcing anything, place an
order yourself, pay for it, and walk it through to delivered.

---

## Security rules

1. **Do not reuse one password everywhere** — use a password manager.
2. **GitHub and the VPS are the valuable two** — the code and all the data.
   Turn on 2-step verification for both.
3. **Backups:** the database is backed up on the VPS every night at 03:15
   (`/root/apps/radian/backups/daily_1..7.sql`, a seven-day rotation).
   ⚠️ The backups sit **on the same machine**. Lose the machine and the backups
   go with it. At some point they need to live somewhere else as well.
4. **Never give anyone an account password.** Send a separate invite instead.

---

_Last updated: 30 Aug 2026 — after the move to the VPS, verified live._
