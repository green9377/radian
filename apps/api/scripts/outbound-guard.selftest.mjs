/*
  OUTBOUND GUARD self-test — "can a message still leave by a door nobody
  guarded?"

      node apps/api/scripts/outbound-guard.selftest.mjs

  No database, no server, no network. Two halves:

  PART 1 — THE DOORS. The half that matters in a year. It reads the three
  source files and proves each one calls the guard BEFORE it calls the
  provider. A fourth door, or a guard quietly deleted, fails here.

  PART 2 — the shape of the rules. Mirrors the invariants the design rests on,
  by reading the source rather than by re-implementing it: there is no
  recipient allowlist, no catch-all redirect, the hard boundary clamps, and
  the two switches stay two switches.

  ⚠️ The runtime half lives in src/common/outbound-guard.spec.ts, which builds
  the real services and proves nothing reaches the wire. This file is the
  cheap gate; that one is the proof.
*/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

let failures = 0;
const ok = (n) => console.log(`  \x1b[32mPASS\x1b[0m  ${n}`);
const bad = (n, d) => { failures++; console.log(`  \x1b[31mFAIL\x1b[0m  ${n}`); if (d) console.log(`        ${d}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

/*  Some invariants are about the CODE, not the prose. This file explains at
    length why there is no allowlist, and a plain search for the word would
    fail on the explanation itself — so the code is read with the comments
    taken out.  */
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ════════════════════ PART 1 — the three doors ════════════════════ */

console.log('\nOUTBOUND GUARD — the doors\n');

const DOORS = [
  {
    name: 'A · WhatsApp Cloud (common/whatsapp-cloud.ts)',
    file: ['common', 'whatsapp-cloud.ts'],
    providerMark: 'fetch(`${GRAPH}/${c.phoneId}/messages`',
  },
  {
    name: 'B · Messenger + Instagram (messaging/channel-sender.service.ts)',
    file: ['messaging', 'channel-sender.service.ts'],
    providerMark: 'fetch(url, {',
  },
  {
    name: 'C · SMS + email (marketing/messaging.service.ts)',
    file: ['marketing', 'messaging.service.ts'],
    providerMark: 'this.http(',
  },
];

for (const d of DOORS) {
  let src;
  try { src = read(...d.file); }
  catch { bad(d.name, 'file not found — a door was moved or renamed'); continue; }

  const guardAt = src.indexOf('this.guard.check(');
  const providerAt = src.indexOf(d.providerMark);
  if (guardAt < 0) bad(d.name, 'no this.guard.check() in this file — the door is UNGUARDED');
  else if (providerAt < 0) bad(d.name, `the provider call (${d.providerMark}) was not found — update this test`);
  else check(d.name, guardAt < providerAt, 'the guard runs AFTER the provider call');
}

check('exactly three doors are claimed', DOORS.length === 3);

/*  Every door must await the guard. A forgotten await would make the verdict
    a Promise, which is always truthy, and the check would pass while doing
    nothing at all — a silent failure of the safety layer itself.  */
for (const d of DOORS) {
  const src = read(...d.file);
  check(
    `${d.name.split(' · ')[0]} · awaits the verdict`,
    /await this\.guard\.check\(/.test(src),
    'this.guard.check() is async now — without await the verdict is a truthy Promise',
  );
}

/* ════════════════ PART 2 — the shape of the rules ════════════════ */

console.log('\nOUTBOUND GUARD — the rules\n');

const guard = read('common', 'outbound-guard.ts');
const constants = read('common', 'outbound-limits.const.ts');
const settings = read('common', 'outbound-settings.service.ts');

/*  The decision the owner made on 2 Sep: development is a full rehearsal and
    must reach ARBITRARY real recipients on an intentional test. A recipient
    allowlist creeping back in would quietly undo that.  */
check('no recipient allowlist in the guard\'s code',
  !/allowlist/i.test(codeOnly(guard)),
  'DEV must be able to reach any real recipient on an intentional test');

check('no catch-all redirect',
  !/OUTBOUND_REDIRECT_TO|redirectTo/.test(codeOnly(guard)),
  'a silent redirect is the hidden surprise the rules forbid');

check('no hardcoded hourly limit read from the environment',
  !/OUTBOUND_MAX_PER_HOUR|OUTBOUND_ALLOWLIST|OUTBOUND_DISABLED/.test(codeOnly(guard)),
  'limits are configurable from the admin, in the database');

/*  The two switches are two things, and the difference is the whole of P5.  */
check('the manual kill switch stops everything',
  /st\.manualKill/.test(guard) && guard.indexOf('st.manualKill') < guard.indexOf("klass === 'CUSTOMER'"),
  'the manual switch must be judged before the class is even considered');

check('the breaker stops CUSTOMER messages only',
  /breakerTrippedAt && klass === 'CUSTOMER'/.test(guard),
  'an automatic trip must not silence the escalation SMS');

check('escalation counts as operational',
  /OPERATIONAL_ORIGINS = new Set\(\['escalation'/.test(guard));

check('a declared batch is enforced',
  /b\.actual >= b\.declared/.test(guard));

check('an undeclared sender may send exactly one',
  /DEFAULT_DECLARED_BATCH/.test(guard) && /DEFAULT_DECLARED_BATCH = 1/.test(constants));

check('a block is written to the persistent trail',
  /this\.audit\?\.event\(/.test(guard),
  'a block nobody can review afterwards is half a control');

check('recipients are masked in the trail',
  /maskRecipient\(who\)/.test(guard));

/* ── the hard boundary ── */

console.log('\nOUTBOUND GUARD — the hard boundary\n');

for (const name of ['HARD_MAX_VALUE', 'HARD_MIN_VALUE', 'HARD_MAX_WINDOW_MINUTES',
                    'HARD_MIN_REPEAT_WINDOW_MINUTES', 'MUST_TRIP_METRICS']) {
  check(`the boundary defines ${name}`, constants.includes(name));
}
check('the ceiling is 10,000 an hour', /HARD_MAX_VALUE = 10_000/.test(constants));
check('the repeat window cannot be set to zero', /HARD_MIN_REPEAT_WINDOW_MINUTES = 1/.test(constants));
check('at least one metric must still TRIP',
  /MUST_TRIP_METRICS[\s\S]*?DISTINCT/.test(constants),
  'the breaker may be softened, never removed');

check('limits are clamped on WRITE', /clampLimitValue\(input\.value\)/.test(settings));
check('limits are clamped on READ too', /private toEffective/.test(settings) && /clampLimitValue\(r\.value\)/.test(settings),
  'a row edited straight in the database must not escape the boundary either');

check('the switches are never cached', !/cache[\s\S]{0,200}outboundSetting/.test(settings),
  'a kill switch that takes ten seconds to bite is not a kill switch');

check('the breaker never resets itself',
  /resetBreaker/.test(settings) && !/setTimeout[\s\S]*breakerTrippedAt: null/.test(settings));

/* ════════════════════════ verdict ════════════════════════ */

console.log('');
if (failures) {
  console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m A message can leave unguarded.\n`);
  process.exit(1);
}
console.log('\x1b[32mAll outbound-guard checks passed.\x1b[0m\n');
