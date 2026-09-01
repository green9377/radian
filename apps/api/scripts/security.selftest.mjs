/*
  S-01..S-05 self-test — the security remediation of 31 Aug 2026.

      node apps/api/scripts/security.selftest.mjs

  No database, no server, two seconds. It runs first in RUN_TESTS.bat for the
  same reason the other rule tests do: if a locked rule is already broken,
  placing a test order proves nothing.

  ── TWO KINDS OF CHECK, AND THE DIFFERENCE MATTERS ──────────────────────────

  PART A-D mirror the real logic by hand and exercise it, the same way
  discount-window.selftest.mjs does, because the API is TypeScript and this
  must run under plain node. A mirror can drift from the original, which is
  why:

  PART E reads the actual .ts source files and asserts the specific words that
  carry each guarantee are still there. That is what catches somebody
  "tidying" `updateMany` back into `update`, or restoring the client's filename
  extension - changes that would leave every test in parts A-D still passing
  while the hole is wide open again.

  Nothing here needs the shop to be running, so there is no excuse not to run
  it.
*/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const results = [];
let currentPart = '';
const part = (name) => {
  currentPart = name;
  console.log(`\n  ${name}`);
};
const check = (name, got, want) => {
  const ok = got === want;
  results.push({ ok, part: currentPart, name });
  console.log(
    `    ${ok ? 'ok  ' : 'FAIL'}  ${name}` +
      (ok ? '' : `\n            wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`),
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   PART A — S-04: what the bytes say.
   Mirrors sniffImage() in src/media/media.ts.
   ══════════════════════════════════════════════════════════════════════════ */

function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brands = buf.toString('ascii', 8, Math.min(buf.length, 64));
    if (/avif|avis/.test(brands)) return 'image/avif';
    return null;
  }
  const head = buf.toString('utf8', 0, Math.min(buf.length, 2048));
  let rest = head.replace(/^﻿/, '').trimStart();
  while (true) {
    const before = rest;
    rest = rest
      .replace(/^<\?xml[^>]*\?>/i, '')
      .replace(/^<!--[\s\S]*?-->/, '')
      .replace(/^<!DOCTYPE[^>]*>/i, '')
      .trimStart();
    if (rest === before) break;
  }
  if (/^<svg[\s>]/i.test(rest)) return 'image/svg+xml';
  return null;
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const webp = Buffer.concat([
  Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16),
]);
const wav = Buffer.concat([
  Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(16),
]);
const avif = Buffer.concat([
  Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('avif'), Buffer.alloc(16),
]);
const heic = Buffer.concat([
  Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.alloc(16),
]);
const text = (s) => Buffer.from(s, 'utf8');

part('A. S-04 - the file type comes from the bytes, not the header');

check('a real PNG is a PNG', sniffImage(png), 'image/png');
check('a real JPEG is a JPEG', sniffImage(jpeg), 'image/jpeg');
check('RIFF....WEBP is a WebP', sniffImage(webp), 'image/webp');
check('RIFF....WAVE is NOT a WebP', sniffImage(wav), null);
check('ftyp + avif brand is an AVIF', sniffImage(avif), 'image/avif');
check('ftyp + heic brand is refused', sniffImage(heic), null);
check('a plain SVG is an SVG', sniffImage(text('<svg xmlns="..." width="10"></svg>')), 'image/svg+xml');
check(
  'an SVG behind an xml declaration, a comment and a doctype is still an SVG',
  sniffImage(
    text('<?xml version="1.0"?><!-- drawn by hand --><!DOCTYPE svg><svg width="10"></svg>'),
  ),
  'image/svg+xml',
);

/*  ⚠️ THE ONE THIS FILE EXISTS FOR. An HTML page that mentions <svg> further
    down is not an SVG, and calling it one is how a phishing page gets served
    from a radianbd.com subdomain.  */
check(
  'HTML with an <svg> tag buried inside it is REFUSED',
  sniffImage(text('<html><body><script>steal()</script><svg></svg></body></html>')),
  null,
);
check(
  'a script tag pretending to be an image is REFUSED',
  sniffImage(text('<script>alert(1)</script>')),
  null,
);
check('an empty file is refused', sniffImage(Buffer.alloc(0)), null);
check('a file too short to identify is refused', sniffImage(Buffer.alloc(4)), null);

/* ══════════════════════════════════════════════════════════════════════════
   PART B — S-04: the stored name. Mirrors safeStem() in media.ts.
   ══════════════════════════════════════════════════════════════════════════ */

function safeStem(name) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(-80);
  const stem = cleaned.replace(/\..*$/, '');
  return stem || 'image';
}

part('B. S-04 - the extension is ours, never theirs');

