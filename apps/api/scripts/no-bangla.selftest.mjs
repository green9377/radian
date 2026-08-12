/*
  NO BANGLA IN THE PRODUCT — the tripwire.

      node apps/api/scripts/no-bangla.selftest.mjs

  The owner's locked rule (6 Aug 2026): nothing the product prints may be in
  Bengali — screen text, error messages, API responses. He has had to repeat
  it more than once, which means remembering is not working. This script is
  the replacement for remembering: it scans every source file, strips the
  comments (internal notes are chat, not product), and FAILS THE BUILD if a
  Bengali character survives in actual code — a string literal, JSX text, an
  error message.

  Wired into BUILD_CHECK.bat and RUN_TESTS.bat, so it runs before every push
  and every test round. A rule the machine enforces does not need repeating.
*/

import { readdirSync, readFileSync, statSync } from 'node:fs';
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
if (hits.length === 0) {
  console.log('  \x1b[32mPASS\x1b[0m  no Bengali in any code, string or screen text\n');
  process.exit(0);
}
console.log(`  \x1b[31mFAIL\x1b[0m  Bengali found in CODE (comments are ignored — these will print):\n`);
for (const h of hits.slice(0, 25)) {
  console.log(`    ${h.file}:${h.line}`);
  console.log(`      ${h.text}`);
}
if (hits.length > 25) console.log(`    ...and ${hits.length - 25} more`);
console.log('\n  The owner\'s rule: nothing the product prints is in Bengali. Fix before pushing.\n');
process.exit(1);
