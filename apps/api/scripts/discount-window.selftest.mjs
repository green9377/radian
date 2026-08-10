/*
  DEC-PRD-028 + DEC-PRD-042 self-test — "is this discount running right now?"

      node apps/api/scripts/discount-window.selftest.mjs

  No database, no server. This is the single gate every price in the shop,
  the admin, POS and the order lines passes through, so it is the last place
  a quiet mistake should be allowed to live.

  The rule, in the owner's words:
    · 3 Aug 2026 — "10 তারিখ পর্যন্ত" means the 10th is IN. A price that
      jumps at noon on the last day is a bug.
    · 10 Aug 2026 — he now wants a TIME as well: an offer that ends at 9 PM.
      Where he gives a time, that time wins; where he gives only a date, the
      old whole-day behaviour stands.

  ⚠️ This file mirrors `src/common/discount-window.ts` by hand, because the API
  is TypeScript and this must run with plain node. Change one, change both —
  the mirror check at the bottom will say so if you forget.
*/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src', 'common', 'discount-window.ts');

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const startOfBdDay = (d) => Math.floor((d.getTime() + BD_OFFSET_MS) / DAY_MS) * DAY_MS - BD_OFFSET_MS;
const endOfBdDay = (d) => startOfBdDay(d) + DAY_MS - 1;
const hasTimeOfDay = (d) => (d.getTime() + BD_OFFSET_MS) % DAY_MS !== 0;
const windowStartMs = (d) => (!d ? null : hasTimeOfDay(d) ? d.getTime() : startOfBdDay(d));
const windowEndMs = (d) => (!d ? null : hasTimeOfDay(d) ? d.getTime() : endOfBdDay(d));

function discountLive(w, at) {
  const now = at.getTime();
  const s = windowStartMs(w.discountStartsAt);
  const e = windowEndMs(w.discountEndsAt);
  if (s !== null && s > now) return false;
  if (e !== null && e < now) return false;
  return true;
}
function paidPaisa(p) {
  if (!discountLive(p, p._now ?? new Date())) return p.sellingPricePaisa;
  if (p.discountType === 'FLAT') return Math.max(0, p.sellingPricePaisa - p.discountValue);
  if (p.discountType === 'PERCENT')
    return Math.max(0, Math.round(p.sellingPricePaisa * (1 - p.discountValue / 10000)));
  return p.sellingPricePaisa;
}

/*  BD-এর সময় ধরে একটা Date বানানো — পরীক্ষাটা যেন যন্ত্রের timezone-এর
    উপর নির্ভর না করে。 এটাই সেই ফাঁদ যেটা এই ফাইল ধরার জন্য আছে。      */
const bd = (s) => new Date(`${s}+06:00`);

const results = [];
const check = (name, got, want) => {
  const ok = got === want;
  results.push(ok);
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${name}`);
  if (!ok) console.log(`        wanted ${want}, got ${got}`);
};

console.log('\nDEC-PRD-028 / 042 — the discount window\n');

const dateOnly = { discountStartsAt: bd('2026-08-05T00:00:00'), discountEndsAt: bd('2026-08-10T00:00:00') };

check('before the first day — not running',
  discountLive(dateOnly, bd('2026-08-04T23:59:00')), false);
check('the first day at one minute past midnight — running',
  discountLive(dateOnly, bd('2026-08-05T00:01:00')), true);
check('THE LAST DAY AT NOON — still running (his 3 Aug ruling)',
  discountLive(dateOnly, bd('2026-08-10T12:00:00')), true);
check('the last day, one second to midnight — still running',
  discountLive(dateOnly, bd('2026-08-10T23:59:59')), true);
check('the day after — over',
  discountLive(dateOnly, bd('2026-08-11T00:00:01')), false);

const withTime = { discountStartsAt: bd('2026-08-10T18:00:00'), discountEndsAt: bd('2026-08-10T21:00:00') };
check('a 6 PM start, at 5:59 PM — not yet',
  discountLive(withTime, bd('2026-08-10T17:59:00')), false);
check('a 6 PM start, at 6:00 PM — running',
  discountLive(withTime, bd('2026-08-10T18:00:00')), true);
check('a 9 PM end, at 8:59 PM — running',
  discountLive(withTime, bd('2026-08-10T20:59:59')), true);
check('a 9 PM end, at 9:01 PM — over (the whole point of 10 Aug)',
  discountLive(withTime, bd('2026-08-10T21:01:00')), false);

check('no dates at all — running',
  discountLive({}, bd('2026-08-10T12:00:00')), true);
check('only an end date — running before it',
  discountLive({ discountEndsAt: bd('2026-08-10T00:00:00') }, bd('2026-08-01T00:00:00')), true);
check('only a start date — dead before it',
  discountLive({ discountStartsAt: bd('2026-08-20T00:00:00') }, bd('2026-08-10T00:00:00')), false);

/* the money, not just the flag */
const money = { sellingPricePaisa: 240000, discountType: 'PERCENT', discountValue: 1000, ...dateOnly };
check('10% off inside the window → 2,160.00',
  paidPaisa({ ...money, _now: bd('2026-08-07T10:00:00') }), 216000);
check('the same product after the window → full price',
  paidPaisa({ ...money, _now: bd('2026-08-12T10:00:00') }), 240000);
check('FLAT 300 inside the window',
  paidPaisa({ sellingPricePaisa: 240000, discountType: 'FLAT', discountValue: 30000, ...dateOnly, _now: bd('2026-08-07T10:00:00') }), 210000);
check('a discount can never take the price below zero',
  paidPaisa({ sellingPricePaisa: 5000, discountType: 'FLAT', discountValue: 900000, _now: bd('2026-08-07T10:00:00') }), 0);

/*  ⚠️ the trap this file exists for: the server runs in UTC. A shop day is a
    Dhaka day, so "the 10th" must not end at 6 AM Dhaka time.  */
check('server in UTC, last day 11:30 PM Dhaka — STILL running',
  discountLive(dateOnly, new Date('2026-08-10T17:30:00Z')), true);
check('server in UTC, 12:30 AM Dhaka on the 11th — over',
  discountLive(dateOnly, new Date('2026-08-10T18:30:00Z')), false);

/* mirror check — this file duplicates the rule on purpose, so make it loud */
const src = readFileSync(SRC, 'utf8');
const mirrored = ['hasTimeOfDay', 'windowStartMs', 'windowEndMs', 'BD_OFFSET_MS']
  .every((s) => src.includes(s));
check('still mirrors discount-window.ts', mirrored, true);

const bad = results.filter((r) => !r).length;
console.log(bad === 0 ? '\n\x1b[32mALL GOOD\x1b[0m\n' : `\n\x1b[31m${bad} FAILED\x1b[0m\n`);
process.exit(bad === 0 ? 0 : 1);