check('an .html upload keeps no .html', safeStem('evil.html'), 'evil');
check('a compound .html.png keeps neither', safeStem('evil.html.png'), 'evil');
check('a .php is stripped', safeStem('shell.php'), 'shell');
check('path traversal cannot survive', safeStem('../../etc/passwd').includes('/'), false);
check('a normal photo keeps its readable name', safeStem('red-roses.jpg'), 'red-roses');
check('a name that is only an extension still yields something', safeStem('.htaccess'), 'image');

/* ══════════════════════════════════════════════════════════════════════════
   PART C — S-03: is this the person whose order this is?
   Mirrors phoneMatchesOrder() in src/common/phone-match.ts.
   ══════════════════════════════════════════════════════════════════════════ */

const phoneTail = (s) => (s ?? '').replace(/\D/g, '').slice(-10);
function phoneMatchesOrder(typed, candidates) {
  const want = phoneTail(typed);
  if (want.length < 10) return false;
  return candidates.some((c) => phoneTail(c) === want);
}

part('C. S-03 - the phone is the second key');

check(
  'the same number written three ways all match',
  ['+8801712345678', '01712345678', '0171-234 5678'].every((w) =>
    phoneMatchesOrder(w, ['01712345678']),
  ),
  true,
);
check('a different number does not match', phoneMatchesOrder('01799999999', ['01712345678']), false);
check(
  'the recipient of a gift can identify the order',
  phoneMatchesOrder('01755555555', ['01712345678', null, '01755555555']),
  true,
);

/*  ⚠️ THE MASTER-KEY CASE. phoneTail('') is '', and '' would equal the tail of
    every order with a missing number - so an empty box would open everything.
    This is the check that stops the whole S-03 fix being decorative.  */
check('an empty phone never matches', phoneMatchesOrder('', ['01712345678']), false);
check('an empty phone never matches an order with no numbers on it', phoneMatchesOrder('', [null, null]), false);
check('a half-typed number never matches', phoneMatchesOrder('01712', ['01712345678']), false);
check('nine digits is not enough', phoneMatchesOrder('123456789', ['0123456789']), false);

/* ══════════════════════════════════════════════════════════════════════════
   PART D — S-02: counting. Mirrors the window logic in rate-limit.guard.ts.
   ══════════════════════════════════════════════════════════════════════════ */

function makeLimiter() {
  const hits = new Map();
  return function allow(bucket, who, rule, now) {
    const key = `${bucket}|${who}`;
    const found = hits.get(key);
    if (!found || found.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + rule.windowSec * 1000 });
      return true;
    }
    found.count += 1;
    return found.count <= rule.limit;
  };
}

/*  Mirrors clientIp(): the LAST entry of X-Forwarded-For, which is the one
    Caddy appended and the only one a client cannot fake.  */
