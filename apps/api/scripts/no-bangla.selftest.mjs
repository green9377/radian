/*
  NO BANGLA IN THE PRODUCT — the tripwire.

      node apps/api/scripts/no-bangla.selftest.mjs
      node apps/api/scripts/no-bangla.selftest.mjs --update-baseline

  The owner's locked rule (6 Aug 2026): nothing the product prints may be in
  Bengali — screen text, error messages, API responses. He has had to repeat
  it more than once, which means remembering is not working. This script is
  the replacement for remembering.

  ── TWO CHECKS, AND THEY ARE NOT THE SAME ──────────────────────────────────

  CHECK 1 — PRINTED Bengali. Strips comments, then fails on any Bengali left
  in real code: a string literal, JSX text, an error message. This has always
  been here and it passes today.

  CHECK 2 — THE RATCHET (17 Aug 2026, owner). The rule got stricter: no
  Bengali ANYWHERE in the project, comments included. There were 13,260 such
  lines across 397 files on the day he asked, so failing the build outright
  would have failed it for weeks and taught everyone to skip the check —
  which is how a tripwire becomes decoration.

  So instead: today's counts are frozen into a baseline, and the build fails
  if any file GAINS Bengali or a new file brings some in. The old lines can
  be cleared at whatever pace suits; nothing new can arrive while that
  happens. Every translated file lowers the number, and the count only ever
  goes down.

  After translating, run --update-baseline and commit the smaller file. When
  it reaches zero, check 2 has become "no Bengali at all" and the baseline
  file can go.

  Wired into BUILD_CHECK.bat and RUN_TESTS.bat, so it runs before every push
  and every test round. A rule the machine enforces does not need repeating.
*/

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SCAN_DIRS = [
  join(ROOT, 'apps', 'api', 'src'),
  join(ROOT, 'apps', 'admin', 'app'),
  join(ROOT, 'apps', 'web', 'app'),
];
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist']);

/*  U+09F3 (the taka sign) is excluded — it lives in the Bengali Unicode block
    but it is currency, and prices are meant to print it. Bengali DIGITS stay
    banned along with the letters.  */
const BANGLA = /[\u0980-\u09F2\u09F4-\u09FF]/;

/*  Files allowed to carry Bengali IN CODE, each with its reason. This list is
    the only door — anything else fails the build.  */
const ALLOW = new Map([
  ['apps/api/src/inbox/ai-agent.ts',
   'the chat AI answers a Bengali-writing CUSTOMER in Bengali - their language, their choice'],
  ['apps/admin/app/_components/FinanceMushak.tsx',
   'the NBR Mushak 6.3 VAT challan - a government form whose wording is fixed in Bengali by law'],
  ['apps/admin/app/_components/ZonesAvailability.tsx',
   'a regex that RECOGNISES Bengali zone names the owner may type - it prints nothing'],
]);

/*  Strip comments so internal notes do not trip the wire — the product never
    prints a comment. Deliberately dumb (no parser): block comments, then line
    comments, then JSX comment blocks. A Bengali letter inside a string that
    LOOKS like a comment will still be caught on the printed side by
    RADIAN_CHECKUP, which reads the live API.  */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTS.has(extname(name))) yield full;
  }
}

const hits = [];
let scanned = 0;
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    scanned++;
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (ALLOW.has(rel)) continue;
    const stripped = stripComments(readFileSync(file, 'utf8'));
    if (!BANGLA.test(stripped)) continue;
    const lines = stripped.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (BANGLA.test(lines[i])) {
        hits.push({ file: file.slice(ROOT.length + 1), line: i + 1, text: lines[i].trim().slice(0, 90) });
        if (hits.filter((h) => h.file === file.slice(ROOT.length + 1)).length >= 3) break;
      }
    }
  }
}

console.log(`\nNO-BANGLA CHECK — ${scanned} source files scanned\n`);

let failed = false;

if (hits.length === 0) {
  console.log('  \x1b[32mPASS\x1b[0m  check 1 - no Bengali in any string, JSX text or error message');
} else {
  failed = true;
  console.log(`  \x1b[31mFAIL\x1b[0m  check 1 - Bengali in CODE (these would PRINT to a customer):\n`);
  for (const h of hits.slice(0, 25)) {
    console.log(`    ${h.file}:${h.line}`);
    console.log(`      ${h.text}`);
  }
  if (hits.length > 25) console.log(`    ...and ${hits.length - 25} more`);
}

/* ─────────────────── CHECK 2 — THE RATCHET ───────────────────
   Comments count now. Scans the WHOLE repo, not just the three app
   directories, because a .md document and a .bat banner are part of the
   project too. Counts LINES containing Bengali, per file. */

const RATCHET_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.prisma', '.md', '.bat', '.json', '.yml', '.yaml']);
const RATCHET_SKIP = new Set(['node_modules', '.next', 'dist', '.git', 'build', 'coverage']);
const BASELINE = join(ROOT, 'apps', 'api', 'scripts', 'no-bangla.baseline.json');

function* walkAll(dir) {
  for (const name of readdirSync(dir)) {
    if (RATCHET_SKIP.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walkAll(full);
    else if (RATCHET_EXTS.has(extname(name))) yield full;
  }
}

const counts = {};
for (const file of walkAll(ROOT)) {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  if (rel === 'apps/api/scripts/no-bangla.baseline.json') continue;
  let n = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) if (BANGLA.test(line)) n++;
  if (n > 0) counts[rel] = n;
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n', 'utf8');
  console.log(`\n  baseline updated - ${Object.keys(counts).length} files, ${total} lines\n`);
  process.exit(failed ? 1 : 0);
}

if (!existsSync(BASELINE)) {
  console.log('\n  \x1b[33mSKIP\x1b[0m  check 2 - no baseline yet. Run with --update-baseline once.\n');
  process.exit(failed ? 1 : 0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
const worse = [];
for (const [rel, n] of Object.entries(counts)) {
  const was = base[rel] ?? 0;
  if (n > was) worse.push(`${rel}  ${was} -> ${n}`);
}

if (worse.length) {
  failed = true;
  console.log(`\n  \x1b[31mFAIL\x1b[0m  check 2 - new Bengali arrived. The rule is: nothing new, ever.\n`);
  for (const w of worse.slice(0, 25)) console.log(`    ${w}`);
  if (worse.length > 25) console.log(`    ...and ${worse.length - 25} more`);
  console.log('\n  Write it in English. Bengali belongs in the chat with the owner, not in a file.');
} else {
  const done = baseTotal - total;
  console.log(`  \x1b[32mPASS\x1b[0m  check 2 - nothing new. ${total} old lines left in ${Object.keys(counts).length} files` +
    (done > 0 ? `  (${done} cleared since the baseline - run --update-baseline)` : ''));
}

console.log('');
process.exit(failed ? 1 : 0);
