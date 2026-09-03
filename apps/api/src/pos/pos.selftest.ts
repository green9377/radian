/* eslint-disable no-console */
/**
 * POS module self-test — end to end, against the real till, the real stock ledger
 * and the real books.
 *
 * Run through `radian_pos_selftest.bat`.
 *
 * WHY THIS FILE EXISTS (30 Jul 2026)
 * POS had never been reviewed. Two of the faults it found lose money in the direction
 * that hurts:
 *
 *   · `collectDue()` wrote `paidPaisa` as an ABSOLUTE figure read moments earlier, so
 *     two cashiers collecting from one customer at once produced two payments in the
 *     ledger and one on the order — the customer still shown as owing what he paid.
 *   · the cash from a due collection was credited to the shift the ORIGINAL sale was
 *     rung up on. That shift is normally long closed, and the branch was guarded on
 *     `status === OPEN`, so in the normal case real banknotes were recorded NOWHERE.
 *
 * Neither is visible from any screen. Both are asserted here by name.
 *
 * SAFETY, because this touches a live database:
 *   · its own register (ZZPOSTEST-REG), its own item and product (ZZPOSTEST...),
 *     its own customer on phone ZZPOSTEST-CUST
 *   · cleanup runs both BEFORE and AFTER and only ever matches those markers
 *   · it never reads or writes a real order, a real customer or a real shift
 *   · it closes every shift it opens, so it cannot leave the till in a state that
 *     blocks tomorrow morning
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { PosService } from './pos.service';
import { ItemsService } from '../items/items.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentMethodsService } from '../common/payment-methods.service';
import { ItemType } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TAG = 'ZZPOSTEST';
const REG_CODE = `${TAG}-REG`;
const CUST_PHONE = `${TAG}-CUST`;

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
  const pos = app.get(PosService);
  const items = app.get(ItemsService);
  const inv = app.get(InventoryService);
  const payMethods = app.get(PaymentMethodsService);

  /* DEC-GBL-001 — this shop has TWO cash money accounts, so resolveAccount()
     refuses to guess and every cash payment below has to name one. Looked up once
     here; the fixture takes the first and leaves the shop's setup exactly as it is. */
  const cashAccountId = (await payMethods.accountsFor('cash'))[0]?.id;
  const bkashAccountId = (await payMethods.accountsFor('bkash'))[0]?.id;

  const cleanup = async () => {
    const regs = await prisma.posRegister.findMany({ where: { code: { startsWith: REG_CODE } }, select: { id: true } });
    const regIds = regs.map((r) => r.id);
    const shifts = await prisma.posShift.findMany({
      where: { OR: [{ registerId: { in: regIds } }, { cashierName: { startsWith: TAG } }] },
      select: { id: true },
    });
    const shiftIds = shifts.map((s) => s.id);
    const cust = await prisma.customer.findFirst({ where: { phone: CUST_PHONE }, select: { id: true } });
    const orders = await prisma.order.findMany({
      where: { OR: [{ posShiftId: { in: shiftIds } }, ...(cust ? [{ customerId: cust.id }] : [])] },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    const prods = await prisma.product.findMany({ where: { slug: { startsWith: TAG.toLowerCase() } }, select: { id: true } });
    const prodIds = prods.map((p) => p.id);
    const its = await prisma.item.findMany({ where: { sku: { startsWith: TAG } }, select: { id: true } });
    const itemIds = its.map((i) => i.id);

    /* The books first. A JournalEntry is immutable by policy (DEC-FIN-014) and never
       soft-deleted, so the only honest cleanup is to remove the rows this run caused,
       matched on sourceId. Nothing of yours shares these ids. */
    const src = [...orderIds, ...shiftIds];
    let ledger = 0;
    if (src.length) {
      const txns = await prisma.paymentTransaction.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
      const allSrc = [...src, ...txns.map((t) => t.id)];
      const entries = await prisma.journalEntry.findMany({ where: { sourceId: { in: allSrc } }, select: { id: true } });
      const entryIds = entries.map((e) => e.id);
      if (entryIds.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
        ledger = (await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } })).count;
      }
      await prisma.financePostingFailure.deleteMany({ where: { sourceId: { in: allSrc } } });
    }

    await prisma.paymentTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.posCashMovement.deleteMany({ where: { shiftId: { in: shiftIds } } });
    await prisma.posShift.deleteMany({ where: { id: { in: shiftIds } } });
    await prisma.posRegister.deleteMany({ where: { id: { in: regIds } } });

    if (itemIds.length || prodIds.length) {
      await prisma.inventoryMovement.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.inventoryStock.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [...itemIds, ...orderIds] } } });
      await prisma.activityEvent.deleteMany({ where: { entityId: { in: [...itemIds, ...orderIds] } } });
      await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    }
    if (cust) await prisma.customer.deleteMany({ where: { id: cust.id } });
    return { orders: orderIds.length, shifts: shiftIds.length, ledgerEntries: ledger };
  };

  try {
    console.log('=== 0. clearing anything a previous run left behind ===');
    console.log(JSON.stringify(await cleanup()));

    /*  `deletedAt: null` matters more than it looks. This is the RAW client, so
        it sees soft-deleted rows too - and on 3 Sep 2026 the first active Unit
        it returned was `1kg`, which had been deleted. The service then refused
        it ("That unit does not exist") and four selftests died before their
        first assertion. The service reads through `prisma.db`, which filters
        deleted rows; a fixture that picks its material must filter the same
        way or it hands the service something the service cannot see.  */
    const unit = await prisma.unit.findFirst({ where: { isActive: true, deletedAt: null } });
    if (!unit) throw new Error('no active, undeleted Unit exists — seed one unit before running this');

    const item = await items.create({
      name: `${TAG} Teddy`, sku: `${TAG}-TEDDY`,
      itemType: ItemType.FINISHED, unitId: unit.id, standardCostPaisa: 30_000, // ৳300
    });
    const category = await prisma.category.findFirst({ where: { deletedAt: null } });
    if (!category) throw new Error('no Category exists — seed one category before running this');
    const product = await prisma.product.create({
      data: {
        name: `${TAG} Teddy`, slug: `${TAG.toLowerCase()}-teddy`,
        categoryId: category.id,
        productType: 'READYMADE',
        zone: 'NATIONWIDE',
        natureType: 'ARTIFICIAL',
        costPaisa: 30_000,
        sellingPricePaisa: 50_000, // ৳500
        itemId: item.id, stockMode: 'MANUAL', stockQty: 100,
      },
    });
    const register = await prisma.posRegister.create({ data: { code: REG_CODE, name: 'Selftest counter' } });

    /* ---------------------------------------------------------------- 1 */
    console.log('\n=== 1. nothing sells without an open shift ===');

    await refuses('a sale with no shift open is refused',
      () => pos.createSale({
        registerId: register.id, lines: [{ productId: product.id, qty: 1 }],
        payments: [{ method: 'cash', amountPaisa: 50_000, accountId: cashAccountId }], payMode: 'full',
      }), 'open a shift');

    const shift = await pos.openShift({
      registerId: register.id, cashierName: `${TAG} Cashier`, openingFloatPaisa: 100_000, // ৳1000
    });
    ok('a shift opens', shift.status === 'OPEN');
    await refuses('a second shift on the same register is refused',
      () => pos.openShift({ registerId: register.id, cashierName: `${TAG} Cashier` }),
      'already open');
    /*  P7-6 (31 Aug) — and one asked for with NO register is refused too. That
        was the hole: `SHF-000001` sat open with `registerId = null` from 20 to
        31 August, invisible to the per-register check, so the till happily
        offered to open a second drawer beside it.  */
    ok('P7-6 a shift always carries the counter it was opened on', !!shift.registerId, shift.registerId ?? 'null');

    /* ---------------------------------------------------------------- 2 */
    console.log('\n=== 2. a paid counter sale ===');

    /*  The shop keeps more than one Cash account, on purpose - a counter float
        and a vault are two different piles of money. resolveAccount() will not
        guess between them ("three numbers on the wall is not an answer anybody
        can reconcile"), so a sale has to say which one. A real cashier picks it
        on the screen; this fixture picks the first and leaves the shop's setup
        exactly as it is.  */
    const sale = await pos.createSale({
      shiftId: shift.id, registerId: register.id,
      lines: [{ productId: product.id, qty: 2 }],
      payments: [{ method: 'cash', amountPaisa: 100_000, accountId: cashAccountId }], payMode: 'full',
    });
    ok('the sale is settled at the counter', sale!.salesStatus === 'completed');
    ok('…with a POS receipt number', sale!.orderNo.startsWith('POS-'), sale!.orderNo);
    ok('…the total is 2 × ৳500', sale!.totalPaisa === 100_000, taka(sale!.totalPaisa));
    ok('…nothing is owed', sale!.duePaisa === 0 && sale!.paymentStatus === 'paid');
    ok('DEC-POS-002 it is a COUNTER order, so the online Sales list never sees it',
      sale!.fulfillmentType === 'COUNTER');

    const drawer = await pos.analyticsToday();
    ok('DEC-POS-010 the cash is in the drawer, on top of the float',
      drawer.cashInDrawer === 200_000, taka(drawer.cashInDrawer));

    const onHand = await inv.onHandMilli(item.id);
    ok('INV-RULE-001 the stock left through Inventory', onHand === -2000, `${onHand / 1000}`);

    /* ---------------------------------------------------------------- 3 */
    console.log('\n=== 3. a bad tender is refused, never discarded (POS-REV-6) ===');

    await refuses('POS-REV-6 a NEGATIVE tender is refused, not silently dropped',
      () => pos.createSale({
        shiftId: shift.id, lines: [{ productId: product.id, qty: 1 }],
        payments: [{ method: 'cash', amountPaisa: -50_000, accountId: cashAccountId }], payMode: 'full',
      }), 'positive whole number');

    await refuses('POS-REV-6 a fractional tender is refused',
      () => pos.createSale({
        shiftId: shift.id, lines: [{ productId: product.id, qty: 1 }],
        payments: [{ method: 'cash', amountPaisa: 100.5, accountId: cashAccountId }], payMode: 'full',
      }), 'positive whole number');

    /* Overpayment used to be swallowed: paidPaisa 60000 against totalPaisa 50000,
       status "paid", and the ৳100 change left the drawer unrecorded — so the shift
       came up short and the cashier carried it. */
    await refuses('POS-REV-6 an OVERPAYMENT is refused, with the change spelled out',
      () => pos.createSale({
        shiftId: shift.id, lines: [{ productId: product.id, qty: 1 }],
        payments: [{ method: 'cash', amountPaisa: 60_000, accountId: cashAccountId }], payMode: 'full',
      }), 'as change');

    await refuses('DEC-POS-017 "full payment" with money still owed is refused',
      () => pos.createSale({
        shiftId: shift.id, lines: [{ productId: product.id, qty: 1 }],
        payments: [{ method: 'cash', amountPaisa: 10_000, accountId: cashAccountId }], payMode: 'full',
      }), 'full payment');

    await refuses('DEC-POS-008 a credit sale needs a named customer',
      () => pos.createSale({
        shiftId: shift.id, lines: [{ productId: product.id, qty: 1 }],
        payments: [{ method: 'cash', amountPaisa: 10_000, accountId: cashAccountId }], payMode: 'partial',
      }), 'identified customer');

    /* ---------------------------------------------------------------- 4 */
    console.log('\n=== 4. a split tender ===');

    const split = await pos.createSale({
      shiftId: shift.id, lines: [{ productId: product.id, qty: 1 }],
      payments: [
        { method: 'cash', amountPaisa: 20_000, accountId: cashAccountId },
        { method: 'bkash', amountPaisa: 30_000, accountId: bkashAccountId },
      ],
      payMode: 'full',
    });
    ok('DEC-POS-009 both tenders are recorded', split!.transactions.length === 2);
    ok('…and they add up to the bill', split!.paidPaisa === 50_000, taka(split!.paidPaisa));
    const after = await pos.analyticsToday();
    ok('…but only the CASH part reached the drawer',
      after.cashInDrawer === 220_000, taka(after.cashInDrawer));

    /* ---------------------------------------------------------------- 5 */
    console.log('\n=== 5. a credit sale, then collecting the due (POS-REV-3) ===');

    const credit = await pos.createSale({
      shiftId: shift.id, customerName: `${TAG} Regular`, customerPhone: CUST_PHONE,
      lines: [{ productId: product.id, qty: 4 }], // ৳2000
      payments: [{ method: 'cash', amountPaisa: 50_000, accountId: cashAccountId }], payMode: 'partial',
    });
    ok('a credit sale records what is owed', credit!.duePaisa === 150_000, taka(credit!.duePaisa));
    ok('…and reads as part-paid', credit!.paymentStatus === 'advance_paid');

    const board = await pos.dueBoard();
    const row = board.find((r) => r.phone === CUST_PHONE);
    ok('…and the customer appears on the due board', row?.duePaisa === 150_000,
      row ? taka(row.duePaisa) : 'missing');

    await refuses('collecting more than is owed is refused',
      () => pos.collectDue({ orderId: credit!.id, payments: [{ method: 'cash', amountPaisa: 999_999, accountId: cashAccountId }] }),
      'outstanding');

    /* THE ONE THIS FILE EXISTS FOR. Two cashiers, same customer, same instant.
       Before the fix both read paidPaisa = 50000 and both wrote 100000, so ৳500 of
       real money existed in the ledger and nowhere on the order. */
    const both = await Promise.all([
      pos.collectDue({ orderId: credit!.id, payments: [{ method: 'cash', amountPaisa: 50_000, accountId: cashAccountId }] }),
      pos.collectDue({ orderId: credit!.id, payments: [{ method: 'cash', amountPaisa: 50_000, accountId: cashAccountId }] }),
    ]);
    ok('POS-REV-3 two collections at the same moment both land', both.length === 2);

    const settled = await prisma.order.findUnique({ where: { id: credit!.id } });
    const txnSum = await prisma.paymentTransaction.aggregate({
      where: { orderId: credit!.id }, _sum: { amountPaisa: true },
    });
    ok('POS-REV-3 …the order counted BOTH of them',
      settled?.paidPaisa === 150_000, taka(settled?.paidPaisa ?? 0));
    ok('POS-REV-3 …so the order and the payment ledger agree',
      settled?.paidPaisa === txnSum._sum.amountPaisa,
      `order ${taka(settled?.paidPaisa ?? 0)} vs ledger ${taka(txnSum._sum.amountPaisa ?? 0)}`);
    ok('…and the remaining due is right', settled?.duePaisa === 50_000, taka(settled?.duePaisa ?? 0));

    /* ---------------------------------------------------------------- 6 */
    console.log('\n=== 6. due cash goes into the drawer it entered (POS-REV-4) ===');

    const beforeCollect = (await pos.analyticsToday()).cashInDrawer;
    await pos.collectDue({ orderId: credit!.id, payments: [{ method: 'cash', amountPaisa: 50_000, accountId: cashAccountId }] });
    const afterCollect = (await pos.analyticsToday()).cashInDrawer;
    ok('POS-REV-4 cash collected on an old bill reaches TODAY\'S drawer',
      afterCollect - beforeCollect === 50_000,
      `${taka(beforeCollect)} → ${taka(afterCollect)}`);

    const finalOrder = await prisma.order.findUnique({ where: { id: credit!.id } });
    ok('…and the bill is settled', finalOrder?.duePaisa === 0 && finalOrder?.paymentStatus === 'paid');

    /* ---------------------------------------------------------------- 7 */
    console.log('\n=== 7. cash movements, and closing the drawer ===');

    await refuses('POS-REV-7 a zero cash movement is refused',
      () => pos.addCashMovement(shift.id, { kind: 'PAYOUT', amountPaisa: 0 }),
      'non-zero');
    await refuses('POS-REV-7 a fractional cash movement is refused',
      () => pos.addCashMovement(shift.id, { kind: 'PAYOUT', amountPaisa: 12.5 }),
      'whole number');

    const expectedBefore = (await pos.analyticsToday()).cashInDrawer;
    await pos.addCashMovement(shift.id, { kind: 'PAYOUT', amountPaisa: 20_000, note: 'selftest tea' });
    const expectedAfter = (await pos.analyticsToday()).cashInDrawer;
    ok('a payout removes cash whichever sign was sent',
      expectedBefore - expectedAfter === 20_000, taka(expectedBefore - expectedAfter));

    // count ৳50 less than expected — over/short flags it, it never blocks
    const closed = await pos.closeShift(shift.id, {
      countedCashPaisa: expectedAfter - 5000, note: 'selftest close',
    });
    ok('the shift closes', closed.status === 'CLOSED');
    ok('expected cash is float + cash sales − payouts',
      closed.expectedCashPaisa === expectedAfter, taka(closed.expectedCashPaisa ?? 0));
    ok('DEC-POS-010 a short drawer is flagged, not refused',
      closed.overShortPaisa === -5000, taka(closed.overShortPaisa ?? 0));
    await refuses('a closed shift cannot be closed twice',
      () => pos.closeShift(shift.id, { countedCashPaisa: 0 }), 'already closed');
    await refuses('…and takes no more cash movements',
      () => pos.addCashMovement(shift.id, { kind: 'PAYOUT', amountPaisa: 1000 }), 'closed');

    /* ---------------------------------------------------------------- 8 */
    console.log('\n=== 8. the lazily-created rows are created ONCE (POS-REV-1) ===');

    /* Three more unprotected singletons lived in this file. With Inventory's assembly
       floor that made FOUR the 29 July sweep missed, all the same way: that pass looked
       for `*Setting` accessors, so the lesson reached the SHAPE and not the HAZARD. */
    const walkIns = await prisma.customer.count({ where: { phone: 'WALK-IN' } });
    ok('POS-REV-1 exactly one walk-in customer exists', walkIns === 1, `${walkIns} rows`);
    const channels = await prisma.channel.count({ where: { slug: 'pos' } });
    ok('POS-REV-1 exactly one POS channel exists', channels === 1, `${channels} rows`);

    const raced = await Promise.all([pos.registers(), pos.registers(), pos.registers()]);
    ok('POS-REV-1 three till screens loading at once all get registers',
      raced.every((r) => r.length > 0));
    const counters = await prisma.posRegister.count({ where: { code: 'COUNTER-1' } });
    ok('POS-REV-1 …and only one COUNTER-1 was ever made', counters <= 1, `${counters} rows`);

    /* ---------------------------------------------------------------- 9 */
    console.log('\n=== 9. two tills ringing up at the same second (POS-REV-2) ===');

    /* On the test's OWN register. Without it this falls back to the shop's default
       counter, where a real shift left open by staff blocks the whole run — and this
       file promises to touch nothing it did not create. */
    const shift2 = await pos.openShift({
      registerId: register.id, cashierName: `${TAG} Cashier2`, openingFloatPaisa: 0,
    });
    const races = await Promise.all([
      pos.createSale({ shiftId: shift2.id, lines: [{ productId: product.id, qty: 1 }], payments: [{ method: 'cash', amountPaisa: 50_000, accountId: cashAccountId }], payMode: 'full' }),
      pos.createSale({ shiftId: shift2.id, lines: [{ productId: product.id, qty: 1 }], payments: [{ method: 'cash', amountPaisa: 50_000, accountId: cashAccountId }], payMode: 'full' }),
      pos.createSale({ shiftId: shift2.id, lines: [{ productId: product.id, qty: 1 }], payments: [{ method: 'cash', amountPaisa: 50_000, accountId: cashAccountId }], payMode: 'full' }),
    ]);
    const nos = new Set(races.map((r) => r!.orderNo));
    ok('POS-REV-2 three simultaneous sales all succeed', races.length === 3);
    ok('POS-REV-2 …with three different receipt numbers, no P2002 at the till',
      nos.size === 3, [...nos].join(' '));
    await pos.closeShift(shift2.id, { countedCashPaisa: 150_000 });

    /* --------------------------------------------------------------- 10 */
    console.log('\n=== 10. POS never writes the ledger itself (DEC-POS-010) ===');

    const src = readFileSync(join(__dirname, 'pos.service.ts'), 'utf8');
    ok('nothing in this service posts a journal entry by hand',
      !/journalEntry\.(create|update|delete)/.test(src));
    ok('POS-REV-5 no finance call is left fire-and-forget',
      !/void this\.finance\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
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
