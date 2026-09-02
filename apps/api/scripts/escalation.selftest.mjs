/*
  ESCALATION self-test — "if a customer asks for a person tonight, does a
  phone actually ring?"

      node apps/api/scripts/escalation.selftest.mjs

  No database, no server, no network. It reads the sources and proves the
  wiring is still there: the escalation calls the notifier, the notifier goes
  out as OPERATIONAL, the ladder has a top, the label says which shop, and
  the AI switch records what it was and not only what it became.

  ⚠️ The runtime half lives in src/messaging/escalation-notifier.spec.ts,
  which builds the service and counts the messages. This file is the cheap
  gate; that one is the proof.
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

/*  The same reason as the guard's self-test: this file explains its own
    rules at length, and a plain search would match the explanation.  */
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const notifier = read('messaging', 'escalation-notifier.service.ts');
const notifierCode = codeOnly(notifier);
const agent = codeOnly(read('inbox', 'ai-agent.ts'));
const inbox = codeOnly(read('inbox', 'inbox.ts'));
const module_ = codeOnly(read('messaging', 'messaging.controller.ts'));

/* ═════════════ PART 1 — the escalation reaches a person ═════════════ */

console.log('\nESCALATION — is anybody actually told?\n');

check('the AI escalation calls the notifier',
  /notifier\.notifyNew\(/.test(agent),
  'without this an escalation is a row and a badge, and nobody is told');

check('it is called AFTER the event row exists',
  agent.indexOf('escalationEvent.create') < agent.indexOf('notifier.notifyNew'),
  'notifying about an escalation that has not been written down yet');

check('the notifier is registered and exported',
  /EscalationNotifier/.test(module_) && module_.split('EscalationNotifier').length >= 3,
  'a provider nobody can inject is not wired');

check('the ticker runs on its own',
  /setInterval/.test(notifierCode) && /OnModuleInit/.test(notifierCode));

/* ═════════════ PART 2 — how it goes out ═════════════ */

console.log('\nESCALATION — how the message goes out\n');

check("it is sent as origin 'escalation'",
  /origin: 'escalation'/.test(notifierCode),
  'OPERATIONAL - a tripped breaker must never silence this');

check('the repeat guard is keyed to the event',
  /kind: `escalation:\$\{event\.id\}`/.test(notifierCode),
  'so the same person cannot be told twice about the same escalation');

check('the [DEV] label comes from the guard, not from a local guess',
  /this\.guard\.isDevStack\(\)/.test(notifierCode),
  'one answer to "which stack is this", used everywhere');

check('there is no allowlist and no redirect',
  !/allowlist|allowList|ALLOWLIST/.test(notifierCode) &&
  !/redirectTo|TEST_NUMBER|FORCE_RECIPIENT/.test(notifierCode),
  'DEV is a rehearsal - it reaches the real person, or it proves nothing');

/* ═════════════ PART 3 — the ladder has a top ═════════════ */

console.log('\nESCALATION — the ladder\n');

check('ten minutes is the rung', /LADDER_MINUTES = 10/.test(notifierCode));

check('the owner rung ends it',
  /ownerNotifiedAt: null/.test(notifierCode) && /data\.ownerNotifiedAt = p\.now/.test(notifierCode),
  'an escalation whose owners were told is never selected again');

check('an acknowledged escalation is off the ladder',
  /acknowledgedAt: null/.test(notifierCode));

check('the fallback also ends it',
  /reachedOwners = true;[\s\S]{0,400}\} else \{/.test(notifierCode),
  'no assignee phone means the owners are told at rung 0, and that is the top');

check('dedupe is per person and lives in the row',
  /notifiedMap/.test(notifierCode) && /already\[t\.userId\]/.test(notifierCode),
  'in-memory dedupe forgets everything on a restart');

check('phones are read through Employee, not AppUser',
  /employee\.findMany/.test(notifierCode),
  'HR-D01 - a login account is not a staff member and carries no number');

check('a failure is written down, never thrown at the caller',
  /lastNotifyError/.test(notifierCode) && /notifyNew[\s\S]{0,300}catch/.test(notifierCode));

check('numbers are masked in the trail',
  /maskRecipient/.test(notifierCode),
  'an operational log is not a place to keep phone numbers');

/* ═════════════ PART 4 — the AI switch leaves a trail ═════════════ */

console.log('\nAI SWITCH — before, after, and who\n');

check('the settings audit records before -> after',
  /changes\[key as string\] = \{ from, to \}/.test(inbox),
  'the new value is already in the row - the old one is the thing being lost');

check('the actor id is recorded, not only a name',
  /actorId: actor\.id \|\| undefined/.test(inbox));

check('an unchanged save writes nothing',
  /Object\.keys\(changes\)\.length > 0/.test(inbox));

check('X1 - the AI switch asks for no PIN',
  !/checkPin/.test(inbox),
  'switching the AI ON is the safe direction; the PIN guards the kill switch');

/* ════════════════════════ verdict ════════════════════════ */

console.log('');
if (failures) {
  console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m An escalation may reach nobody.\n`);
  process.exit(1);
}
console.log('\x1b[32mAll escalation checks passed.\x1b[0m\n');
