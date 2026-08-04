/* Replicates checkout.ts resolve() + toOrderLines() and checks the invariant:
   Σ order-line linePaisa  ===  qty × (bundleTotal + addons)   — the number the
   product page showed the shopper. */
function applyDiscount(p, t, v) {
  if (t === 'FLAT') return Math.max(0, p - v);
  if (t === 'PERCENT') return Math.max(0, Math.round((p * (10000 - v)) / 10000));
  return p;
}
function check(name, base, picks, addons, type, value, qty) {
  const before = base + picks.reduce((n, p) => n + p, 0);
  const savePerUnit = picks.length ? before - applyDiscount(before, type, value) : 0;
  const totalSave = savePerUnit * qty;

  const extras = picks.map((p) => ({
    unit: p, qty,
    disc: before === 0 ? 0 : Math.floor((totalSave * p) / before),
  }));
  const mainDisc = totalSave - extras.reduce((n, e) => n + e.disc, 0);

  const mainGross = base + addons;
  const lines = [
    { unit: mainGross, qty, disc: mainDisc },
    ...extras,
  ];
  const serverSum = lines.reduce((n, l) => n + l.unit * l.qty - l.disc, 0);

  // what the PDP / old cart showed
  /* mirrors bundleTotals(): nothing picked = no discount (DEC-PRD-018) */
  const pageUnit = (picks.length ? applyDiscount(before, type, value) : base) + addons;
  const pageSum = pageUnit * qty;

  const negative = lines.filter((l) => l.unit * l.qty - l.disc < 0);
  const okSum = serverSum === pageSum;
  const okNeg = negative.length === 0;
  console.log(
    `${okSum && okNeg ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${name}` +
    `\n      server ${serverSum}  page ${pageSum}` +
    (okNeg ? '' : `  \x1b[31mNEGATIVE LINE\x1b[0m ${JSON.stringify(negative)}`),
  );
  return okSum && okNeg;
}

let all = true;
all &= check('no bundle picked (no discount)', 129900, [], 0, 'PERCENT', 1000, 1);
all &= check('one pick, 10% off', 129900, [45000], 0, 'PERCENT', 1000, 1);
all &= check('three picks, 15% off, qty 3', 210000, [45000, 32000, 9900], 0, 'PERCENT', 1500, 3);
all &= check('addons excluded from discount', 129900, [45000], 25000, 'PERCENT', 1000, 2);
all &= check('FLAT discount bigger than main line', 10000, [100000], 0, 'FLAT', 22000, 1);
all &= check('FLAT larger than everything', 10000, [5000], 0, 'FLAT', 99000, 1);
all &= check('odd numbers, rounding stress', 133337, [9991, 7777, 3333], 1111, 'PERCENT', 1234, 7);
all &= check('qty 20, three picks', 87650, [12345, 6789, 111], 500, 'PERCENT', 999, 20);
console.log(all ? '\n\x1b[32mALL INVARIANTS HOLD\x1b[0m' : '\n\x1b[31mBROKEN\x1b[0m');
