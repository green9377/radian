# PHASE 9 DIRECTION — the admin on a phone

_Written 1 Sep 2026, for the first message of a new chat._

**Read in this order:** `CLAUDE.md` (the standing brief) → **this file** →
`RADIAN_PENDING.md` (the live board).

`RADIAN_PHASE8_DIRECTION.md` is history — open it for why a Phase 8 decision
was made, and for the four things in Phase 8 that are still **the owner's**
(opening balances · the SSLCommerz live key · `WHATSAPP_*` and
`RESEND_API_KEY` · the real catalogue). **Phases 0–8 closed on our side.**

---

## 1. What Phase 9 is

> *"amder akhono mobile frendly theke start kre onk kaj baki ache kra."*
> — the owner, 1 Sep

**The shop was built mobile-first. The admin was not.** A customer on a phone
is already served; the owner and his staff on a phone are not. Phase 9 is that
one thing, and it is the largest piece of engineering left in the project.

⚠️ Phase 9 is **not** the cutover to `radianbd.com` (that is Phase 10, and the
owner has deferred it twice), and it is not the owner's own Phase 8 inputs.

## 2. How we work (unchanged, and not up for discussion)

1. **One page or feature at a time.** Nothing new starts until the owner has
   seen the last thing and said so.
2. **Never invent a business rule.** Ask.
3. **Say when there is a better way** — with the reason.
4. **Verify before reporting.** The owner sees work ONCE, finished. "Measured"
   and "inferred" are said in the same sentence as the claim.
5. **English only in files** — code, strings, comments, commit messages, and
   these `.md` files. Bangla belongs in the chat.
6. **Design:** premium, emotional, clean, minimal, trustworthy. No page prose —
   explanations behind the ⓘ. One `MoneyBlock`, one `QtyStepper`, one `Said`,
   house count-cards, **bold clear buttons**.
7. **This is not a demo.** Real orders, real books; only the gateway key is
   sandbox. Write "the system", or the address.
8. **Every movement of money lands in Finance.**

## 3. Ship path

```
code → branch → tsc --noEmit (api + admin + web) → the two selftests
     → commit → push → VPS: git pull
     → docker compose -f docker-compose.stack.yml --env-file .env.development \
         up -d --build admin
     → git log --oneline -1 ON THE VPS  ← do not skip
     → open the live link and LOOK, at 375px
```

⚠️ **The compose file changed on 1 Sep.** `docker-compose.prod.yml` is gone;
the box runs two stacks — development in `/root/apps/radian`, the live shop in
`/root/apps/radian-live` — and the containers are `radian_*_dev`. Caddy lives
alone in `docker-compose.edge.yml` and must not be rebuilt with a stack.

⚠️ **The hPanel Web console opens a popup this tooling cannot reach, and its
session dies every 20–30 minutes.** Take the URL out of the button instead:

```js
window.__u=null;
window.open=function(u){window.__u=String(u);return{focus(){},close(){},closed:false};};
[...document.querySelectorAll('button,a')].find(e=>/web console/i.test(e.textContent||'')).click();
// then navigate to window.__u  (it carries a ?session_id=…)
```

- web `https://development.radianbd.com` · admin `https://admin.development.radianbd.com`
- api `https://api.development.radianbd.com` · media `https://media.development.radianbd.com`
- commit author stays `green9377 <amiparboinshaallah@gmail.com>`
- the owner logs into the admin himself — never ask for credentials

## 4. What was MEASURED, 1 Sep — and the surprise

Counted in the repo, not estimated. **The job is a quarter the size the file
count suggests, and its worst fault is not a squeezed column.**

```
app/**.tsx                       373 files
  route files (page.tsx etc.)    225   ← three-line wrappers. NO markup at all
  app/_components                148   ← every pixel in the admin lives here
     already using breakpoints   112
     no breakpoint anywhere       36
```

A route file is the whole of `app/finance/page.tsx`:

```tsx
import { FinanceOverviewLive } from "../_components/FinanceOverview";
export default function FinancePage() { return <FinanceOverviewLive />; }
```

So **"261 of 373 files have no breakpoint" was true and misleading.** Nothing
has to be done to those 225 — they have nothing in them. The real surface is
148 components, and three quarters of them have already been thought about.

### The debt, counted by shape