function clientIp(headers, socketAddr) {
  const chain = headers['x-forwarded-for'];
  if (chain) {
    const parts = String(chain).split(',').map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return socketAddr || 'unknown';
}

part('D. S-02 - the counting, and who is counted');

{
  const allow = makeLimiter();
  const rule = { limit: 3, windowSec: 60 };
  const t = 1_000_000;
  const seen = [1, 2, 3, 4, 5].map(() => allow('login', '1.2.3.4', rule, t));
  check('the first three pass', seen.slice(0, 3).every(Boolean), true);
  check('the fourth is refused', seen[3], false);
  check('and so is the fifth', seen[4], false);
  check(
    'a different address is unaffected',
    allow('login', '9.9.9.9', rule, t),
    true,
  );
  check(
    'the window reopens once it has passed',
    allow('login', '1.2.3.4', rule, t + 61_000),
    true,
  );
}

{
  /*  The shared bucket: track and the two payment lookups answer the same
      question, so three doors must not mean three allowances.  */
  const allow = makeLimiter();
  const rule = { limit: 2, windowSec: 60 };
  const t = 1_000_000;
  allow('order-lookup', '1.2.3.4', rule, t); // via /shop/track
  allow('order-lookup', '1.2.3.4', rule, t); // via /shop/payment/due
  check(
    'a shared bucket is one allowance across every route that names it',
    allow('order-lookup', '1.2.3.4', rule, t),
    false,
  );
}

check(
  'the client cannot forge an identity by sending its own X-Forwarded-For',
  clientIp({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }, '172.18.0.5'),
  '203.0.113.9',
);
check(
  'with no proxy header the socket address is used',
  clientIp({}, '172.18.0.5'),
  '172.18.0.5',
);

/* ══════════════════════════════════════════════════════════════════════════
   PART E — the mirror checks: is the real source still doing what parts A-D
   claim? These read the .ts files and look for the exact words that carry
   each guarantee.
   ══════════════════════════════════════════════════════════════════════════ */

part('E. the real source still carries each guarantee');

const media = read('media', 'media.ts');
const payment = read('shop', 'payment.ts');
const checkout = read('shop', 'checkout.ts');
const orders = read('orders', 'orders.service.ts');
const authCtl = read('auth', 'auth.controller.ts');
const adminCtl = read('administration', 'administration.controller.ts');

// S-04
check('media.ts derives the extension from the sniffed type', media.includes('EXT_FOR[kind]'), true);
check(
  'media.ts no longer builds the filename from the client\'s original name',
  media.includes('safeName(file.originalname)'),
  false,
);
check('media.ts sniffs before storing', media.includes('sniffImage(file.buffer)'), true);
check(
  'media.ts no longer accepts on the declared mimetype',
  media.includes('accepted.includes(file.mimetype)'),
  false,
);

// S-05 (1) — the settle race
check(
  'payment.ts claims the session with a conditional update',
  /updateMany\(\{\s*where: \{ id: session\.id, status: PaymentSessionStatus\.INITIATED \}/.test(payment),
  true,
);
check('payment.ts acts on the claim failing', payment.includes('claimed.count === 0'), true);

// S-05 (3) — the stock race
check(
  'orders.service.ts decrements stock only when there is enough',
  orders.includes('stockQty: { gte: l.qty }'),
  true,
);
check(
  'orders.service.ts refuses when the conditional decrement matched nothing',
  orders.includes('hit.count === 0'),
  true,
);

// S-05 (2) — the offer caps
check(
  'orders.service.ts re-checks the offer caps at the moment of writing',
  orders.includes('overRedeemed'),
  true,
);

// S-03
check('payment.ts uses the shared phone matcher', payment.includes("from '../common/phone-match'"), true);
check('checkout.ts uses the shared phone matcher', checkout.includes("from '../common/phone-match'"), true);
check(
  'session-by-no refuses an order it cannot identify',
  payment.includes('no order found for that number and phone'),
  true,
);
check(
  'the amount is withheld from an unidentified caller',
  payment.includes('identified ? duePaisa : undefined'),
  true,
);

// S-02 — every route the audit named still carries a limit
const limited = (src, routeRe) => routeRe.test(src);
check(
  'login is rate limited',
  limited(authCtl, /@RateLimit\(LOGIN_LIMIT\)[\s\S]{0,80}@Post\('login'\)/),
  true,
);
check(
  'forgot-password is rate limited',
  limited(adminCtl, /@RateLimit\(FORGOT_LIMIT\)[\s\S]{0,80}@Post\('forgot-password'\)/),
  true,
);
check(
  'checkout/quote is rate limited',
  limited(checkout, /@RateLimit\(QUOTE_LIMIT\)[\s\S]{0,80}@Post\('checkout\/quote'\)/),
  true,
);
check(
  'track is rate limited',
  limited(checkout, /@RateLimit\(TRACK_LIMIT\)[\s\S]{0,80}@Get\('track'\)/),
  true,
);
check(
  'the review photo upload is rate limited',
  limited(media, /@RateLimit\(REVIEW_PHOTO_LIMIT\)[\s\S]{0,120}@Post\('upload\/review-photo'\)/),
  true,
);
check(
  'the personalisation photo upload is rate limited',
  limited(media, /@RateLimit\(PERSO_PHOTO_LIMIT\)[\s\S]{0,120}@Post\('upload\/perso-photo'\)/),
  true,
);
check(
  'the payment lookups are rate limited',
  (payment.match(/@RateLimit\(PAY_LOOKUP_LIMIT\)/g) ?? []).length,
  2,
);

/*  The OTP path was already right and the brief said to leave it alone. This
    is here so that "leave it alone" survives somebody later deciding the new
    guard should own every limit in the system.  */
const otp = read('messaging', 'otp.service.ts');
check('the OTP limits are untouched', otp.includes('MAX_WRONG_TRIES') && otp.includes('MAX_PER_HOUR'), true);

/* ── the verdict ─────────────────────────────────────────────────────────── */

const failed = results.filter((r) => !r.ok);
console.log(`\n  ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('\n  BROKEN:');
  for (const f of failed) console.log(`    · [${f.part.split('.')[0]}] ${f.name}`);
  console.log(
    '\n  These are locked security rules from the 31 Aug 2026 remediation.\n' +
      '  Read RADIAN_SECURITY_AUDIT_VERDICT.md before changing any of them.\n',
  );
  process.exitCode = 1;
} else {
  console.log('  S-01..S-05 hold.\n');
}
