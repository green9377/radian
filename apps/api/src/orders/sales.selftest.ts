/* eslint-disable no-console */
/**
 * SALES · RETURNS · SUPPLIER self-test.
 *
 * Run through `radian_sales_selftest.bat`.
 *
 * WHY THIS FILE EXISTS (30 Jul 2026)
 * All three of these modules were already marked "review-fixed" — Sales on 17 July
 * (5 critical + 6 major), Returns and Supplier on 23 July. The 30 July system-wide
 * sweep found nine fire-and-forget finance calls across them anyway, plus a lost
 * update in Sales that is the identical twin of the one found in POS.
 *
 * None of it was missed through carelessness. **Finance did not exist when those
 * reviews ran.** The hooks were added afterwards and the reviews were never re-run.
 * That is the single most useful thing this whole exercise turned up: a module is
 * "reviewed" only as of the day it was reviewed, and every module it later grows a
 * dependency on reopens it.
 *
 * So §4 below does not test a behaviour. It tests that invariant, across the whole
 * source tree, on every run.
 *
 * SAFETY, because this touches a live database:
 *   · everything it makes is prefixed ZZSALESTEST
 *   · cleanup runs both BEFORE and AFTER and only ever matches that prefix
 *   · it works on its own order, its own customer and its own product
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { resolvePromisedBy } from './promise';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TAG = 'ZZSALESTEST';

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

const taka = (p: number) => (p / 100).toFixed(2);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const orders = app.get(OrdersService);

  const cleanup = async () => {
    const custs = await prisma.customer.findMany({ where: { phone: { startsWith: TAG } }, select: { id: true } });
    const custIds = custs.map((c) => c.id);
    const ords = await prisma.order.findMany({
      where: { OR: [{ orderNo: { startsWith: TAG } }, { customerId: { in: custIds } }] },
      select: { id: true },
    });
    const orderIds = ords.map((o) => o.id);

    if (orderIds.length) {
      const txns = await prisma.paymentTransaction.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
      const src = [...orderIds, ...txns.map((t) => t.id)];
      const entries = await prisma.journalEntry.findMany({ where: { sourceId: { in: src } }, select: { id: true } });
      const entryIds = entries.map((e) => e.id);
      if (entryIds.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
      }
      await prisma.financePostingFailure.deleteMany({ where: { sourceId: { in: src } } });
      await prisma.paymentTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.activityEvent.deleteMany({ where: { entityId: { in: orderIds } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
      /*  Delivery is what creates this one. The fixture never reached delivered
          before - it called delivered() straight from placed, which the lifecycle
          stopped allowing - so the attribution row is new here, and the second run
          died on its foreign key before a single assertion. Marketing owns the
          row; this only clears the ones this file made.  */
      await prisma.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderMessage.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.reviewInvite.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    const prods = await prisma.product.findMany({ where: { slug: { startsWith: TAG.toLowerCase() } }, select: { id: true } });
    await prisma.product.deleteMany({ where: { id: { in: prods.map((p) => p.id) } } });
    const its = await prisma.item.findMany({ where: { sku: { startsWith: TAG } }, select: { id: true } });
    const itemIds = its.map((i) => i.id);
    if (itemIds.length) {
      await prisma.inventoryMovement.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.inventoryStock.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    }
    await prisma.recipient.deleteMany({ where: { customerId: { in: custIds } } });
    const c = await prisma.customer.deleteMany({ where: { id: { in: custIds } } });
    return { orders: orderIds.length, customers: c.count };
  };

  try {
    console.log('=== 0. clearing anything a previous run left behind ===');
    console.log(JSON.stringify(await cleanup()));

    const category = await prisma.category.findFirst({ where: { deletedAt: null } });
    const channel = await prisma.channel.findFirst();
    if (!category || !channel) throw new Error('seed at least one category and one channel first');

    const customer = await prisma.customer.create({
      data: { name: `${TAG} Buyer`, phone: `${TAG}-01` },
    });

    /* ---------------------------------------------------------------- 1 */
    console.log('\n=== 1. two payments landing at once (ORD-REV-2) ===');

    /* The identical twin of POS-REV-3. `addPayment` wrote `paidPaisa` as an ABSOLUTE
       figure recomputed from a row read before the write. An advance taken on the phone
       while the rider marks COD — a normal Friday — meant both reads saw the same
       `paidPaisa`, both wrote their own total, and one payment vanished from the order
       while staying in the payment ledger for ever. */
    const order = await prisma.order.create({
      data: {
        orderNo: `${TAG}-ORD-1`,
        channelId: channel.id,
        customerId: customer.id,
        /*  `zone` became a required column on Order (DeliveryZone), and this
            fixture writes through the RAW client, so nothing filled it in for
            it - prisma refused every create with "Argument `zone` is missing"
            and the file died before its first assertion. Every real door
            already supplies one: the storefront sends DHAKA or BANGLADESH,
            POS sends COUNTER (DEC-POS-001). These are delivery orders with an
            address, so DHAKA is the honest value.  */
        zone: 'DHAKA',
        senderName: customer.name,
        senderPhone: customer.phone,
        address: 'selftest',
        totalPaisa: 100_000, // ৳1000
        paidPaisa: 0,
        duePaisa: 100_000,
      } as never,
    });

    const both = await Promise.all([
      orders.addPayment(order.id, { kind: 'ADVANCE', method: 'bkash', amountPaisa: 30_000 } as never),
      orders.addPayment(order.id, { kind: 'ADVANCE', method: 'cash', amountPaisa: 20_000 } as never),
    ]);
    ok('both payments are accepted', both.length === 2);

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    const ledger = await prisma.paymentTransaction.aggregate({
      where: { orderId: order.id, kind: { not: 'REFUND' } }, _sum: { amountPaisa: true },
    });
    ok('ORD-REV-2 the order counted BOTH of them',
      after?.paidPaisa === 50_000, taka(after?.paidPaisa ?? 0));
    ok('ORD-REV-2 …so the order and the payment ledger agree',
      after?.paidPaisa === ledger._sum.amountPaisa,
      `order ${taka(after?.paidPaisa ?? 0)} vs ledger ${taka(ledger._sum.amountPaisa ?? 0)}`);
    ok('…and the remaining due follows from that', after?.duePaisa === 50_000, taka(after?.duePaisa ?? 0));

    /* ---------------------------------------------------------------- 2 */
    console.log('\n=== 2. money cannot be invented or over-refunded ===');

    await refuses('collecting more than is outstanding is refused',
      () => orders.addPayment(order.id, { kind: 'ADVANCE', method: 'cash', amountPaisa: 999_999 } as never),
      'outstanding');
    await refuses('refunding more than was collected is refused',
      () => orders.addPayment(order.id, { kind: 'REFUND', method: 'cash', amountPaisa: 999_999 } as never),
      'was collected');

    const refunded = await orders.addPayment(order.id, { kind: 'REFUND', method: 'cash', amountPaisa: 10_000 } as never);
    ok('a refund within what was collected goes through', refunded.refundPaisa === 10_000, taka(refunded.refundPaisa));
    ok('…and it does not reduce paidPaisa (they are two separate facts)',
      refunded.paidPaisa === 50_000, taka(refunded.paidPaisa));

    /* ---------------------------------------------------------------- 3 */
    console.log('\n=== 3. a finance failure is never silent ===');

    const failures2 = await prisma.financePostingFailure.count({
      where: { sourceId: { in: [order.id] }, resolvedAt: null },
    });
    const flagged = await prisma.activityEvent.count({
      where: { entityId: order.id, label: { contains: 'Finance posting failed' } },
    });
    ok('either it posted, or the order timeline says loudly that it did not',
      failures2 === 0 || flagged > 0, `failures=${failures2} flagged=${flagged}`);

    /* ---------------------------------------------------------------- 4 */
    console.log('\n=== 4. the invariant this file exists for ===');

    /* Nine fire-and-forget finance calls survived three separate module reviews, because
       Finance did not exist when those reviews ran and nobody re-ran them. A comment
       cannot prevent the tenth. This can. */
    const root = join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
        if (!entry.name.endsWith('.ts') || entry.name.includes('selftest')) continue;
        // strip block comments so the explanations in these fixes do not match themselves
        const code = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        code.split('\n').forEach((line, i) => {
          if (/^\s*\/\//.test(line)) return;
          if (/void\s+this\.(finance|inventory)\b/.test(line)) {
            offenders.push(`${full.replace(root, '')}:${i + 1}`);
          }
        });
      }
    };
    walk(root);
    ok('no finance or inventory hand-off anywhere is fire-and-forget',
      offenders.length === 0, offenders.length ? offenders.join(', ') : 'clean across src/');

    /* THE OTHER HALF of the lesson — three lost updates were found in total (POS-REV-3,
       ORD-REV-2, ORD-REV-3), all the same shape: an absolute write to a running money
       total from a row read earlier.
       There is deliberately NO source sweep for that one. I wrote one, and on its first
       run it flagged four sites of which three were fine — an initial `create`, a
       per-LINE refund, and a plain object being shaped for a report. A check that cries
       wolf three times out of four is not a test, it is noise somebody will soon start
       ignoring, which is exactly the "green for the wrong reason" trap this whole pass
       kept finding. Distinguishing a running total from a first write needs the type
       information a regex does not have.
       So the guard against a fourth is the behavioural test in §1, not a grep. */

    /* --------------------------------------------------------------- 5 */
    console.log('\n=== 5. delivery does not flatten a payment taken at the same moment (ORD-REV-3) ===');

    const order2 = await prisma.order.create({
      data: {
        orderNo: `${TAG}-ORD-2`,
        channelId: channel.id,
        customerId: customer.id,
        zone: 'DHAKA',
        senderName: customer.name,
        senderPhone: customer.phone,
        address: 'selftest',
        paymentMethod: 'cod',
        totalPaisa: 100_000,
        paidPaisa: 0,
        duePaisa: 100_000,
      } as never,
    });
    await orders.addPayment(order2.id, { kind: 'ADVANCE', method: 'bkash', amountPaisa: 40_000 } as never);
    const advanced = await prisma.order.findUnique({ where: { id: order2.id } });
    ok('an advance is recorded before delivery', advanced?.paidPaisa === 40_000, taka(advanced?.paidPaisa ?? 0));

    /* Before ORD-REV-3, delivered() wrote `o.paidPaisa + outstanding` from a row read
       before its transaction opened — so the advance above could be flattened. */
    /*  The lifecycle grew steps under this fixture. `delivered()` has required
        out-for-delivery since the delivery board landed, and out-for-delivery
        requires preparing, which requires confirmed - so the order has to walk
        the same road a real one walks. Nothing about ORD-REV-3 changes: the
        point is still that delivering does not flatten a payment taken at the
        same moment, and the walk is what makes that reachable.  */
    await orders.confirm(order2.id, 'selftest');
    await orders.startPreparing(order2.id, 'selftest');
    await orders.outForDelivery(order2.id, 'selftest');
    await orders.delivered(order2.id, 'selftest');
    const delivered = await prisma.order.findUnique({ where: { id: order2.id } });
    const ledger2 = await prisma.paymentTransaction.aggregate({
      where: { orderId: order2.id, kind: { not: 'REFUND' } }, _sum: { amountPaisa: true },
    });
    ok('ORD-REV-3 the advance survives delivery',
      delivered?.paidPaisa === 100_000, taka(delivered?.paidPaisa ?? 0));
    ok('ORD-REV-3 …and the order still agrees with the payment ledger',
      delivered?.paidPaisa === ledger2._sum.amountPaisa,
      `order ${taka(delivered?.paidPaisa ?? 0)} vs ledger ${taka(ledger2._sum.amountPaisa ?? 0)}`);
    ok('…and nothing is left owing', delivered?.duePaisa === 0);

    /* --------------------------------------------------------------- 6 */
    console.log('\n=== 6. the delivery promise is a real instant now (DEC-INT-003a) ===');

    /* `promisedBy` was read in six places and written in NONE, so
       /delivery/performance honestly reported "no delivery has a promised time yet"
       instead of a number, from 29 Jul until now. */
    const BD = 6 * 60 * 60 * 1000;
    const dhaka = (d: Date | null | undefined) =>
      d ? new Date(d.getTime() + BD).toISOString().slice(0, 16).replace('T', ' ') : 'null';

    for (const [slot, want] of [
      ['10:00–13:00', '2026-07-30 13:00'],   // 24h, en dash
      ['10 AM – 1 PM', '2026-07-30 13:00'],  // 12h
      ['6 PM to 9 PM', '2026-07-30 21:00'],  // "to"
      ['12:00 AM sharp', '2026-07-30 00:00'], // midnight delivery
    ] as const) {
      ok(`"${slot}" promises ${want} Dhaka time`,
        dhaka(resolvePromisedBy('2026-07-30', slot)) === want,
        dhaka(resolvePromisedBy('2026-07-30', slot)));
    }
    ok('the END of the window is the promise, not the start',
      dhaka(resolvePromisedBy('2026-07-30', '10:00–13:00')) !== '2026-07-30 10:00');
    ok('an unreadable slot stays UNMEASURABLE rather than guessing',
      resolvePromisedBy('2026-07-30', 'Same day') === null);
    ok('…and so does a missing date', resolvePromisedBy(null, '10:00–13:00') === null);

    /* The half that would have gone unnoticed: the container runs UTC and
       `deliveredAt` is stored UTC. Six hours is wider than most slots, so getting the
       offset wrong would have reported every late delivery as on time. */
    const promised = resolvePromisedBy('2026-07-30', '10:00–13:00');
    ok('Dhaka 13:00 is stored as 07:00 UTC, so it compares correctly to deliveredAt',
      promised?.toISOString() === '2026-07-30T07:00:00.000Z', promised?.toISOString());

    const withSlot = await prisma.order.create({
      data: {
        orderNo: `${TAG}-ORD-3`,
        channelId: channel.id, customerId: customer.id,
        zone: 'DHAKA',
        senderName: customer.name, senderPhone: customer.phone,
        address: 'selftest', totalPaisa: 1000, paidPaisa: 0, duePaisa: 1000,
        date: '2026-07-30', slotLabel: '10:00–13:00',
        promisedBy: resolvePromisedBy('2026-07-30', '10:00–13:00'),
      } as never,
    });
    const stored = await prisma.order.findUnique({ where: { id: withSlot.id }, select: { promisedBy: true } });
    ok('an order created with a slot carries a promisedBy', stored?.promisedBy !== null,
      dhaka(stored?.promisedBy));
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
