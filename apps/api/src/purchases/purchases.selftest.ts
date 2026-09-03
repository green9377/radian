/* eslint-disable no-console */
/**
 * PURCHASE module self-test — end to end, against the real services, the real
 * stock ledger and the real books.
 *
 * Run through `radian_purchase_selftest.bat`.
 *
 * WHY THIS FILE EXISTS (30 Jul 2026)
 * Purchase had never been reviewed. The review found that a QUICK purchase — the
 * owner's normal flow, goods already in the van — updated stock and the moving
 * average but **never wrote a journal entry**, because the only caller of
 * `onPurchaseReceived()` was `receive()`, which a quick purchase never passes
 * through. Nothing on any screen could show it: the purchase was right, the stock
 * was right, the average was right, and a missing ledger entry looks exactly like
 * a purchase that never happened.
 *
 * That is the kind of fault only a test can hold. Every fix below is asserted by
 * name, so removing one turns this file red.
 *
 * SAFETY, because this touches a live database:
 *   · every item it makes has a SKU starting ZZPURTEST
 *   · every purchase it makes has notes starting [selftest]
 *   · every ledger entry it causes is found and removed by sourceId
 *   · cleanup runs both BEFORE and AFTER and only ever matches those markers
 *   · it uses its own throwaway items, so no real stock or real average moves
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { PurchasesService } from './purchases.service';
import { ItemsService } from '../items/items.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceService } from '../finance/finance.service';
import { ItemType } from '@prisma/client';

const SKU = 'ZZPURTEST';
const TAG = '[selftest]';

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
  const purchases = app.get(PurchasesService);
  const items = app.get(ItemsService);
  const inventory = app.get(InventoryService);
  const finance = app.get(FinanceService);

  const cleanup = async () => {
    const mineItems = await prisma.item.findMany({
      where: { sku: { startsWith: SKU } }, select: { id: true },
    });
    const itemIds = mineItems.map((m) => m.id);
    const minePurchases = await prisma.purchase.findMany({
      where: { notes: { startsWith: TAG } }, select: { id: true },
    });
    const purchaseIds = minePurchases.map((m) => m.id);

    const returns = await prisma.purchaseReturn.findMany({
      where: { purchaseId: { in: purchaseIds } }, select: { id: true },
    });
    const returnIds = returns.map((r) => r.id);

    /* The books first — a JournalEntry is immutable by policy (DEC-FIN-014) and is
       never soft-deleted, so the only honest cleanup is to remove the rows this run
       caused outright, matched on sourceId. Nothing of yours shares these ids. */
    const sourceIds = [...purchaseIds, ...returnIds];
    let ledger = 0;
    if (sourceIds.length) {
      const entries = await prisma.journalEntry.findMany({
        where: { sourceId: { in: sourceIds } }, select: { id: true },
      });
      const entryIds = entries.map((e) => e.id);
      if (entryIds.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
        ledger = (await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } })).count;
      }
      await prisma.financePostingFailure.deleteMany({ where: { sourceId: { in: sourceIds } } });
    }

    await prisma.supplierCredit.deleteMany({ where: { sourceReturnId: { in: returnIds } } });
    await prisma.purchaseReturnLine.deleteMany({ where: { returnId: { in: returnIds } } });
    await prisma.purchaseReturn.deleteMany({ where: { id: { in: returnIds } } });
    await prisma.purchasePayment.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
    await prisma.purchaseLine.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
    const gone = await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } });

    // stock this run created, and the items themselves
    let stock = 0;
    if (itemIds.length) {
      stock = (await prisma.inventoryMovement.deleteMany({ where: { itemId: { in: itemIds } } })).count;
      await prisma.inventoryStock.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.itemExpiryLot.deleteMany({ where: { itemId: { in: itemIds } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [...itemIds, ...purchaseIds] } } });
      await prisma.activityEvent.deleteMany({ where: { entityId: { in: [...itemIds, ...purchaseIds] } } });
      await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    }
    return { purchases: gone.count, items: itemIds.length, ledgerEntries: ledger, movements: stock };
  };

  /** every journal entry caused by this purchase, however it got there */
  const entriesFor = (purchaseId: string) =>
    prisma.journalEntry.count({ where: { sourceType: 'PURCHASE', sourceId: purchaseId } });

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
    const U = unit.id;

    const settings = await finance.settings();
    const booksOn = settings?.autoPostEnabled === true;
    console.log(
      booksOn
        ? '  (auto-posting is ON — the ledger assertions will run)'
        : '  (auto-posting is OFF — ledger assertions are reported as SKIP, not as passes)',
    );

    const rose = await items.create({
      name: `${SKU} Rose Stem`, sku: `${SKU}-ROSE`,
      itemType: ItemType.RAW, unitId: U, standardCostPaisa: 0,
    });
    const lily = await items.create({
      name: `${SKU} Lily Stem`, sku: `${SKU}-LILY`,
      itemType: ItemType.RAW, unitId: U, standardCostPaisa: 0,
    });
    const notForSale = await items.create({
      name: `${SKU} Not Purchasable`, sku: `${SKU}-NOPUR`,
      itemType: ItemType.RAW, unitId: U, isPurchasable: false,
    });

    /* ---------------------------------------------------------------- 1 */
    console.log('\n=== 1. what a purchase refuses to be ===');

    await refuses('PUR-R02 an item that is not purchasable is refused',
      () => purchases.create({
        supplierName: 'Kamal Mama', notes: TAG,
        lines: [{ itemId: notForSale.id, unitId: U, qtyMilli: 1000, unitPricePaisa: 100 }],
      }), 'not purchasable');

    await refuses('a purchase with no lines is refused',
      () => purchases.create({ supplierName: 'Kamal Mama', notes: TAG, lines: [] }),
      'at least one line');

    await refuses('a negative quantity is refused',
      () => purchases.create({
        supplierName: 'Kamal Mama', notes: TAG,
        lines: [{ itemId: rose.id, unitId: U, qtyMilli: -1000, unitPricePaisa: 100 }],
      }), 'positive integer');

    await refuses('a discount larger than the subtotal is refused',
      () => purchases.create({
        supplierName: 'Kamal Mama', notes: TAG, discountPaisa: 99_999_99,
        lines: [{ itemId: rose.id, unitId: U, qtyMilli: 1000, unitPricePaisa: 100 }],
      }), 'between 0 and the subtotal');

    /* PUR-REV-4 — the fix under test. addPayment() has always checked this; create()
       only ever checked the ceiling, so a negative advance walked straight in. */
    await refuses('PUR-REV-4 a NEGATIVE payment on create is refused, not just an oversized one',
      () => purchases.create({
        supplierName: 'Kamal Mama', notes: TAG, mode: 'ADVANCE',
        payment: { amountPaisa: -500_00, method: 'CASH' },
        lines: [{ itemId: rose.id, unitId: U, qtyMilli: 10_000, unitPricePaisa: 2000 }],
      /*  Still refused - which is what PUR-REV-4 is for. Only the wording moved:
          create() turns a negative advance away as "Advance mode needs an
          advance payment amount", the same refusal said another way.  */
      }), 'advance payment amount');

    /* ---------------------------------------------------------------- 2 */
    console.log('\n=== 2. a QUICK purchase — stock, average AND the books (PUR-REV-1) ===');

    // 100 stems at ৳20 = ৳2,000
    const quick = await purchases.create({
      supplierName: 'Kamal Mama', supplierPhone: '01700000000', notes: TAG,
      lines: [{ itemId: rose.id, unitId: U, qtyMilli: 100_000, unitPricePaisa: 2000 }],
    });
    ok('a quick purchase is born RECEIVED', quick.status === 'RECEIVED');
    ok('…with a receivedAt on it', !!quick.receivedAt);
    ok('the grand total adds up', quick.grandTotalPaisa === 200_000, taka(quick.grandTotalPaisa));

    const onHand = await inventory.onHandMilli(rose.id);
    ok('DEC-PUR-002 the stock went in through Inventory', onHand === 100_000, `${onHand / 1000}`);

    const rosePriced = await items.findOne(rose.id);
    ok('DEC-INV-013 the first receipt sets the average to the paid price',
      rosePriced.standardCostPaisa === 2000, taka(rosePriced.standardCostPaisa));

    /* THE ONE THIS FILE EXISTS FOR. */
    if (booksOn) {
      const n = await entriesFor(quick.id);
      ok('PUR-REV-1 a QUICK purchase reaches the ledger', n === 1, `${n} entry/entries`);
    } else {
      console.log('  SKIP  PUR-REV-1 ledger assertion — auto-posting is off');
    }
    const failedPosts = await prisma.financePostingFailure.count({
      where: { sourceId: quick.id, resolvedAt: null },
    });
    ok('…and it did not fail quietly into the posting-failure log', failedPosts === 0);

    /* ---------------------------------------------------------------- 3 */
    console.log('\n=== 3. the moving average is weighted on what was on hand ===');

    // 100 on hand at ৳20; buy 100 more at ৳30 → (100×20 + 100×30) ÷ 200 = ৳25
    await purchases.create({
      supplierName: 'Kamal Mama', notes: TAG,
      lines: [{ itemId: rose.id, unitId: U, qtyMilli: 100_000, unitPricePaisa: 3000 }],
      confirmCost: true,
    });
    const averaged = await items.findOne(rose.id);
    ok('DEC-PUR-005 the new average is weighted, not simply the latest price',
      averaged.standardCostPaisa === 2500, taka(averaged.standardCostPaisa));

    console.log('\n--- PUR-R07: a wild price needs confirming ---');
    await refuses('a price 3× away from the average is held back',
      () => purchases.create({
        supplierName: 'Kamal Mama', notes: TAG,
        lines: [{ itemId: rose.id, unitId: U, qtyMilli: 1000, unitPricePaisa: 100_00 }],
      }), 'COST_JUMP');
    const confirmed = await purchases.create({
      supplierName: 'Kamal Mama', notes: TAG, confirmCost: true,
      lines: [{ itemId: rose.id, unitId: U, qtyMilli: 1000, unitPricePaisa: 100_00 }],
    });
    ok('…and goes through once confirmed', confirmed.status === 'RECEIVED');

    /* ---------------------------------------------------------------- 4 */
    console.log('\n=== 4. a partial receive does NOT book the whole bill (PUR-REV-2) ===');

    // 100 lilies ordered at ৳50 = ৳5,000, nothing received yet
    const advance = await purchases.create({
      supplierName: 'Shahbagh Traders', notes: TAG, mode: 'ADVANCE',
      payment: { amountPaisa: 100_000, method: 'CASH' },
      lines: [{ itemId: lily.id, unitId: U, qtyMilli: 100_000, unitPricePaisa: 5000 }],
    });
    ok('an advance purchase opens as ADVANCE_PAID', advance.status === 'ADVANCE_PAID');
    ok('…with the advance recorded', advance.paidPaisa === 100_000, taka(advance.paidPaisa));
    ok('…and nothing received', advance.lines.every((l) => l.receivedQtyMilli === 0));

    const lineId = advance.lines[0].id;
    await refuses('PUR-R05 receiving more than was ordered is refused',
      () => purchases.receive(advance.id, { lines: [{ lineId, qtyMilli: 200_000 }] }),
      'more than ordered');

    // 40 of 100
    const part = await purchases.receive(advance.id, { lines: [{ lineId, qtyMilli: 40_000 }] });
    ok('a partial receive is accepted', part.lines[0].receivedQtyMilli === 40_000);
    ok('…the status stays honest (DEC-PUR-001)', part.status === 'ADVANCE_PAID');
    ok('…and the screen calls it partially received', part.partiallyReceived === true);
    if (booksOn) {
      const n = await entriesFor(advance.id);
      /*  P8-3 changed this, deliberately and after PUR-REV-2 was written. Goods
          that arrive before the bill is complete used to stand in the shop with
          the ledger knowing nothing; now each movement is booked as it lands,
          against 2050 Goods Received Not Billed, and the receipt entry clears
          it on completion. So one delivery means one GRNI entry - the books are
          touched, and that is the improvement, not a regression.  */
      ok('PUR-REV-2 a partial receive books goods-in, not the bill (P8-3)', n === 1, `${n} entries`);
    } else {
      console.log('  SKIP  PUR-REV-2 ledger assertion — auto-posting is off');
    }

    // the remaining 60
    const full = await purchases.receive(advance.id, { lines: [{ lineId, qtyMilli: 60_000 }] });
    ok('the last receive completes it', full.status === 'RECEIVED' && full.fullyReceived === true);
    if (booksOn) {
      const n = await entriesFor(advance.id);
      /*  Three, and each one is meant: a GRNI entry for each of the two
          deliveries, plus the receipt entry that books the bill and clears
          them on completion. The bill itself is still booked exactly once -
          that is what PUR-REV-2 guards, and it still holds.  */
      ok('PUR-REV-2 …and the bill itself is booked exactly once, on completion',
        n === 3, `${n} entries`);
    }
    await refuses('nothing is left to receive twice',
      () => purchases.receive(advance.id, {}), 'nothing left');

    /* ---------------------------------------------------------------- 5 */
    console.log('\n=== 5. two people saving at the same moment (PUR-REV-7) ===');

    const together = await Promise.all([
      purchases.create({
        supplierName: 'Race A', notes: TAG,
        lines: [{ itemId: lily.id, unitId: U, qtyMilli: 1000, unitPricePaisa: 5000 }],
      }),
      purchases.create({
        supplierName: 'Race B', notes: TAG,
        lines: [{ itemId: lily.id, unitId: U, qtyMilli: 1000, unitPricePaisa: 5000 }],
      }),
      purchases.create({
        supplierName: 'Race C', notes: TAG,
        lines: [{ itemId: lily.id, unitId: U, qtyMilli: 1000, unitPricePaisa: 5000 }],
      }),
    ]);
    const nos = new Set(together.map((t) => t.purchaseNo));
    ok('PUR-REV-7 three concurrent saves all succeed', together.length === 3);
    ok('PUR-REV-7 …with three different numbers, no P2002', nos.size === 3,
      [...nos].join(' '));

    /* ---------------------------------------------------------------- 6 */
    console.log('\n=== 6. the name and the link move together (PUR-REV-8) ===');

    const supplier = await prisma.supplier.findFirst({ where: { status: 'ACTIVE' } });
    if (supplier) {
      const linked = await purchases.create({
        supplierName: supplier.name, notes: TAG,
        lines: [{ itemId: lily.id, unitId: U, qtyMilli: 1000, unitPricePaisa: 5000 }],
      });
      ok('an exact supplier name links itself (DEC-SUP-007)', linked.supplierId === supplier.id);
      const renamed = await purchases.update(linked.id, {
        supplierName: 'Somebody Else Entirely',
      });
      ok('PUR-REV-8 renaming to an unknown supplier drops the stale link',
        renamed.supplierId === null,
        `name="${renamed.supplierName}" link=${renamed.supplierId}`);
    } else {
      console.log('  SKIP  no ACTIVE supplier on file — the link rules are not exercised');
    }

    /* ---------------------------------------------------------------- 7 */
    console.log('\n=== 7. a received purchase is permanent (PUR-R06) ===');

    await refuses('a received purchase cannot be cancelled',
      () => purchases.cancel(quick.id, 'selftest'), 'never cancelled');
    await refuses('…nor deleted', () => purchases.remove(quick.id, 'selftest'),
      'permanent');

    /* ---------------------------------------------------------------- 8 */
    console.log('\n=== 8. a return cuts the due first, the rest becomes credit (PUR-R08) ===');

    // ৳5,000 bill, ৳1,000 advance paid → ৳4,000 due. Return 90 lilies = ৳4,500.
    const before = await purchases.findOne(advance.id);
    ok('the due before the return is the bill less the advance',
      before.duePaisa === 400_000, taka(before.duePaisa));

    await refuses('PUR-R08 returning more than was received is refused',
      () => purchases.createReturn({
        purchaseId: advance.id, lines: [{ purchaseLineId: lineId, qtyMilli: 500_000 }],
      }), 'can still be returned');

    // measured as a DELTA, not an absolute: section 6 adds a lily purchase only when an
    // ACTIVE supplier happens to exist, and a test whose arithmetic depends on your data
    // is a test that goes red for the wrong reason
    const lilyBefore = await inventory.onHandMilli(lily.id);

    const returned = await purchases.createReturn({
      purchaseId: advance.id, reason: 'wilted',
      lines: [{ purchaseLineId: lineId, qtyMilli: 90_000 }],
    });
    ok('the due is cleared by the return', returned.duePaisa === 0, taka(returned.duePaisa));
    const credits = await prisma.supplierCredit.findMany({
      where: { note: { contains: returned.purchaseNo } },
    });
    // ৳4,500 returned − ৳4,000 due = ৳500 credit
    ok('DEC-PUR-006 the excess becomes a supplier credit, never a cash refund',
      credits.length === 1 && credits[0].amountPaisa === 50_000,
      credits[0] ? taka(credits[0].amountPaisa) : 'none');

    const lilyAfter = await inventory.onHandMilli(lily.id);
    ok('the returned stock left the warehouse', lilyBefore - lilyAfter === 90_000,
      `${lilyBefore / 1000} → ${lilyAfter / 1000}`);

    /* ---------------------------------------------------------------- 9 */
    console.log('\n=== 9. PUR-R01 — Purchase writes no stock of its own ===');

    const byPurchase = await prisma.inventoryMovement.count({
      where: { itemId: { in: [rose.id, lily.id] }, reason: { notIn: ['PURCHASE', 'PURCHASE_RETURN'] } },
    });
    ok('every movement this module caused is a PURCHASE or PURCHASE_RETURN one',
      byPurchase === 0, `${byPurchase} stray`);
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
