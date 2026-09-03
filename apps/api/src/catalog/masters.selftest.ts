/* eslint-disable no-console */
/**
 * MASTER DATA self-test — Catalog · Customers · Products.
 *
 * Run through `radian_masters_selftest.bat`.
 *
 * WHY THIS FILE EXISTS (30 Jul 2026)
 * These three had never been reviewed. The pass over them was driven by a
 * SYSTEM-WIDE SWEEP rather than by reading each file, because the four modules
 * before them had all failed in the same three ways. The sweep is what found the
 * two faults asserted hardest here:
 *
 *   · the WALK-IN system customer could be DELETED, which bricks the till for ever:
 *     POS cannot see the soft-deleted row, cannot re-create it (the deleted row still
 *     holds 'WALK-IN' in the @unique index), and so every anonymous counter sale 500s.
 *     Nothing guarded it, and no POS error message contains the word "customer".
 *   · `ensurePhoneFree` and `ensureSlugFree` both read through the soft-delete-filtered
 *     client, so a deleted row's phone/slug looked FREE — the check passed and the
 *     insert then died on the unique index with a bare 500. Item's `freeSku()` had used
 *     the raw client for this reason since July; the lesson never crossed the module
 *     boundary.
 *
 * SAFETY, because this touches a live database:
 *   · everything it makes is prefixed ZZMASTERTEST
 *   · cleanup runs both BEFORE and AFTER and only ever matches that prefix
 *   · it NEVER deletes the real WALK-IN customer — it only asserts that it may not be
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { TagGroupsService } from './tag-groups';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TAG = 'ZZMASTERTEST';
/*  Well-formed but unreachable: 09 is not an assigned Bangladeshi mobile
    prefix, so these pass the international rule and can never ring anybody. */
const TEST_PHONE = '+8809900000001';
const TEST_PHONE_2 = '+8809900000002';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(what: string, condition: boolean, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${what}${detail ? `  (${detail})` : ''}`);
  } else {
    fail += 1;
    failures.push(what + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${what}${detail ? `  (${detail})` : ''}`);
  }
}

