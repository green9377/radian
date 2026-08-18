/*  ONE-OFF: wipe test/seeded MASTER rows the regular demo-clean deliberately keeps.

    demo-clean treats these tables as vocabulary and leaves them alone. That is
    right as a default - but the vocabulary in the demo DB today was planted by
    sample buttons (since removed) and by hand while testing, and the owner has
    asked for a truly empty start (18 Aug 2026): he will type his own words.

    Deleted here:
      VariantValue, VariantAttribute        - all (the 5 Aug seeded lists)
      ItemAttributeValue, ItemAttribute     - all (6 Aug button + typed tests)
      Unit                                  - all (9 Aug seeded set + typed tests)
      ItemTypeMaster                        - ONLY 'Plastic' and 'hfghfgh' (typed tests);
                                              the five system types stay
      SupplierType                          - ONLY the four typed on 13 Aug;
                                              the two module seeds stay
      Channel                               - everything except 'website'
                                              (checkout refuses to run without it)
      PosRegister                           - all
      ActivityEvent, AuditLog               - all (history of already-wiped data)

    Same guard as demo-clean: refuses a DATABASE_URL that does not contain "neon".
    Dry run by default; --yes to actually delete. One transaction, all or nothing.
*/

import { PrismaClient } from '@prisma/client';

const YES = process.argv.includes('--yes');
const url = process.env.DATABASE_URL || '';
if (!url) {
  console.error('DATABASE_URL is not set. Run through the .bat or set it first.');
  process.exit(1);
}
if (!/neon/i.test(url)) {
  console.error('DATABASE_URL does not look like the Neon demo database. Refusing.');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

/** [label, table, where-SQL or null for all] - children before parents */
const STEPS = [
  ['VariantValue (all)',          'VariantValue',        null],
  ['VariantAttribute (all)',      'VariantAttribute',    null],
  ['ItemAttributeValue (all)',    'ItemAttributeValue',  null],
  ['ItemAttribute (all)',         'ItemAttribute',       null],
  ['Unit (all)',                  'Unit',                null],
  ['ItemTypeMaster (tests only)', 'ItemTypeMaster',      `name IN ('Plastic','hfghfgh')`],
  ['SupplierType (tests only)',   'SupplierType',        `name IN ('Paper Supplier','Kathi Supplier','Pata Supplier','Bag Supplier')`],
  ['Channel (all but website)',   'Channel',             `slug <> 'website'`],
  ['PosRegister (all)',           'PosRegister',         null],
  ['ActivityEvent (all)',         'ActivityEvent',       null],
  ['AuditLog (all)',              'AuditLog',            null],
];

async function main() {
  console.log(YES ? '\nLIVE RUN - deleting.\n' : '\nDRY RUN - nothing will be deleted. Add --yes to delete.\n');

  let total = 0;
  const counts = [];
  for (const [label, table, where] of STEPS) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "${table}"${where ? ` WHERE ${where}` : ''}`,
    );
    const n = rows[0].n;
    total += n;
    counts.push([label, n]);
    console.log(`  ${label.padEnd(30)} ${n}`);
  }
  console.log(`\n  ${total} rows${YES ? '' : ' would be deleted'}.`);

  if (!YES) return;

  await prisma.$transaction(async (tx) => {
    for (const [label, table, where] of STEPS) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}"${where ? ` WHERE ${where}` : ''}`);
    }
  });
  console.log('\nDone. Masters are empty; system rows (website channel, item types, tag groups) kept.');
}

main()
  .catch((e) => { console.error(`\nFailed - nothing was deleted (single transaction).\n${e.message}`); process.exit(1); })
  .finally(() => prisma.$disconnect());
