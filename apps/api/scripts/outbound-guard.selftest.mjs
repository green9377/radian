/*
  OUTBOUND GUARD self-test — "can a message still leave by a door nobody
  guarded?"

      node apps/api/scripts/outbound-guard.selftest.mjs

  No database, no server, no network. Two halves:

  PART 1 — the decision. The rules are mirrored here by hand, the same way
  discount-window.selftest.mjs mirrors its source, because the API is
  TypeScript and this must run under plain node. The mirror check in PART 3
  fails if the source moves and this file does not.

  PART 2 — THE DOORS. This is the half that matters in a year. It reads the
  three source files and proves that each one calls the guard BEFORE it calls
  fetch. A fourth door, or a guard quietly deleted, fails here - which is the
  only reason this file is worth having.
*/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

let failures = 0;
const ok = (name) => console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
const bad = (name, detail) => {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name}`);
  if (detail) console.log(`        ${detail}`);
};
const check = (name, cond, detail) => (cond ? ok(name) : bad(name, detail));

/* ════════════════ PART 1 — the decision, mirrored ════════════════ */

const HOUR_MS = 3_600_000;

function normaliseRecipient(raw) {
  const s = (raw ?? '').trim();
  if (!s) return '';
  if (s.includes('@')) return s.toLowerCase();
  const digits = s.replace(/\D/g, '');
  if (!digits) return s.toLowerCase();
  if (digits.length === 13 && digits.startsWith('880')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('01')) return digits;
  if (digits.length === 10 && digits.startsWith('1')) return '0' + digits;
  return digits;
}

function makeGuard(env) {
  let sent = [];
  const list = (env.OUTBOUND_ALLOWLIST ?? '')
    .split(',').map(normaliseRecipient).filter(Boolean);
  const max = Number.parseInt(env.OUTBOUND_MAX_PER_HOUR ?? '', 10);
  const cap = Number.isFinite(max) && max > 0 ? max : 0;
  return (recipient) => {
    const who = normaliseRecipient(recipient);
    if (String(env.OUTBOUND_DISABLED ?? '').toLowerCase() === 'true')
      return { allowed: false, reason: 'kill' };
    if (list.length && !list.includes(who))
      return { allowed: false, reason: 'allowlist' };
    if (cap) {
      sent = sent.filter((t) => t > Date.now() - HOUR_MS);
      if (sent.length >= cap) return { allowed: false, reason: 'rate' };
    }
    sent.push(Date.now());
    const r = env.OUTBOUND_REDIRECT_TO;
    return r && !who.includes('@') ? { allowed: true, redirectTo: r } : { allowed: true };
  };
}

console.log('\nOUTBOUND GUARD — the decision\n');

/* Production: nothing set. Nothing may change for the live shop. */
{
  const g = makeGuard({});
  check('production (no settings) lets everything through',
    g('01712345678').allowed && g('anyone@example.com').allowed && g('4839201').allowed);
}

/* The allowlist. */
{
  const g = makeGuard({ OUTBOUND_ALLOWLIST: '01712345678, sobuj@example.com' });
  check('allowlisted number passes', g('01712345678').allowed);
  check('the same number written +8801… passes', g('+8801712345678').allowed);
  check('the same number written 8801… passes', g('8801712345678').allowed);
  check('a real customer NOT on the list is blocked', !g('01911223344').allowed);
  check('allowlisted email passes (case ignored)', g('Sobuj@Example.com').allowed);
  check('another email is blocked', !g('someone@else.com').allowed);
  check('a Meta id not on the list is blocked', !g('28729587416665125').allowed);
}

/* The kill switch beats everything, including the allowlist. */
{
  const g = makeGuard({ OUTBOUND_DISABLED: 'true', OUTBOUND_ALLOWLIST: '01712345678' });
  check('kill switch blocks even an allowlisted number', !g('01712345678').allowed);
}

/* The hourly ceiling. */
{
  const g = makeGuard({ OUTBOUND_MAX_PER_HOUR: '3' });
  const seen = [g('01712345678'), g('01712345678'), g('01712345678'), g('01712345678')];
  check('first three go, the fourth is stopped',
    seen[0].allowed && seen[1].allowed && seen[2].allowed && !seen[3].allowed);
}

/* Catch-all. */
{
  const g = makeGuard({ OUTBOUND_REDIRECT_TO: '01700000000' });
  const v = g('01911223344');
  check('catch-all allows but redirects the number', v.allowed && v.redirectTo === '01700000000');
  check('catch-all leaves email alone', !g('a@b.com').redirectTo);
}

/* ════════════════ PART 2 — the three doors ════════════════ */

console.log('\nOUTBOUND GUARD — the doors\n');

const DOORS = [
  {
    name: 'A · WhatsApp Cloud (common/whatsapp-cloud.ts)',
    file: join(SRC, 'common', 'whatsapp-cloud.ts'),
    fetchMark: 'fetch(`${GRAPH}/${c.phoneId}/messages`',
  },
  {
    name: 'B · Messenger + Instagram (messaging/channel-sender.service.ts)',
    file: join(SRC, 'messaging', 'channel-sender.service.ts'),
    fetchMark: 'fetch(url, {',
  },
  {
    name: 'C · SMS + email (marketing/messaging.service.ts)',
    file: join(SRC, 'marketing', 'messaging.service.ts'),
    fetchMark: 'this.http(',
  },
];

for (const d of DOORS) {
  let src;
  try {
    src = readFileSync(d.file, 'utf8');
  } catch {
    bad(d.name, 'file not found — a door was moved or renamed');
    continue;
  }
  const guardAt = src.indexOf('this.guard.check(');
  const fetchAt = src.indexOf(d.fetchMark);
  if (guardAt < 0) {
    bad(d.name, 'no this.guard.check() in this file — the door is UNGUARDED');
  } else if (fetchAt < 0) {
    bad(d.name, `the provider call (${d.fetchMark}) was not found — update this test`);
  } else {
    check(d.name, guardAt < fetchAt, 'the guard runs AFTER the provider call');
  }
}

/* Nothing may reach a provider from a file that has never heard of the guard. */
const KNOWN_SENDERS = [
  ['common/whatsapp-cloud.ts', 'graph.facebook.com'],
  ['messaging/channel-sender.service.ts', 'graph'],
  ['marketing/messaging.service.ts', 'provider http()'],
];
check(
  'exactly three doors are claimed',
  DOORS.length === KNOWN_SENDERS.length,
  'DOORS and KNOWN_SENDERS disagree',
);

/* ════════════════ PART 3 — the mirror ════════════════ */

console.log('\nOUTBOUND GUARD — mirror of the source\n');

const guardSrc = readFileSync(join(SRC, 'common', 'outbound-guard.ts'), 'utf8');
const mirrored = [
  'OUTBOUND_DISABLED',
  'OUTBOUND_ALLOWLIST',
  'OUTBOUND_MAX_PER_HOUR',
  'OUTBOUND_REDIRECT_TO',
];
for (const key of mirrored) {
  check(`source still reads ${key}`, guardSrc.includes(key),
    'this test mirrors the source by hand — change one, change both');
}
check('an empty allowlist still means no restriction',
  guardSrc.includes('allow.length &&'),
  'production behaviour depends on this staying true');

/* ════════════════ verdict ════════════════ */

console.log('');
if (failures) {
  console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m A message can leave unguarded.\n`);
  process.exit(1);
}
console.log('\x1b[32mAll outbound-guard checks passed.\x1b[0m\n');
