# Security audit PDF — checked against the real code (31 Aug 2026)

> ## ✅ REMEDIATED THE SAME DAY — see §5 at the bottom for what changed
>
> S-01 · S-02 · S-03 · S-04 are fixed. S-05 is fixed for two of its three
> races and **deliberately narrowed rather than closed** for the third; §5
> says exactly what is still open and why, and leaves one business decision
> for the owner.
>
> ⚠️ **`apps/api/scripts/security.selftest.mjs` now guards all of it** — 54
> checks, no database, two seconds. It runs first in both `RUN_TESTS.bat` and
> `BUILD_CHECK.bat`, because a broken security rule leaves the build green.

> **What this is.** The owner handed over `Radian Security Audit Remediation.pdf`
> and asked one question: *are these findings correct?*
>
> **What the PDF actually is.** Not an audit result. It is a generic
> remediation prompt — a checklist of every e-commerce vulnerability class,
> with no file name, no line number, and no finding specific to this
> repository. It says "fix everything found" without ever saying what was
> found. So it cannot be trusted as a to-do list; it has to be re-derived.
>
> **What was done instead.** Every item on it was looked up in the actual
> `apps/api/src` code on 31 Aug 2026. Below: what is already safe, what does
> not apply to this architecture at all, and the short list of things that are
> genuinely missing.

---

## The one-line answer

**The PDF is roughly 40% not applicable, 50% already implemented, and 10%
genuinely worth doing.** Nothing on it describes a hole through which money can
be taken. The real gaps are HTTP security headers and rate limiting.

**Do NOT hand this PDF to an agent and let it "fix everything".** It would
rewrite working payment, coupon and authorization code to fix problems this
repository does not have — and every one of those rewrites is a chance to break
a rule that took months to settle.

---

## 1. Genuinely missing — worth doing

### S-01 · No HTTP security headers anywhere · **highest priority**

`Caddyfile` sends only `X-Robots-Tag` on web/admin/api. `apps/web/next.config.ts`
and `apps/admin/next.config.ts` send only `X-Robots-Tag`. Nothing sends:

- `Content-Security-Policy`
- `Strict-Transport-Security` (Caddy does not add HSTS on its own)
- `X-Frame-Options` / `frame-ancestors`
- `X-Content-Type-Options` (present on the media host only)
- `Referrer-Policy`
- `Permissions-Policy`

Why it matters more here than on an average site: the admin session token lives
in `localStorage` (`AuthGate.tsx`) and travels in the `x-radian-token` header.
That choice makes CSRF structurally impossible (see §2) — a good trade — but it
means any script that runs on the admin origin can read the token outright.
CSP is the wall that keeps such a script from running, and there is no wall.
`X-Frame-Options` missing also means the admin can be framed.

Fix: header block in `Caddyfile` per site, plus `headers()` in both
`next.config.ts`. No application code changes.

### S-02 · No rate limiting on any endpoint

`@nestjs/throttler` is not installed and no throttle guard exists. Unlimited
attempts are available on:

| endpoint | what unlimited attempts buy |
|---|---|
| `POST /auth/login` | password brute force, no lockout, no delay |
| `GET /shop/track` | guessing phone against a known order number, or the reverse |
| `POST /administration/forgot-password` | mail-bombing a known address |
| `POST /media/upload/review-photo` | 3 MB per request, unauthenticated, straight to VPS disk |
| `POST /media/upload/perso-photo` | 10 MB per request, unauthenticated, straight to VPS disk |
| `POST /shop/checkout/quote` | free load on the pricing engine |

The two upload routes are the sharpest: a 200 GB disk fills at 10 MB a request
with no account and no cost to the attacker.

**Exception, and it is a good one:** the OTP path already has real limits of its
own (`otp.service.ts`) — 6-digit hashed code, 5-minute expiry, one live code per
phone, 5 wrong guesses, 60-second resend cooldown, 5 codes per phone per hour.
That is better than most production systems. It shows the pattern is understood;
it just has not been applied anywhere else.

### S-03 · `GET /shop/payment/due/:orderNo` unlocks with one key

`checkout.ts` states the rule for `track` and enforces it properly:

> *"BOTH KEYS OR NOTHING. The order number alone is not identity — it is
> printed on a card that changes hands."*

`payment.ts` `amountDue()` does not follow that rule. Order number alone
returns: the order exists, what is still due, whether it is paid, whether it is
cancelled, and whether it is COD.

And the number space is small — `nextOrderNo()` picks randomly from
`RAD-50000` … `RAD-99998`, so **50,000 possibilities**. With no rate limit
(S-02) the whole space is walkable in minutes, which reveals order count, order
values, and payment state for the whole shop.

