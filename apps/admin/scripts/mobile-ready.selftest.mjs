/*
  THE ADMIN ON A PHONE — the tripwire.

      node apps/admin/scripts/mobile-ready.selftest.mjs
      node apps/admin/scripts/mobile-ready.selftest.mjs --update-baseline

  Phase 9 is "the admin on a phone", and it is the biggest piece of
  engineering left. A job that size needs a yardstick, or "mobile-friendly"
  stays an opinion: somebody fixes four screens, it feels better, and nobody
  can say what is left or whether yesterday's work quietly came undone.

  Same shape as `no-bangla.selftest.mjs`, and for the same reason — a rule the
  machine enforces does not need repeating.

  ── WHAT IT COUNTS, AND WHY EACH ONE ────────────────────────────────────────

  Only three things, all of them measured on the day Phase 9 opened (1 Sep
  2026) against the real repo — not guessed:

  BARE GRID   `grid-cols-3` with no breakpoint in front of it. Three columns
              on a 375px screen is three unreadable columns. 135 of them; 386
              others already say `md:grid-cols-3`, which is the shape we want.

  WIDE BOX    `w-[420px]`, `min-w-[560px]` — any fixed pixel width ≥ 300. It
              cannot fit a phone, so it either overflows the page sideways or
              squeezes everything beside it. 149 of them. Widths under 300px
              are icons, badges and avatars: left alone deliberately, because
              a rule that flags `w-[36px]` is a rule people learn to ignore.

  TABLE       `<table>` — 41 of them, in 25 files. A table is the classic
              sideways scroll. It does not have to become cards; it has to
              stop dragging the PAGE sideways.

  ── THE RATCHET ─────────────────────────────────────────────────────────────

  Today's counts are frozen per file. The build fails if a file GAINS any of
  the three, or a new file arrives carrying some. The 325 that exist can be
  cleared at whatever pace the phase takes; nothing new may arrive while that
  happens. Every swept file lowers the number, and the number only goes down.

  After sweeping a screen, run --update-baseline and commit the smaller file.
  At zero the ratchet has become "the admin has no desktop-only markup left"
  and this file can go.

  ── THE SHELL CHECK ─────────────────────────────────────────────────────────

  Counting markup is not the whole truth. The first fault is not a squeezed
  column, it is that **there is no menu at all** below `md`: the sidebar is
  `hidden md:flex` and nothing replaces it, so on a phone the only way to
  reach a screen is to type its URL. That is check 1 below. It reports
  WAITING rather than failing until Phase 9 builds the drawer — a tripwire
  that fails from the day it is written is decoration.
*/

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN = join(HERE, '..');
const SCAN = join(ADMIN, 'app');
const BASELINE = join(HERE, 'mobile-ready.baseline.json');
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist']);

/*  A breakpoint prefix in front of it means somebody has already thought
    about the small screen — that is the shape we are moving towards, so it
    must not be counted as debt.  */
const BARE_GRID = /(?<![a-z0-9:-])grid-cols-([2-9]|1[0-2])\b/g;
const WIDE_BOX = /\b(?:w|min-w)-\[(\d{3,4})px\]/g;
const TABLE = /<table\b/g;
const BREAKPOINT = /\b(?:sm|md|lg|xl|2xl):/;

const WIDE_FLOOR = 300; // below this it is an icon, not a layout decision

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const rel = (p) => p.slice(ADMIN.length + 1).split('\\').join('/');

const counts = {};
let files = 0;
let withBreakpoints = 0;
let bareTotal = 0;
let wideTotal = 0;
let tableTotal = 0;

for (const p of walk(SCAN)) {
  const src = readFileSync(p, 'utf8');
  files += 1;
  if (BREAKPOINT.test(src)) withBreakpoints += 1;

  const bare = (src.match(BARE_GRID) ?? []).length;
  const wide = [...src.matchAll(WIDE_BOX)].filter((m) => Number(m[1]) >= WIDE_FLOOR).length;
  const tables = (src.match(TABLE) ?? []).length;
  const score = bare + wide + tables;
  bareTotal += bare;
  wideTotal += wide;
  tableTotal += tables;
  if (score > 0) counts[rel(p)] = { bare, wide, tables };
}

const total = bareTotal + wideTotal + tableTotal;

/* ── check 1: can anybody navigate this on a phone? ───────────────────────── */

const shellPath = join(SCAN, '_components', 'AdminSidebar.tsx');
const shell = existsSync(shellPath) ? readFileSync(shellPath, 'utf8') : '';
const hasDesktopRail = /hidden\s+md:flex/.test(shell);
const hasMobileNav = /md:hidden/.test(shell);

/* ── check 2: the ratchet ─────────────────────────────────────────────────── */

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const grew = [];
if (base) {
  for (const [file, now] of Object.entries(counts)) {
    const was = base[file] ?? { bare: 0, wide: 0, tables: 0 };
    const nowSum = now.bare + now.wide + now.tables;
    const wasSum = was.bare + was.wide + was.tables;
    if (nowSum > wasSum) grew.push(`${file}  ${wasSum} -> ${nowSum}`);
  }
}

const baseTotal = base
  ? Object.values(base).reduce((n, x) => n + x.bare + x.wide + x.tables, 0)
  : total;
const cleared = baseTotal - total;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const GREY = '\x1b[90m';
const OFF = '\x1b[0m';

console.log(`\nADMIN ON A PHONE — ${files} screens scanned, ${withBreakpoints} of them responsive\n`);

if (!hasDesktopRail) {
  console.log(`  ${GREEN}PASS${OFF}  check 1 - the sidebar is not desktop-only any more`);
} else if (hasMobileNav) {
  console.log(`  ${GREEN}PASS${OFF}  check 1 - there is a way to navigate below md`);
} else {
  console.log(
    `  ${GREY}WAIT${OFF}  check 1 - no menu below md yet. The sidebar is 'hidden md:flex' and\n` +
      `        nothing replaces it, so on a phone a screen can only be reached by\n` +
      `        typing its URL. Phase 9 builds the drawer; this turns into a real\n` +
      `        check the day it exists.`,
  );
}

if (grew.length) {
  console.log(`\n  ${RED}FAIL${OFF}  check 2 - new desktop-only markup arrived. The rule is: nothing new.\n`);
  for (const line of grew) console.log(`    ${line}`);
  console.log(
    `\n  A phone is 375px wide. Put a breakpoint in front of the grid, let the box\n` +
      `  size itself, or give the table its own overflow-x container.\n`,
  );
} else {
  console.log(
    `  ${GREEN}PASS${OFF}  check 2 - nothing new. ${total} left ` +
      `(${bareTotal} bare grids, ${wideTotal} wide boxes, ${tableTotal} tables)` +
      (cleared > 0 ? `  ${cleared} cleared since the baseline - run --update-baseline` : ''),
  );
}
console.log();

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n', 'utf8');
  console.log(`  baseline updated - ${Object.keys(counts).length} files, ${total} to go\n`);
  process.exit(0);
}

process.exit(grew.length ? 1 : 0);
