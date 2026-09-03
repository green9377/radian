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
import { DeliveryService } from '../delivery/delivery.service';
import { availabilityOf } from '../common/availability';
import { ProductDetailService } from '../shop/product-detail';
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
  const delivery = app.get(DeliveryService);

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
      await prisma.deliveryAssignment.deleteMany({ where: { orderId: { in: orderIds } } }); // R5 rows
      await prisma.orderMessage.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.reviewInvite.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    const prods = await prisma.product.findMany({ where: { slug: { startsWith: TAG.toLowerCase() } }, select: { id: true } });
    const prodIds = prods.map((p) => p.id);
    await prisma.productVariant.deleteMany({ where: { productId: { in: prodIds } } });
    await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
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
    // the order door reads through the soft-delete filter, so the fixture must too (R1 run, 4 Sep)
    const channel = await prisma.channel.findFirst({ where: { deletedAt: null, isActive: true } });
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

    /* --------------------------------------------------------------- 7 */
    console.log('\n=== 7. R1 — a colour with an empty shelf cannot be sold (4 Sep 2026) ===');

    /*  Found on the go-live walk: the product box said 500, both variant
        shelves said 0, the shop sold Pink · Small, and Preparing refused the
        same line against the same shelf. The gate now says what Preparing
        says. Pure rule first, then the order door itself.  */
    const base = {
      stockMode: 'MANUAL' as const, stockQty: 500, supplierId: null,
      soldOutMode: 'STOCK_OUT' as const, preorderDate: null,
    };
    ok('R1 every variant at 0 is OUT_OF_STOCK, whatever the product box says',
      availabilityOf({ ...base, variantStock: [0, 0] }).state === 'OUT_OF_STOCK');
    ok('R1 one variant with stock keeps the product buyable',
      availabilityOf({ ...base, variantStock: [0, 3] }).state === 'IN_STOCK');
    ok('R1 with no variants the product box decides, as before',
      availabilityOf({ ...base, stockQty: 2 }).state === 'IN_STOCK' &&
      availabilityOf({ ...base, stockQty: 0 }).state === 'OUT_OF_STOCK');
    /*  Owner, 4 Sep 2026 — Inventory-connected stock is gated at 0 like a
        hand box. Resolved counts of 0 close the door whatever the mode; only
        a count the caller could NOT resolve keeps the old open answer.  */
    ok('R1 a TRACKED product whose resolved variant shelves are all 0 is OUT_OF_STOCK',
      availabilityOf({ ...base, stockMode: 'TRACKED', variantStock: [0, 0] }).state === 'OUT_OF_STOCK');
    ok('R1 a TRACKED count the caller could not resolve is not refused on a guess',
      availabilityOf({ ...base, stockMode: 'TRACKED', stockQty: 0 }).state === 'IN_STOCK');
    ok('R1 a variant shelf the caller could not read is not judged from its hand box',
      availabilityOf({ ...base, variantStock: [0], hasTrackedVariant: true }).state === 'IN_STOCK');
    ok('R1 PRE_ORDER still answers when every variant is 0',
      availabilityOf({ ...base, soldOutMode: 'PRE_ORDER', variantStock: [0] }).state === 'PRE_ORDER');

    const values = await prisma.variantValue.findMany({ take: 2, select: { id: true } });
    if (values.length < 2) throw new Error('need two VariantValue rows (any colour labels) to build the R1 fixture');
    const shelf = await prisma.product.create({
      data: {
        name: `${TAG} Shelf Test`, slug: `${TAG.toLowerCase()}-shelf`,
        categoryId: category.id, productType: 'READYMADE', zone: 'NATIONWIDE', natureType: 'ARTIFICIAL',
        costPaisa: 100, sellingPricePaisa: 1000, stockMode: 'MANUAL', stockQty: 500,
        variants: {
          create: [
            { variantValueId: values[0].id, comboKey: 'a', stockQty: 0 },
            { variantValueId: values[1].id, comboKey: 'b', stockQty: 2 },
          ],
        },
      },
      include: { variants: true },
    });
    const empty = shelf.variants.find((v) => v.stockQty === 0)!;
    const stocked = shelf.variants.find((v) => v.stockQty === 2)!;
    const door = (variantId: string) =>
      orders.create({
        customerId: customer.id, channelId: channel.id, zone: 'DHAKA', address: 'selftest',
        paymentMethod: 'cod', deliveryPaisa: 0, applyOffers: false, actorName: 'selftest',
        lines: [{ productId: shelf.id, qty: 1, variantId }],
      } as never);
    await refuses('R1 the order door refuses the option whose shelf is 0',
      () => door(empty.id), 'sold out');
    const sold = await door(stocked.id);
    ok('R1 …and takes the option that has stock', !!sold?.id);

    await prisma.productVariant.update({ where: { id: stocked.id }, data: { stockQty: 0 } });
    await refuses('R1 with every shelf at 0 nothing is sold, though the product box still says 500',
      () => door(stocked.id), 'out of stock');

    /* -------------------------------------------------------------- 7b */
    console.log('\n=== 7b. "Allow order when stock is 0" — one switch, both stock modes (4 Sep 2026) ===');

    /*  The owner's final stock rule, 4 Sep 2026. Stock is kept by hand
        (MANUAL) or through the Inventory connection (TRACKED); in BOTH modes
        a count of 0 closes the door, unless the product carries the one
        switch `allowOrderAtZero`. No recipe or component arithmetic, no
        CRAFTED distinction, Pre-order untouched. Six cases (A–F), each asked
        three ways: the pure rule, the product page, the order door.  */
    const detail = app.get(ProductDetailService);
    const inv = { ...base, stockMode: 'TRACKED' as const, stockQty: 0 };

    // A. Manual, 0, switch off
    ok('A rule: MANUAL at 0, switch off -> OUT_OF_STOCK',
      availabilityOf({ ...base, stockQty: 0, allowOrderAtZero: false }).state === 'OUT_OF_STOCK');
    // B. Manual, 0, switch on
    ok('B rule: MANUAL at 0, switch on -> IN_STOCK (a normal order, no pre-order wording)',
      availabilityOf({ ...base, stockQty: 0, allowOrderAtZero: true }).state === 'IN_STOCK');
    // C. Inventory-connected, 0, switch off  (null = no stock row yet, 0 = an empty row)
    ok('C rule: TRACKED at 0, switch off -> OUT_OF_STOCK',
      availabilityOf({ ...inv, inventoryQty: 0 }).state === 'OUT_OF_STOCK' &&
      availabilityOf({ ...inv, inventoryQty: null }).state === 'OUT_OF_STOCK');
    // D. Inventory-connected, 0, switch on
    ok('D rule: TRACKED at 0, switch on -> IN_STOCK',
      availabilityOf({ ...inv, inventoryQty: 0, allowOrderAtZero: true }).state === 'IN_STOCK');
    // E. stock above 0 — unchanged in both modes, whatever the switch says
    ok('E rule: stock above 0 is IN_STOCK in both modes, switch on or off',
      availabilityOf({ ...base, stockQty: 3 }).state === 'IN_STOCK' &&
      availabilityOf({ ...base, stockQty: 3, allowOrderAtZero: true }).state === 'IN_STOCK' &&
      availabilityOf({ ...inv, inventoryQty: 3 }).state === 'IN_STOCK' &&
      availabilityOf({ ...inv, inventoryQty: 3, allowOrderAtZero: true }).state === 'IN_STOCK');
    // F. Pre-order — exactly as before when the switch is off; the switch wins when on
    ok('F rule: PRE_ORDER at 0 with the switch off still answers PRE_ORDER, in both modes',
      availabilityOf({ ...base, stockQty: 0, soldOutMode: 'PRE_ORDER' }).state === 'PRE_ORDER' &&
      availabilityOf({ ...inv, inventoryQty: 0, soldOutMode: 'PRE_ORDER' }).state === 'PRE_ORDER');
    ok('F rule: the switch on means a plain sale, not a pre-order',
      availabilityOf({ ...base, stockQty: 0, soldOutMode: 'PRE_ORDER', allowOrderAtZero: true }).state === 'IN_STOCK');
    ok('vendor products stay ungated, as before',
      availabilityOf({ ...base, stockQty: 0, supplierId: 'x' }).state === 'IN_STOCK');

    /*  Now the same six through the real doors. Two fixtures: a hand-counted
        product and one connected to a stockroom Item whose count sits in
        InventoryStock. Both published, so the product page can be asked.  */
    const mk = (slug: string, data: Record<string, unknown>) =>
      prisma.product.create({
        data: {
          name: `${TAG} ${slug}`, slug: `${TAG.toLowerCase()}-${slug}`, isPublished: true,
          categoryId: category.id, productType: 'READYMADE', zone: 'NATIONWIDE', natureType: 'ARTIFICIAL',
          costPaisa: 100, sellingPricePaisa: 1000, ...data,
        } as never,
      });
    const doorOf = (productId: string) =>
      orders.create({
        customerId: customer.id, channelId: channel.id, zone: 'DHAKA', address: 'selftest',
        paymentMethod: 'cod', deliveryPaisa: 0, applyOffers: false, actorName: 'selftest',
        lines: [{ productId, qty: 1 }],
      } as never);
    const pageOf = async (slug: string) => (await detail.detail(`${TAG.toLowerCase()}-${slug}`)).availability.state;
    const flip = (id: string, allowOrderAtZero: boolean) =>
      prisma.product.update({ where: { id }, data: { allowOrderAtZero } });

    const hand = await mk('hand', { stockMode: 'MANUAL', stockQty: 0 });
    ok('A page: MANUAL at 0, switch off -> Out of stock', (await pageOf('hand')) === 'OUT_OF_STOCK');
    await refuses('A door: MANUAL at 0, switch off -> the order is refused', () => doorOf(hand.id), 'out of stock');
    await flip(hand.id, true);
    ok('B page: MANUAL at 0, switch on -> In stock', (await pageOf('hand')) === 'IN_STOCK');
    ok('B door: MANUAL at 0, switch on -> the order is taken', !!(await doorOf(hand.id))?.id);
    await prisma.product.update({ where: { id: hand.id }, data: { stockQty: 3 } });
    ok('E page: MANUAL above 0, switch on -> In stock', (await pageOf('hand')) === 'IN_STOCK');
    await flip(hand.id, false);
    ok('E page: MANUAL above 0, switch off -> In stock', (await pageOf('hand')) === 'IN_STOCK');
    ok('E door: MANUAL above 0, switch off -> the order is taken', !!(await doorOf(hand.id))?.id);
    await prisma.product.update({ where: { id: hand.id }, data: { stockQty: 0, soldOutMode: 'PRE_ORDER' } });
    ok('F page: MANUAL at 0, PRE_ORDER, switch off -> Pre-order, as before', (await pageOf('hand')) === 'PRE_ORDER');
    ok('F door: a pre-order is still taken, as before', !!(await doorOf(hand.id))?.id);

    const unit = await prisma.unit.findFirst({ where: { isActive: true, deletedAt: null } });
    const wh = await prisma.warehouse.findFirst({ where: { isActive: true, deletedAt: null } });
    if (!unit || !wh) throw new Error('need one active Unit and one active Warehouse for the Inventory-connected fixture');
    const item = await prisma.item.create({
      data: { sku: `${TAG}-STOCK`, name: `${TAG} stockroom item`, itemType: 'RAW', unitId: unit.id } as never,
    });
    const linked = await mk('linked', { stockMode: 'TRACKED', itemId: item.id, stockQty: 999 });
    ok('C page: TRACKED with no stock row yet, switch off -> Out of stock (the 999 in the box is ignored)',
      (await pageOf('linked')) === 'OUT_OF_STOCK');
    await refuses('C door: TRACKED at 0, switch off -> the order is refused', () => doorOf(linked.id), 'out of stock');
    const stockRow = await prisma.inventoryStock.create({ data: { itemId: item.id, warehouseId: wh.id, qtyMilli: 0 } });
    ok('C page: TRACKED with an empty stock row, switch off -> Out of stock', (await pageOf('linked')) === 'OUT_OF_STOCK');
    await flip(linked.id, true);
    ok('D page: TRACKED at 0, switch on -> In stock', (await pageOf('linked')) === 'IN_STOCK');
    ok('D door: TRACKED at 0, switch on -> the order is taken', !!(await doorOf(linked.id))?.id);
    await prisma.inventoryStock.update({ where: { id: stockRow.id }, data: { qtyMilli: 2000 } });
    ok('E page: TRACKED above 0, switch on -> In stock', (await pageOf('linked')) === 'IN_STOCK');
    await flip(linked.id, false);
    ok('E page: TRACKED above 0, switch off -> In stock', (await pageOf('linked')) === 'IN_STOCK');
    ok('E door: TRACKED above 0, switch off -> the order is taken', !!(await doorOf(linked.id))?.id);
    await prisma.inventoryStock.update({ where: { id: stockRow.id }, data: { qtyMilli: 900 } });
    ok('C page: TRACKED at 0.9 of a unit rounds down to 0 -> Out of stock', (await pageOf('linked')) === 'OUT_OF_STOCK');
    await prisma.inventoryStock.update({ where: { id: stockRow.id }, data: { qtyMilli: 0 } });
    await prisma.product.update({ where: { id: linked.id }, data: { soldOutMode: 'PRE_ORDER' } });
    ok('F page: TRACKED at 0, PRE_ORDER, switch off -> Pre-order', (await pageOf('linked')) === 'PRE_ORDER');
    ok('F door: a TRACKED pre-order is taken', !!(await doorOf(linked.id))?.id);

    /*  The switch is one flag on the product and covers its options too: at
        0 with it on, a colour whose shelf is empty is still sold.  */
    await prisma.productVariant.update({ where: { id: empty.id }, data: { stockQty: 0 } });
    await flip(shelf.id, true);
    ok('B door: the switch also opens an option whose own shelf is 0', !!(await door(empty.id))?.id);
    await flip(shelf.id, false);
    await refuses('A door: ...and closes it again when off', () => door(empty.id), 'out of stock');

    /* --------------------------------------------------------------- 8 */
    console.log('\n=== 8. R4 — one click, one step, even when two arrive together (4 Sep 2026) ===');

    /*  A double-click on "Start preparing" moved an order TWO stages on the
        go-live walk. The screen is guarded now; this is the server's half:
        two identical transitions at once → exactly one wins, the shelf moves
        once, the cash is booked once.  */
    await prisma.productVariant.update({ where: { id: stocked.id }, data: { stockQty: 5 } });
    const race = await prisma.order.findUniqueOrThrow({ where: { id: sold.id } });
    await orders.confirm(race.id, 'selftest');
    const prepTwice = await Promise.allSettled([
      orders.startPreparing(race.id, 'selftest'),
      orders.startPreparing(race.id, 'selftest'),
    ]);
    const prepWon = prepTwice.filter((r) => r.status === 'fulfilled').length;
    ok('R4 two "start preparing" at once → exactly one goes through', prepWon === 1, `${prepWon} succeeded`);
    const shelfAfter = await prisma.productVariant.findUniqueOrThrow({ where: { id: stocked.id } });
    ok('R4 …and the shelf moved exactly once', shelfAfter.stockQty === 4, `stock ${shelfAfter.stockQty}`);
    const prepLoser = prepTwice.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    ok('R4 …the loser is told the order already moved, not given a stock error',
      /already moved|cannot start preparing/i.test(String(prepLoser?.reason?.message ?? '')),
      String(prepLoser?.reason?.message ?? '').slice(0, 70));

    await orders.outForDelivery(race.id, 'selftest');
    const delTwice = await Promise.allSettled([
      orders.delivered(race.id, 'selftest'),
      orders.delivered(race.id, 'selftest'),
    ]);
    const delWon = delTwice.filter((r) => r.status === 'fulfilled').length;
    ok('R4 two "delivered" at once → exactly one goes through', delWon === 1, `${delWon} succeeded`);
    const codRows = await prisma.paymentTransaction.count({ where: { orderId: race.id, kind: 'COD_COLLECTED' } });
    ok('R4 …and the cash is booked exactly once', codRows === 1, `${codRows} COD_COLLECTED rows`);

    /* --------------------------------------------------------------- 9 */
    console.log('\n=== 9. R5 — the order cannot outrun its own delivery record (4 Sep 2026) ===');

    /*  Go-live walk: order sent out from the order screen, rider assigned
        AFTER, order marked delivered from the order screen → assignment
        stayed ASSIGNED for ever, books said "cash with rider", settle board
        (DELIVERED rows only) never listed the parcel.  */
    const rider = await prisma.rider.findFirst({ where: { isActive: true, deletedAt: null } });
    if (!rider) throw new Error('need one active Rider to run the R5 fixture');

    // (a) a rider handed a parcel that is already on the road is on the road
    const late = await door(stocked.id);
    await orders.confirm(late.id, 'selftest');
    await orders.startPreparing(late.id, 'selftest');
    await orders.outForDelivery(late.id, 'selftest');
    const lateAsg = await delivery.assign({ orderId: late.id, kind: 'RIDER', riderId: rider.id, actorName: 'selftest' });
    ok('R5 assigning a rider to a parcel already out creates the record OUT_FOR_DELIVERY, not ASSIGNED',
      lateAsg.status === 'OUT_FOR_DELIVERY' && !!lateAsg.outAt, lateAsg.status);
    await refuses('R5 the order screen may not mark it delivered past the rider\'s record',
      () => orders.delivered(late.id, 'selftest'), 'Delivery panel');
    const viaDelivery = await delivery.assignmentAction(lateAsg.id, 'delivered', { actorName: 'selftest' });
    const lateOrder = await prisma.order.findUniqueOrThrow({ where: { id: late.id } });
    ok('R5 …delivered through Delivery moves BOTH: assignment DELIVERED, order completed',
      viaDelivery.status === 'DELIVERED' && lateOrder.deliveryStatus === 'delivered' && lateOrder.salesStatus === 'completed');
    const onBoard = await delivery.unsettled(rider.id);
    ok('R5 …and the parcel is on the settle board with its COD to hand over',
      onBoard.some((r: { orderId?: string; order?: { id: string } }) => (r.orderId ?? r.order?.id) === late.id));

    // (b) assigned before going out — the order screen may not send it out around Delivery
    const early = await door(stocked.id);
    await orders.confirm(early.id, 'selftest');
    await orders.startPreparing(early.id, 'selftest');
    const earlyAsg = await delivery.assign({ orderId: early.id, kind: 'RIDER', riderId: rider.id, actorName: 'selftest' });
    ok('R5 assigned while preparing is ASSIGNED, as before', earlyAsg.status === 'ASSIGNED');
    await refuses('R5 the order screen may not send it out around the rider\'s record',
      () => orders.outForDelivery(early.id, 'selftest'), 'Delivery panel');
    const wentOut = await delivery.assignmentAction(earlyAsg.id, 'out', { actorName: 'selftest' });
    const earlyOrder = await prisma.order.findUniqueOrThrow({ where: { id: early.id } });
    ok('R5 …out through Delivery moves both', wentOut.status === 'OUT_FOR_DELIVERY' && earlyOrder.deliveryStatus === 'out_for_delivery');
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