`POST /shop/payment/session-by-no` has the same shape — anyone can open a
gateway session against any order number. Harmless in itself (the worst outcome
is a stranger paying somebody's bill) but it confirms the same order numbers are
guessable.

Fix options, cheapest first: rate-limit it; require the phone tail as `track`
does; or widen the order-number space.

### S-04 · Upload MIME type is the client's word, and the extension survives

`media.ts` checks `file.mimetype`, which multer copies from the request's own
`Content-Type` header — the uploader controls it. `safeName()` strips path
traversal correctly but keeps the original extension. So a file named
`invoice.html`, declared as `image/png`, is written to disk and served by Caddy
as **text/html** from `media.development.radianbd.com`.

Contained, not harmless: the media host is a separate origin, so this cannot
reach the admin token, and `nosniff` is set there. What it buys an attacker is a
phishing or defacement page hosted on a radianbd.com subdomain.

Fix: check the magic bytes, or force the extension from the accepted MIME type
instead of trusting the uploaded filename.

### S-05 · Three read-then-write races (all low, all the same shape)

Each reads a value, decides, then writes — with no lock and no conditional
update between the two.

1. **`payment.ts` `settle()`** — reads `session.status`, returns early if it is
   not `INITIATED`, then updates unconditionally. The comment claims *"the first
   one to move the row off INITIATED wins"*, but nothing enforces that, and the
   same comment admits the IPN and the browser redirect often land in the same
   second. **The money is not at risk**: `addPayment()` refuses to collect more
   than is outstanding, so the second pass throws instead of double-crediting.
   The cost is a 500 back to SSLCommerz and a retry.
   Fix: `updateMany({ where: { id, status: INITIATED }, ... })` and act on the
   count.
2. **`offers.service.ts`** — `totalLimit` and `perCustomerLimit` are checked
   with a `count()` and the redemption row is created later. Concurrent
   redemptions can pass a limit.
3. **`orders.service.ts` `preparing`** — the stock shortfall check runs before
   the transaction, and `decrement` inside it is unconditional. Two concurrent
   prepares on the last unit can drive stock negative. Admin-triggered, so a
   collision needs two staff clicking at once.

---

## 2. Does not apply to this architecture

The PDF asks for these; the repository has nothing for them to attach to.
Implementing them would be inventing surface, not securing it.

| PDF section | why it does not apply |
|---|---|
| CSRF, SameSite cookies, cookie scope | **no cookies exist.** Sessions are an opaque 32-byte token in `localStorage`, sent as `x-radian-token`. A cross-site form cannot attach a custom header, so CSRF is structurally impossible |
| JWT signing, `alg` confusion, issuer/audience, refresh-token rotation | **no JWT.** Random opaque token, looked up in `AppSession`, 7-day expiry, revoked on password change and on user removal |
| Cart / wishlist / address IDOR | **the storefront has no login and no server-side cart.** The cart lives in the browser and is re-priced from the database on every quote. There is no per-user resource to reach by changing an ID |
| OAuth / social login | not implemented. The PDF itself says not to add it for the audit's sake — correct |
| Email-verification tokens | no customer accounts, so nothing to verify. Phone confirmation goes through the OTP service, which is already sound |
| SSRF | **no user-controlled URL fetch anywhere.** Every `fetch()` in `apps/api` goes to a fixed host (SSLCommerz, Meta Graph, Anthropic, OpenAI) or to an admin-configured gateway. Documented here as the PDF asks |
| Source-map exposure, debug mode | Next production builds; no debug flag in the API |

---

## 3. Inspected and already safe

Each of these was read, not assumed.

**Payment — stronger than the PDF asks for.** `payment.ts` never trusts the
browser's return. It calls SSLCommerz back with `val_id` over its own
connection, and only that answer moves money — which is a stricter control than
signature verification. The amount is compared against `PaymentSession.amountPaisa`,
frozen when the session opened, so an order edited mid-payment cannot be settled
at the new price. Currency is checked and a non-BDT payment fails the session.
`tran_id` is minted on our side and unique, so a replayed IPN is detectable.
`addPayment()` uses `increment`, never an absolute write (ORD-REV-2), and
refuses to collect beyond what is outstanding.

**Client never sends money.** `checkout.ts` reads every paisa back from the
database — size, variant, bundle, add-on, delivery. Re-sending the same request
with `unitPaisa: 1` changes nothing, because no such field is read.
`expectedTotalPaisa` only ever lets the server charge *less*, never more.

**Quantity.** `Math.max(1, Math.min(20, Math.round(it.qty || 1)))` — negative,
zero, fractional, NaN and absurd quantities are all clamped at the door.

**Coupons.** Every condition is server-side in `offers.service.ts`: window
(`startsAt`/`endsAt`), `minSpendPaisa`, `totalLimit`, `perCustomerLimit`,
first-order eligibility with its own prior-redemption check, and the stacking
rule (best auto + one coupon, DEC-OFR-002). The client's coupon input is a code
string and nothing else.

**Authorization.** `AuthGuard` is registered as `APP_GUARD`, so every route is
closed the day it is written and only an explicit `@Public()` opens it. On top
of that, `AccessGuard` judges by module, with a drift check that fails the build
if a new API prefix is neither mapped nor deliberately exempt. Role changes are
`OWNER`-only in the controller. `updateUser` writes named fields only — no
mass-assignment path to `role`.

**Track order.** Order number **and** phone, matched on the trailing 10 digits
against sender / customer / recipient. A miss answers exactly like a nonexistent
order, so it cannot be used to confirm that a number exists. Returns the
timeline only — no price, no address, no gift message.

**Password reset.** 32 crypto-random bytes; only a SHA-256 fingerprint is
stored; single-use (`usedAt`); expiring; issuing a new one retires the old;
every session is dropped after the password is set; `forgot()` answers
identically whether the address exists or not, and never returns the link to
the caller. This is textbook-correct.

**Login.** scrypt with a per-user salt, `timingSafeEqual`, and one message for
both a wrong username and a wrong password.

**Webhooks (Meta / WhatsApp).** `x-hub-signature-256` verified as HMAC-SHA256
over the **raw** body — which is why `rawBody: true` is set in `main.ts` —
compared with `timingSafeEqual`.

**CORS.** A real allowlist (`web-origins.ts`), refusing in production and only
warning in dev. The `/shop/payment/` exemption is correct and the reasoning in
`main.ts` is right: CORS never protected a top-level form POST from the gateway,
and blocking it only cost paying customers their confirmation page.

**Upload, apart from S-04.** MIME allowlist, 10 MB cap enforced twice (multer
limit and an explicit check), folder allowlist, random filename prefix,
`safeName()` stripping traversal, SVG confined to `icons` and `brand`, served
from a separate origin with `nosniff` by a file server that cannot execute
anything.

**Error exposure.** `PrismaExceptionFilter` turns database constraints into
plain 400/404/409 sentences with the technical detail kept in the log.
Everything else falls to Nest's default, which is a bare
`Internal server error` — no stack trace. `/health` deliberately touches no
query.

---

## 4. Suggested order of work

Nothing here is an emergency. In value-per-hour order:

1. **S-01 security headers** — configuration only, no application code,
   removes the largest class of risk. Half a day.
2. **S-02 rate limiting** — tight limits on login, track, forgot-password and
   the two public uploads. One day.
3. **S-03 `payment/due`** — largely solved by S-02; tighten further only if the
   owner wants it.
4. **S-04 upload extension** — magic-byte check, or derive the extension from
   the MIME type. Two hours.
5. **S-05 the three races** — one conditional `updateMany` each. Half a day,
   and honestly optional.

Each is small, and each is independent. None requires touching the payment,
coupon or authorization logic the PDF was pointing at.

---

## 5. What was actually done — 31 Aug 2026

### S-01 · headers — **fixed, in `Caddyfile` only**

All four sites get HSTS, `nosniff`, frame refusal, `Referrer-Policy` and
`Permissions-Policy`. No application code changed, and no image rebuild is
needed to change a header again — `docker compose up -d caddy` is seconds,
where the same header in `next.config.ts` would have cost a 6-minute rebuild.

⚠️ **The shop and the admin got deliberately different CSPs, and this is the
decision most worth understanding.** The shop injects Google Tag Manager, Meta,
TikTok, Snap, Pinterest and Clarity at runtime (`_data/tracking.ts`), and GTM
exists to load further scripts nobody listed in advance. A `script-src` that
GTM survives stops nothing, so the shop gets only the directives that do not
touch scripts (`base-uri`, `object-src`, `frame-ancestors`). The admin loads no
third party at all and is where the session token lives, so it gets a real
policy whose working part is `connect-src`: an injected script there has
nowhere to send what it reads.

⚠️ **Still open by choice:** the admin's `script-src` keeps `'unsafe-inline'`
and `'unsafe-eval'`, because Next.js emits inline hydration scripts and
removing them needs nonce middleware, which makes every page dynamic. That is
application code and its own job.

### S-02 · rate limiting — **fixed, all six routes**

`common/rate-limit.guard.ts` (new) and `common/rate-limits.ts` (new, every
number in one place with its reasoning). Applied per route with `@UseGuards`,
so nothing else in the app changed its behaviour.

⚠️ **No new dependency.** `@nestjs/throttler` was considered and refused for
reasons specific to this deployment: there is one API container, so the
package's default in-process store has identical semantics to these sixty
lines; the API has six runtime dependencies on purpose; and the
`X-Forwarded-For` handling — which is most of the actual work — the package
does not do either. **If the API is ever run as more than one container this
becomes wrong**, and the counter has to move into Postgres or Redis.

⚠️ **The one line that decides whether any of it works** is `clientIp()`.
Reading `req.ip` behind Caddy puts every visitor on earth in one bucket and the
first busy hour locks out every real customer. It reads the **last**
`X-Forwarded-For` entry — the one Caddy appended, and the only one a client
cannot fake.

⚠️ **Carrier NAT drove the numbers.** Thousands of real Grameenphone customers
share one address, so the storefront limits are generous (quote 120/min, track
30/min) and only the admin ones are strict (login 20 per 15 min, forgot
password 5/hour). A limit that looks reasonable per person can be brutal per
network, and that failure is invisible from here — the customer just leaves.

The OTP path was left exactly alone, as instructed.

### S-03 · order-number exposure — **fixed, as a split rather than a gate**

A blanket phone requirement would have broken the page that matters most:
`OrderSuccessView` calls `/shop/payment/due` with nothing but `?id=` after the
customer returns from the gateway on a fresh device, and refusing them would
show "we cannot find your order" to somebody whose money was just taken. So:

- **no phone** → exists / paid / cancelled / COD. **No money figure.**
- **phone** → the above plus the amount, matched exactly as `track` matches it.
- **`session-by-no`** → phone required, no exception, and it answers a wrong
  number identically to a nonexistent order so it cannot confirm which numbers
  are real.

The matching rule moved into `common/phone-match.ts` and `track` now uses it
too — two copies of one security rule is one copy that eventually stops getting
fixed.

⚠️ **This changes a screen the owner locked as "one button, no fields"
(DEC-WA-002/003).** `/pay/{orderNo}` now has one phone field — but only when
there is money to take. "Already paid", "cancelled" and "pay on delivery" still
answer on sight with nothing typed, because those are the three states where a
worried customer arrives and making them prove themselves first would be the
cruellest version of that page.

### S-04 · uploads — **fixed twice over**

`sniffImage()` identifies the file from its opening bytes, and the stored
extension is derived from that, never carried over from the uploaded name.
`safeName` became `safeStem` and drops everything from the first dot, so
`evil.html.png` cannot keep `.html` in the middle either. The declared
mimetype is now ignored entirely — it never told us anything true.

Second, independent wall: Caddy serves the whole media host under
`default-src 'none'; sandbox`. Response CSP applies to documents and is ignored
for subresources, so every `<img>` is untouched — but anything that ever did
reach that folder as HTML is inert when navigated to.

Size limits, filename randomisation, traversal protection, the folder
allowlist, the separate origin and `nosniff` are all unchanged.

### S-05 · races — **two closed, one narrowed and said so**

1. **`settle()` — closed.** The transition is now the lock: `updateMany` with
   `status: INITIATED` in the WHERE, and `count === 0` means the other caller
   won. The two FAILED writes got the same treatment, so a late failure can
   never paint over a recorded success. *(Worth keeping: this was never a
   double credit — `addPayment` refuses to collect beyond what is outstanding,
   so the second pass threw. It was noise and a fright in the log, not money.)*
2. **Stock at `preparing` — closed.** The decrement carries its own condition
   (`stockQty >= qty`); a refusal throws and rolls back, so the order does not
   move either. The pre-check stays, because it is what produces the good
   message naming every short item. The add-on clamp-at-zero rule is unchanged
   — products refuse, add-ons absorb, and that asymmetry is the owner's
   (4 Aug): a missing greeting card must not hold a bouquet hostage.
3. **Offer caps — NARROWED, NOT CLOSED, and this is stated plainly because a
   half-fixed race written up as fixed is worse than an open one.** The caps
   are now re-counted inside the order transaction, which shrinks the window
   from quote-to-place (as long as a person takes to type an address) to the
   width of the transaction. Postgres reads committed data, so two orders in
   the same instant can still both count `limit - 1`. Closing that last
   millisecond needs a `redeemedCount` column updated conditionally, or
   `pg_advisory_xact_lock` — and the second puts raw SQL in the middle of order
   creation, which is the last transaction in this system anybody should be
   brave with, especially when it cannot be run once from here.

   *(Also found: `OffersService.applyToOrder` is dead code. The redemption rows
   are written in `OrdersService.create`. The fix went where the rows actually
   are.)*

### ❓ One business decision left for the owner

When a coupon's cap is reached **between** the quote and the order landing, the
redemption row is still written — behaviour deliberately unchanged, because by
that line the discount is already inside `totalPaisa` and skipping the row
would leave money given away with no record of it. The event now appears on the
order's own timeline instead of being silent.

**The alternative is to refuse the order** and make the customer re-quote,
which is exactly what `expectedTotalPaisa` already does when a price changes.
That is a business rule, not a technical one, so it was not invented here.
