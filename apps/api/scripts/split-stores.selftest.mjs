/*
  DEC-INV-018 self-test — "which store does this sale come out of?"

      node apps/api/scripts/split-stores.selftest.mjs

  No database, no server, runs in a second. The rule it guards, in the owner's
  words (10 Aug 2026): take from the chosen store first, then from wherever the
  rest is, and never refuse a sale.

  ⚠️ This file mirrors `src/inventory/split-stores.ts` by hand because the API is
  TypeScript and this must stay runnable with plain node. If you change the rule,
  change BOTH — and the mirror check at the bottom will remind you.
*/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src', 'inventory', 'split-stores.ts');

/* ---- the rule, in plain JS (mirror of splitAcrossStores) ---- */
function splitAcrossStores(needMilli, holdings, defaultWarehouseId) {
  if (needMilli <= 0) return [];
  const usable = [...holdings].filter((h) => h.freeMilli > 0);
  usable.sort((a, b) =>
    a.warehouseId === defaultWarehouseId ? -1
      : b.warehouseId === defaultWarehouseId ? 1
        : b.freeMilli - a.freeMilli);

  const takes = [];
  let left = needMilli;
  for (const h of usable) {
    if (left <= 0) break;
    const take = Math.min(h.freeMilli, left);
    left -= take;
    takes.push({ warehouseId: h.warehouseId, takeMilli: take, name: h.warehouseId === defaultWarehouseId ? null : h.name });
  }
  if (left > 0) {
    const onDefault = takes.find((t) => t.warehouseId === defaultWarehouseId);
    if (onDefault) onDefault.takeMilli += left;
    else takes.push({ warehouseId: defaultWarehouseId, takeMilli: left, name: null });
  }
  return takes;
}

/* ---- cases ---- */
const SHOP = 'shop', STORE = 'store', OTHER = 'other';
const shop = (q) => ({ warehouseId: SHOP, name: 'Main store', freeMilli: q });
const store = (q) => ({ warehouseId: STORE, name: 'Storeroom', freeMilli: q });
const other = (q) => ({ warehouseId: OTHER, name: 'Uttara', freeMilli: q });

const short = (t) => t.map((x) => `${x.warehouseId}:${x.takeMilli}${x.name ? '(note)' : ''}`).join(' + ');

const cases = [
  ['the default has enough — one row, no note',
    () => splitAcrossStores(10_000, [shop(50_000), store(50_000)], SHOP), 'shop:10000'],

  ['the default is empty, the goods are next door — sale still happens',
    () => splitAcrossStores(10_000, [store(50_000)], SHOP), 'store:10000(note)'],

  ['the default covers part — the rest comes from the other store',
    () => splitAcrossStores(30_000, [shop(10_000), store(50_000)], SHOP), 'shop:10000 + store:20000(note)'],

  ['three stores, fullest first after the default',
    () => splitAcrossStores(90_000, [shop(10_000), store(20_000), other(70_000)], SHOP),
    'shop:10000 + other:70000(note) + store:10000(note)'],

  ['nothing anywhere — shortfall books on the default, never refused',
    () => splitAcrossStores(5_000, [], SHOP), 'shop:5000'],

  ['not enough anywhere — take all of it, shortfall joins the default row',
    () => splitAcrossStores(25_000, [shop(4_000), store(6_000)], SHOP),
    'shop:19000 + store:6000(note)'],

  ['shortfall with an empty default — one default row carries it',
    () => splitAcrossStores(25_000, [store(6_000)], SHOP), 'store:6000(note) + shop:19000'],

  ['a store at exactly zero is ignored, not written as a zero row',
    () => splitAcrossStores(5_000, [shop(0), store(9_000)], SHOP), 'store:5000(note)'],

  ['a store already negative is never taken from',
    () => splitAcrossStores(5_000, [shop(-3_000), store(9_000)], SHOP), 'store:5000(note)'],

  ['nothing needed — nothing posted',
    () => splitAcrossStores(0, [shop(50_000)], SHOP), ''],
];

let bad = 0;
console.log('\nDEC-INV-018 — sell from where the goods actually are\n');
for (const [name, run, expect] of cases) {
  const got = short(run());
  const ok = got === expect;
  if (!ok) bad++;
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${name}`);
  if (!ok) console.log(`        expected  ${expect || '(nothing)'}\n        got       ${got || '(nothing)'}`);
}

/* every case must add up to what was asked for — the one thing that must never drift */
const totals = [
  [10_000, [shop(50_000), store(50_000)]],
  [30_000, [shop(10_000), store(50_000)]],
  [25_000, [shop(4_000), store(6_000)]],
  [90_000, [shop(10_000), store(20_000), other(70_000)]],
];
for (const [need, holds] of totals) {
  const sum = splitAcrossStores(need, holds, SHOP).reduce((s, t) => s + t.takeMilli, 0);
  const ok = sum === need;
  if (!ok) bad++;
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  the pieces add up to ${need} (got ${sum})`);
}

/* the mirror check — this file duplicates the rule, so make the duplication loud */
const src = readFileSync(SRC, 'utf8');
const mirrored = ['freeMilli > 0', 'b.freeMilli - a.freeMilli', 'onDefault.takeMilli += left']
  .every((s) => src.includes(s));
console.log(`  ${mirrored ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  still mirrors split-stores.ts`);
if (!mirrored) { bad++; console.log('        the service changed but this test did not — fix both'); }

console.log(bad === 0 ? '\n\x1b[32mALL GOOD\x1b[0m\n' : `\n\x1b[31m${bad} FAILED\x1b[0m\n`);
process.exit(bad === 0 ? 0 : 1);
