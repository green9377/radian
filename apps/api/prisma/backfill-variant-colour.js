// Colour backfill — the old typed word becomes a real link.
//
//   docker compose exec api node prisma/backfill-variant-colour.js
//   docker compose exec api node prisma/backfill-variant-colour.js --apply
//
// WHY THIS EXISTS. Until 31 Jul a product's colour was two strings typed into
// the product itself — `variantLabel` ("Red") and `variantSwatch` ("#c0392b").
// D-CAT-01 replaced them with `variantValueId`, a link into the Variant &
// Option master, because a typed word cannot be grouped, counted or renamed,
// and the category page's colour grid is exactly those three questions.
//
// The two old columns are deprecated and will be dropped. Dropping them before
// this has run would throw away the colour of every product that still has only
// the word — which is why the owner's answer on 2 Aug was "backfill first,
// then drop".
//
// ⚠️ DRY RUN BY DEFAULT. Nothing is written without `--apply`. Read the report
// first: the products it CANNOT match are the whole point of running it twice.
//
// WHAT IT WILL NOT DO, DELIBERATELY:
//
//   · it never creates a colour. If a product says "Rose Gold" and the master
//     has no Rose Gold, that is a decision about the shop's colour list, and
//     the owner makes it in Variant & Options — not a script inventing master
//     data at 2 a.m. because a product once had a word in a box.
//   · it never overwrites a product that already has the link. What is in the
//     master wins over what was typed months ago.
//   · it never guesses between two matches. "Red" in two different SWATCH
//     attributes is reported, not resolved.
//
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const APPLY = process.argv.includes('--apply');

/** "  Baby  Pink " and "baby pink" are the same colour; nothing else is */
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  console.log(APPLY ? '\n== APPLYING ==\n' : '\n== DRY RUN (add --apply to write) ==\n');

  /*  Only SWATCH values are colours. A size or a flavour value called "Large"
      must never become a product's colour just because the word matched.  */
  const values = await db.variantValue.findMany({
    where: { isActive: true, attribute: { isActive: true, displayMode: 'SWATCH' } },
    select: { id: true, label: true, attribute: { select: { name: true } } },
  });

  const byLabel = new Map();
  for (const v of values) {
    const k = norm(v.label);
    byLabel.set(k, [...(byLabel.get(k) || []), v]);
  }
  console.log(`Colour master: ${values.length} value(s), ${byLabel.size} distinct name(s)`);

  const products = await db.product.findMany({
    where: { deletedAt: null, variantValueId: null, NOT: { variantLabel: null } },
    select: { id: true, name: true, slug: true, variantLabel: true },
    orderBy: { name: 'asc' },
  });

  if (products.length === 0) {
    console.log('\nNothing to do — no product is carrying a colour word without a link.');
    console.log('The two columns can be dropped once you are happy with that.\n');
    return;
  }

  const matched = [];
  const unmatched = [];
  const ambiguous = [];

  for (const p of products) {
    const hits = byLabel.get(norm(p.variantLabel)) || [];
    if (hits.length === 1) matched.push({ p, v: hits[0] });
    else if (hits.length > 1) ambiguous.push({ p, hits });
    else unmatched.push(p);
  }

  console.log(`\nProducts with a colour word and no link: ${products.length}`);
  console.log(`  can be linked : ${matched.length}`);
  console.log(`  no such colour: ${unmatched.length}`);
  console.log(`  two matches   : ${ambiguous.length}`);

  if (unmatched.length) {
    console.log('\n-- No colour by that name in the master. Add it in Variant &');
    console.log('   Options (or fix the product), then run this again:');
    const tally = new Map();
    for (const p of unmatched) {
      const k = String(p.variantLabel).trim();
      tally.set(k, [...(tally.get(k) || []), p.name]);
    }
    for (const [label, names] of [...tally.entries()].sort()) {
      console.log(`   "${label}" — ${names.length} product(s): ${names.slice(0, 5).join(', ')}${names.length > 5 ? ' …' : ''}`);
    }
  }

  if (ambiguous.length) {
    console.log('\n-- The same colour name exists twice. Left alone on purpose —');
    console.log('   picking one would be a guess about which is the real one:');
    for (const a of ambiguous) {
      console.log(`   ${a.p.name} → "${a.p.variantLabel}" in ${a.hits.map((h) => h.attribute.name).join(' & ')}`);
    }
  }

  if (!APPLY) {
    console.log(`\nDry run. ${matched.length} product(s) would be linked. Re-run with --apply.\n`);
    return;
  }

  /*  One update per product rather than a grouped write: the report above is
      per product, and a partial failure should leave the rest linked. Small by
      nature — this runs once in the life of the shop.  */
  let done = 0;
  for (const m of matched) {
    await db.product.update({ where: { id: m.p.id }, data: { variantValueId: m.v.id } });
    done++;
  }
  console.log(`\nLinked ${done} product(s).`);
  console.log(
    unmatched.length || ambiguous.length
      ? '\n⚠️ Some are still unlinked (above). The two old columns must NOT be\n   dropped until this list is empty, or those products lose their colour.\n'
      : '\n✅ Every product carries a real colour link. The deprecated columns\n   `variantLabel` / `variantSwatch` are now safe to drop.\n',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