| | count | why it breaks a 375px screen |
|---|---|---|
| `grid-cols-N` with **no** breakpoint | **135** | three columns stays three columns. (386 others already say `md:grid-cols-…` — that is the shape we want) |
| fixed `w-[…px]` / `min-w-[…px]` **≥ 300** | **149** | cannot fit a phone: it either pushes the page sideways or crushes what is beside it |
| `<table>` | **41** in 25 files | the classic sideways drag |
| **total** | **325** | in 98 files |

Widths under 300px (icons, badges, avatars — 634 of them) are **deliberately
not counted.** A rule that flags `w-[36px]` is a rule people learn to skip.

### ⚠️ The first fault is not markup: there is NO MENU on a phone

`AdminSidebar.tsx` is `w-[250px] … hidden md:flex`, and **nothing replaces it
below `md`.** Grepped: the nine `md:hidden` uses in the admin are all a "back"
link inside an editor, not navigation.

**So on a phone the admin has no menu at all** — a screen can only be reached
by typing its URL. Every other item on this page is cosmetic next to that one.

### The few files that decide many screens

Fix these and dozens of screens move at once:

| block | used by | state |
|---|---|---|
| `Icon` | **111** components | fine |
| `FinanceUI` | 34 | 4 wide boxes, 1 table, 2 breakpoints |
| `ItemUI` | 32 | 1 bare grid, 1 wide box |
| `MoneyBlock` | 7 (every money screen) | **3 bare grids, 2 wide boxes, 0 breakpoints** |
| `SaveBar` | 10 | clean |
| dialogs (`fixed inset-0`) | 21 files | each one its own width |

`MoneyBlock` is the clearest example of the leverage: it is the one money
screen by the owner's own rule (CLAUDE.md §4 rule 14), it has never had a
breakpoint, and repairing it repairs taking money everywhere at once.

### The heaviest individual screens

```
ProductViews.tsx    17 bare grids ·  8 wide ·  6 tables   (51 breakpoints already)
DeliveryLive.tsx     1 bare grid  · 10 wide ·  2 tables
PosViews.tsx         5 bare grids ·  9 wide ·  4 tables
OrderViews.tsx       9 bare grids
ProductEditor.tsx    3 wide (49 fixed widths in total)
Inbox               `h-[100dvh]` shell with a fixed `w-[360px]` thread list —
                    on a 375px phone the conversation gets 15px
```

## 5. The plan — four passes, each one shippable

Nothing here is approved. **Show the owner the shell first and wait**, per
rule 1.

**Pass 1 — the shell (the only pass that is not optional).** A drawer: the
existing sidebar content, off-canvas below `md`, opened from a top bar with the
Radian mark, the screen's name and a bold hamburger. It closes on navigation
and on backdrop. The desktop rail stays exactly as it is above `md`.
*One component touched, and the admin becomes reachable on a phone.*

**Pass 2 — the shared blocks.** `MoneyBlock`, `FinanceUI`, `ItemUI`, the 21
dialogs, `SaveBar`. Small files, enormous reach: this is where the count falls
fastest per screen touched.

**Pass 3 — the tables.** 41 of them. The rule is not "turn every table into
cards" — it is **a table never drags the page sideways**: its own
`overflow-x:auto` container, and the columns that matter first.

**Pass 4 — screen by screen, worst first.** ProductViews, DeliveryLive,
PosViews, OrderViews, the inbox shell. Each one walked at 375px on the live
admin before it is called done.

## 6. The house pattern (proposal — the owner has not seen it yet)

- **Mobile first in the class list.** `grid-cols-1 md:grid-cols-3`, never bare
  `grid-cols-3`. The phone value is the one with no prefix.
- **No fixed width over 300px.** Use `w-full max-w-[560px]`, or `flex-1
  min-w-0`. `min-w-0` is what lets a flex child shrink — without it the
  overflow silently moves up to the page.
- **One thing scrolls, and it is not the page.** The inbox already proves the
  shape: `min-h-0` on every flex child, the page exactly one viewport.
- **Buttons stay bold and full-width on a phone** (rule 16). A money button
  never shrinks below a thumb.
- **Two panes become one on a phone:** the chooser list, then the detail, with
  a back arrow — not two columns of 180px.
- **`100dvh`, never `100vh`** — mobile browser chrome eats `vh`.
- **Test at 375 × 812.** If it works there it works on anything sold in
  Bangladesh.