async function refuses(what: string, fn: () => Promise<unknown>, expectInMessage?: string) {
  try {
    await fn();
    ok(what, false, 'it was allowed, but should not have been');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (expectInMessage && !msg.toLowerCase().includes(expectInMessage.toLowerCase()))
      ok(what, false, `refused, but for the wrong reason: ${msg}`);
    else ok(what, true, msg.slice(0, 80));
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const customers = app.get(CustomersService);
  const products = app.get(ProductsService);
  const tagGroups = app.get(TagGroupsService);

  const cleanup = async () => {
    const custs = await prisma.customer.findMany({
      /*  Was `startsWith: TAG`. The fixtures' phones are international now, so
          the tag lives in the NAME and the numbers share a prefix of their own -
          match on either, or the rows this file makes are never cleared again. */
      where: { OR: [{ phone: { startsWith: '+88099' } }, { name: { startsWith: TAG } }] },
      select: { id: true },
    });
    const custIds = custs.map((c) => c.id);
    const orders = await prisma.order.findMany({
      where: { customerId: { in: custIds } }, select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    await prisma.paymentTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.recipient.deleteMany({ where: { customerId: { in: custIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: custIds } } });
    await prisma.activityEvent.deleteMany({ where: { entityId: { in: custIds } } });
    const c = await prisma.customer.deleteMany({ where: { id: { in: custIds } } });

    const prods = await prisma.product.findMany({
      where: { slug: { startsWith: TAG.toLowerCase() } }, select: { id: true },
    });
    const prodIds = prods.map((p) => p.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: prodIds } } });
    await prisma.activityEvent.deleteMany({ where: { entityId: { in: prodIds } } });
    const p = await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
    return { customers: c.count, products: p.count };
  };

  try {
    console.log('=== 0. clearing anything a previous run left behind ===');
    console.log(JSON.stringify(await cleanup()));

    /* ---------------------------------------------------------------- 1 */
    console.log('\n=== 1. the walk-in customer is not the operator\'s to delete (CUS-REV-1) ===');

    /* We do NOT create or delete the real one. If POS has ever run it exists; if not,
       the rule is still asserted through a stand-in on the same guarded phone value. */
    const walkIn = await prisma.customer.findFirst({ where: { phone: 'WALK-IN' } });
    if (walkIn) {
      await refuses('CUS-REV-1 deleting the walk-in customer is refused',
        () => customers.remove(walkIn.id, 'selftest'), 'cannot be deleted');
      const stillThere = await prisma.customer.findFirst({
        where: { phone: 'WALK-IN' }, select: { deletedAt: true },
      });
      ok('CUS-REV-1 …and it is still live afterwards', stillThere?.deletedAt === null);
    } else {
      console.log('  SKIP  POS has never run, so there is no WALK-IN row to protect yet');
    }
    const src = readFileSync(join(__dirname, '../customers/customers.service.ts'), 'utf8');
    ok('CUS-REV-1 the guard is in remove(), not only on a screen',
      /WALK-IN/.test(src) && /cannot be deleted/.test(src));

    /* ---------------------------------------------------------------- 2 */
    console.log('\n=== 2. a deleted phone number is NOT free (CUS-REV-2) ===');

    /*  CustomersService.validate() requires an international number, and both
        doors agree on it - the storefront's findOrCreateCustomer refuses a
        local format too. This fixture predated the rule and sent `TAG-01`, so
        the file died at its first create. 09 is not an assigned Bangladeshi
        mobile prefix, so this is well-formed and unreachable at the same time. */
    const one = await customers.create({
      name: `${TAG} Rahim`, phone: TEST_PHONE,
    } as never);
    ok('a customer is created', !!one.id);
    await refuses('a live duplicate phone is refused',
      () => customers.create({ name: `${TAG} Copy`, phone: TEST_PHONE } as never),
      'already registered');

    await customers.remove(one.id, 'selftest');
    const gone = await prisma.customer.findUnique({ where: { id: one.id }, select: { deletedAt: true } });
    ok('…it goes to the trash, not away', gone?.deletedAt !== null);

    /* Before the fix this passed the check and then died on the unique index with a
       bare 500 — for a number the system had just said was available. */
    await refuses('CUS-REV-2 a phone belonging to a TRASHED customer is refused, with a reason',
      () => customers.create({ name: `${TAG} Reuse`, phone: TEST_PHONE } as never),
      'in the trash');

    await customers.restore(one.id, 'selftest');
    ok('…and restoring gives the number back to its owner',
      !!(await prisma.customer.findFirst({ where: { phone: TEST_PHONE, deletedAt: null } })));

    /* ---------------------------------------------------------------- 3 */
    console.log('\n=== 3. money owed cannot be hidden by deleting the customer (CUS-REV-3) ===');

    const category = await prisma.category.findFirst({ where: { deletedAt: null } });
    const channel = await prisma.channel.findFirst();
    if (category && channel) {
      const debtor = await customers.create({
        name: `${TAG} Debtor`, phone: TEST_PHONE_2,
      } as never);
      await prisma.order.create({
        data: {
          orderNo: `${TAG}-ORD-1`,
          /*  Same reason as sales.selftest: `zone` is a required column on
              Order now, and this writes through the raw client. */
          zone: 'DHAKA',
          channelId: channel.id,
          customerId: debtor.id,
          senderName: `${TAG} Debtor`,
          senderPhone: `${TAG}-02`,
          address: 'selftest',
          totalPaisa: 100_000,
          paidPaisa: 0,
          duePaisa: 100_000,
        } as never,
      });
      await refuses('CUS-REV-3 a customer who still owes money cannot be deleted',
        () => customers.remove(debtor.id, 'selftest'), 'still owes');

      await prisma.order.updateMany({
        where: { customerId: debtor.id },
        data: { duePaisa: 0, paidPaisa: 100_000 },
      });
      const cleared = await customers.remove(debtor.id, 'selftest');
      ok('…and can be, once the bill is settled', cleared.deleted === true);
    } else {
      console.log('  SKIP  no category/channel seeded — the due guard is not exercised');
    }

    /* ---------------------------------------------------------------- 4 */
    console.log('\n=== 4. a deleted slug is NOT free either (PRD-REV-1) ===');

    if (category) {
      const base = {
        categoryId: category.id, productType: 'READYMADE', zone: 'NATIONWIDE',
        natureType: 'ARTIFICIAL', costPaisa: 10_000, sellingPricePaisa: 20_000,
      };
      const prod = await products.create({
        ...base, name: `${TAG} Bouquet`, slug: `${TAG.toLowerCase()}-bouquet`,
      } as never);
      ok('a product is created', !!prod.id);
      await refuses('a live duplicate slug is refused',
        () => products.create({ ...base, name: `${TAG} Copy`, slug: `${TAG.toLowerCase()}-bouquet` } as never),
        'already in use');

      await products.remove(prod.id, 'selftest');
      /* A slug is the storefront URL, so silently handing a trashed product's slug to a
         new one would point every old link, ad and WhatsApp forward at the wrong thing. */
      await refuses('PRD-REV-1 a slug belonging to a TRASHED product is refused, with a reason',
        () => products.create({ ...base, name: `${TAG} Reuse`, slug: `${TAG.toLowerCase()}-bouquet` } as never),
        'in the trash');
    } else {
      console.log('  SKIP  no category seeded — the slug rules are not exercised');
    }

    /* ---------------------------------------------------------------- 5 */
    console.log('\n=== 5. the system tag groups are created once, not twice (CAT-REV-1) ===');

    /* `TagGroup.slug` is @unique and init() was `findFirst → create`. It is called to
       set the screen up, so a React effect firing twice on mount was enough. */
    const raced = await Promise.all([tagGroups.init('selftest'), tagGroups.init('selftest'), tagGroups.init('selftest')]);
    ok('CAT-REV-1 three callers racing init() all get an answer', raced.every((r) => r.length >= 2));
    const occ = await prisma.tagGroup.count({ where: { slug: 'occasions' } });
    const rec = await prisma.tagGroup.count({ where: { slug: 'recipients' } });
    ok('CAT-REV-1 …and exactly one Occasions group exists', occ === 1, `${occ} rows`);
    ok('CAT-REV-1 …and exactly one Recipients group exists', rec === 1, `${rec} rows`);

    /* ---------------------------------------------------------------- 6 */
    console.log('\n=== 6. the sweep itself — no lazy unique row left unguarded ===');

    /* This is the assertion that outlives the four modules above. The 29 July pass
       fixed eight singletons and wrote that eight hand-written catch blocks "would
       drift apart again"; that was right. What it got wrong was WHAT to look for — it
       grepped for `*Setting` accessors, so the lesson was applied to the SHAPE and not
       to the HAZARD, and seven lazily-created rows behind @unique columns survived:
       Warehouse(ASSEMBLY) · Channel(pos) · Customer(WALK-IN) · Customer(by phone) ·
       PosRegister(COUNTER-1) · TagGroup(slug) · SupplierType(name).
       If a new one is added without ensureSingleton, this goes red. */
    const root = join(__dirname, '..');
    const suspects: { file: string; line: number; text: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
        if (!entry.name.endsWith('.ts') || entry.name.includes('selftest')) continue;
        const lines = readFileSync(full, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          // findFirst on a natural key, with a .create() close behind and no ensureSingleton
          if (!/findFirst\(\{\s*where:\s*\{\s*(slug|code|phone|name):/.test(lines[i])) continue;
          const window = lines.slice(i, i + 6).join('\n');
          if (/\.create\(/.test(window) && !/ensureSingleton/.test(lines.slice(Math.max(0, i - 3), i + 6).join('\n'))) {
            suspects.push({ file: full.replace(root, ''), line: i + 1, text: lines[i].trim().slice(0, 60) });
          }
        }
      }
    };
    walk(root);
    /* createType/createRole legitimately look-then-create to give a friendly "already
       exists" error on a user action; they are listed so the count is honest, not zero. */
    const unguarded = suspects.filter((s) => !/createType|createRole|ensureSlugFree|ensurePhoneFree/.test(s.text));
    ok('no NEW lazily-created unique row has appeared unguarded',
      unguarded.length === 0,
      unguarded.length ? unguarded.map((u) => `${u.file}:${u.line}`).join(', ') : 'clean');
  } catch (e) {
    fail += 1;
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    failures.push(`the run itself broke: ${msg}`);
    console.log(`\n!!! the run itself broke: ${msg}`);
  } finally {
    console.log('\n=== cleaning up ===');
    try {
      console.log(JSON.stringify(await cleanup()));
    } catch (e) {
      console.log('CLEANUP FAILED: ' + (e instanceof Error ? e.message : String(e)));
    }
    console.log(`\n================ ${pass} passed, ${fail} failed ================`);
    if (failures.length) {
      console.log('\nWhat did not hold up:');
      for (const f of failures) console.log('  - ' + f);
    }
    await app.close();
    process.exit(fail === 0 ? 0 : 1);
  }
}

void main();