## 7. The yardstick — `mobile-ready.selftest.mjs`

```
node apps/admin/scripts/mobile-ready.selftest.mjs
node apps/admin/scripts/mobile-ready.selftest.mjs --update-baseline
```

Same shape as the no-Bangla tripwire, and for the same reason: without it
"mobile-friendly" is an opinion, somebody fixes four screens, and nobody can
say what is left. Today it prints:

```
ADMIN ON A PHONE — 373 screens scanned, 112 of them responsive
  WAIT  check 1 - no menu below md yet …
  PASS  check 2 - nothing new. 325 left (135 bare grids, 149 wide boxes, 41 tables)
```

**Check 1** turns into a real check the day the drawer exists — a tripwire that
fails from the day it is written is decoration. **Check 2** is the ratchet:
today's counts are frozen per file, and the build fails if a file GAINS any.
Sweep a screen, run `--update-baseline`, commit the smaller number. At zero the
file can be deleted.

Wired into `BUILD_CHECK.bat` as step [1/4], so it runs before every push.
**Verified, not assumed:** a probe file carrying `grid-cols-4 w-[520px] <table>`
was written into `_components`, the check failed with `0 -> 3` and exit 1, and
passed again when the probe was deleted.

## 8. The storefront on a phone — checked, 1 Sep

The Phase 8 file said nobody had looked. Looked now, at **375 × 812** with a
mobile user agent, on the live shop:

| page | horizontal scroll | verdict |
|---|---|---|
| home | none | header collapses to a hamburger, hero stacks, CTA full width |
| `/products` · `/fresh-flower` | none | fine |
| product (`/p/<slug>`) | none | gallery, sticky buy bar, price and Buy Now pinned |
| `/cart` · `/track` | none | fine |
| 404 | none | fine |

`<meta name="viewport" content="width=device-width, initial-scale=1">` is
present. **The shop is genuinely usable on a phone** — spot-checked, not
exhaustive.

**Two real faults found, both small:**

1. **The chat launcher sits on top of the sticky Buy Now bar** on a product
   page (`fixed right-6 bottom-6`, 320px tall, over the buy bar). On the one
   screen where a customer is deciding to pay, a support bubble covers the
   button.
2. The header search placeholder is clipped mid-word ("Search flowers, cak…").

### ⚠️ A Phase 10 fact, corrected while looking

Our product pages are at **`/p/<slug>`**, not the flat `/<slug>` that
`RADIAN_PHASE6_DIRECTION.md` and CLAUDE.md both assert. Walked: `/p/rose---…`
renders the product; the same slug flat is the 404 page. Flat `/<slug>` is
categories and content pages.

That makes the cutover **simpler** than the docs claim — the old shop's 395
indexed URLs map by shape (`/product/x → /p/x`, `/category/x → /x`) rather than
needing a hand-built list. Nobody should plan Phase 10 off the old sentence.

## 9. Traps

| trap | what happens |
|---|---|
| **counting files instead of markup** | 225 of the 373 admin files are three-line wrappers. Measure the thing, not the folder |
| **fixing screens before the shell** | every screen can be perfect and the admin is still unusable on a phone, because there is no menu |
| `w-[360px]` beside content | fits every laptop, leaves 15px on a phone. The inbox does this today |
| a flex child without `min-w-0` / `min-h-0` | it refuses to shrink and the overflow moves up to the PAGE |
| `100vh` on mobile | the browser's own chrome eats it; use `100dvh` |
| **a deploy that never ran** | the code is right, the behaviour is old. Check `git log -1` on the VPS |
| **two people rebuilding one box** | on 1 Sep a deploy vanished mid-session because another stack migration removed the containers. Same data volume, nothing lost — but check `docker ps` before concluding anything |
| a tripwire that fails on day one | people learn to skip it. Ratchet from today's number instead |

## 10. Test rows left on the system, on purpose

Everything from Phase 8 (`RADIAN_PHASE8_DIRECTION.md` §7), plus
**`PUR-000015`** — 2 Red-Rose at ৳20, ৳40 paid in cash, received in two
deliveries to walk the new purchase path. The stems are really on the shelf and
the money really left the drawer, so reversing it would write a refund that
never happened.

---

_Phase 8 closed 1 Sep 2026 on our side. Phase 9 opens on the owner's word._
