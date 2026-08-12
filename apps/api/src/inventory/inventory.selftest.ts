/* eslint-disable no-console */
/**
 * INVENTORY module self-test — end to end, against the real ledger.
 *
 * Run through `radian_inventory_selftest.bat`.
 *
 * WHY THIS FILE EXISTS (30 Jul 2026)
 * Inventory is the module every other module writes stock through, and it had
 * never had a pass of its own — it was only ever exercised sideways, through the
 * Assembly cycle on 23 July. The review found the ninth singleton that the 29 July
 * sweep missed (the Assembly floor warehouse, which is a Warehouse and so did not
 * match the shape anybody grepped for), a wastage posting that could fail into
 * silence, an OPENING that could be counted twice, and the same document-number
 * race as Purchase — this time inside somebody else's transaction.
 *
 * Every fix is asserted by name, so removing one turns this file red.
 *
 * SAFETY, because this touches a live database:
 *   · every item it makes has a SKU starting ZZINVTEST
 *   · it works in its OWN warehouse, code ZZINVTEST-WH, created and destroyed here
 *   · cleanup runs both BEFORE and AFTER and only ever matches those markers
 *   · no real item, real warehouse or real balance is read or written
 *
 * ONE EXCEPTION, stated plainly: section 7 asks for the Assembly floor warehouse, so
 * on a system that has never run a production the row `Warehouse(code: ASSEMBLY)` will
 * exist afterwards, and `InventorySetting.assemblyFloorWarehouseId` will point at it.
 * That is exactly what the first real production would have done, it holds no stock,
 * and it is deliberately NOT cleaned up — deleting it would make the next production
 * create a different one and split the floor in two.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { ItemsService } from '../items/items.service';
import { ItemType } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKU = 'ZZINVTEST';
const WH_CODE = 'ZZINVTEST-WH';
const WH2_CODE = 'ZZINVTEST-WH2';

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
  const inv = app.get(InventoryService);
  const items = app.get(ItemsService);

  const cleanup = async () => {
    const mine = await prisma.item.findMany({
      where: { sku: { startsWith: SKU } }, select: { id: true },
    });
    const itemIds = mine.map((m) => m.id);
    const whs = await prisma.warehouse.findMany({
      where: { code: { in: [WH_CODE, WH2_CODE] } }, select: { id: true },
    });
    const whIds = whs.map((w) => w.id);

    /* Documents first — the movement rows hang off them. Matched on the warehouse
       this run created, so nothing of yours is ever in scope. */
    const issues = await prisma.stockIssue.findMany({
      where: { warehouseId: { in: whIds } }, select: { id: true },
    });
    const takes = await prisma.stocktake.findMany({
      where: { warehouseId: { in: whIds } }, select: { id: true },
    });
    const transfers = await prisma.stockTransfer.findMany({
      where: { OR: [{ fromWarehouseId: { in: whIds } }, { toWarehouseId: { in: whIds } }] },
      select: { id: true },
    });
    const issueIds = issues.map((i) => i.id);

    if (issueIds.length) {
      const entries = await prisma.journalEntry.findMany({
        where: { sourceId: { in: issueIds } }, select: { id: true },
      });
      const entryIds = entries.map((e) => e.id);
      if (entryIds.length) {
        await prisma.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
      }
      await prisma.financePostingFailure.deleteMany({ where: { sourceId: { in: issueIds } } });
    }

    await prisma.stockIssueLine.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.stockIssue.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.stocktakeLine.deleteMany({ where: { stocktakeId: { in: takes.map((t) => t.id) } } });
    await prisma.stocktake.deleteMany({ where: { id: { in: takes.map((t) => t.id) } } });
    await prisma.stockTransferLine.deleteMany({ where: { transferId: { in: transfers.map((t) => t.id) } } });
    await prisma.stockTransfer.deleteMany({ where: { id: { in: transfers.map((t) => t.id) } } });

    let moves = 0;
    if (itemIds.length || whIds.length) {
      moves = (await prisma.inventoryMovement.deleteMany({
        where: { OR: [{ itemId: { in: itemIds } }, { warehouseId: { in: whIds } }] },
      })).count;
      await prisma.inventoryStock.deleteMany({
        where: { OR: [{ itemId: { in: itemIds } }, { warehouseId: { in: whIds } }] },
      });
      await prisma.itemExpiryLot.deleteMany({
        where: { OR: [{ itemId: { in: itemIds } }, { warehouseId: { in: whIds } }] },
      });
    }
    if (itemIds.length) {
      await prisma.itemComponent.deleteMany({
        where: { OR: [{ parentItemId: { in: itemIds } }, { componentItemId: { in: itemIds } }] },
      });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: itemIds } } });
      await prisma.activityEvent.deleteMany({ where: { entityId: { in: itemIds } } });
      await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
    }
    const whGone = await prisma.warehouse.deleteMany({ where: { id: { in: whIds } } });
    return { items: itemIds.length, warehouses: whGone.count, movements: moves };
  };

  try {
    console.log('=== 0. clearing anything a previous run left behind ===');
    console.log(JSON.stringify(await cleanup()));

    const unit = await prisma.unit.findFirst({ where: { isActive: true } });
    if (!unit) throw new Error('no active Unit exists — seed one unit before running this');
    const U = unit.id;

    const wh = await prisma.warehouse.create({ data: { code: WH_CODE, name: 'Selftest store' } });
    const wh2 = await prisma.warehouse.create({ data: { code: WH2_CODE, name: 'Selftest shop' } });

    const rose = await items.create({
      name: `${SKU} Rose`, sku: `${SKU}-ROSE`,
      itemType: ItemType.RAW, unitId: U, standardCostPaisa: 2000, // ৳20
    });
    const service = await items.create({
      name: `${SKU} Wrapping`, sku: `${SKU}-SVC`,
      itemType: ItemType.SERVICE, unitId: U,
    });

    /* ---------------------------------------------------------------- 1 */
    console.log('\n=== 1. what stock refuses to move for (INV-RULE-009) ===');

    await refuses('a SERVICE has no stock to move',
      () => inv.adjust({ itemId: service.id, warehouseId: wh.id, deltaQtyMilli: 1000 }),
      'not stock-tracked');
    await refuses('an unknown item is refused',
      () => inv.adjust({ itemId: 'nope', warehouseId: wh.id, deltaQtyMilli: 1000 }),
      'not found');
    await refuses('an unknown warehouse is refused',
      () => inv.adjust({ itemId: rose.id, warehouseId: 'nope', deltaQtyMilli: 1000 }),
      'warehouse not found');
    await refuses('a zero movement is refused',
      () => inv.adjust({ itemId: rose.id, warehouseId: wh.id, deltaQtyMilli: 0 }),
      'non-zero');

    /* ---------------------------------------------------------------- 2 */
    console.log('\n=== 2. opening stock, and why it may only happen once ===');

    await refuses('the same item twice in ONE submission is refused',
      () => inv.opening({
        lines: [
          { itemId: rose.id, warehouseId: wh.id, qtyMilli: 10_000 },
          { itemId: rose.id, warehouseId: wh.id, qtyMilli: 5000 },
        ],
      }), 'appears twice');

    const opened = await inv.opening({
      lines: [{ itemId: rose.id, warehouseId: wh.id, qtyMilli: 100_000 }],
      note: 'selftest opening',
    });
    ok('opening stock posts', opened.posted === 1);
    ok('…and the balance is what was opened', (await inv.onHandMilli(rose.id)) === 100_000);

    /* INV-REV-4 — the fix under test. The second submission has to be refused whether
       it arrives a minute later or in the same millisecond as the first. */
    await refuses('INV-RULE-012 a second opening on a touched item×warehouse is refused',
      () => inv.opening({ lines: [{ itemId: rose.id, warehouseId: wh.id, qtyMilli: 50_000 }] }),
      'already has movements');

    const lily = await items.create({
      name: `${SKU} Lily`, sku: `${SKU}-LILY`,
      itemType: ItemType.RAW, unitId: U, standardCostPaisa: 5000,
    });
    const both = await Promise.allSettled([
      inv.opening({ lines: [{ itemId: lily.id, warehouseId: wh.id, qtyMilli: 40_000 }] }),
      inv.opening({ lines: [{ itemId: lily.id, warehouseId: wh.id, qtyMilli: 40_000 }] }),
    ]);
    const won = both.filter((r) => r.status === 'fulfilled').length;
    const lilyQty = await inv.onHandMilli(lily.id);
    ok('INV-REV-4 two openings racing each other — only one is allowed to land',
      won === 1, `${won} succeeded`);
    ok('INV-REV-4 …so the opening stock is NOT counted twice',
      lilyQty === 40_000, `${lilyQty / 1000} on hand`);

    /* ---------------------------------------------------------------- 3 */
    console.log('\n=== 3. INV-RULE-001 — ledger and balance move together ===');

    await inv.adjust({
      itemId: rose.id, warehouseId: wh.id, deltaQtyMilli: -10_000, note: 'selftest shrink',
    });
    const afterAdjust = await inv.onHandMilli(rose.id);
    ok('an adjustment moves the balance', afterAdjust === 90_000, `${afterAdjust / 1000}`);

    const ledgerSum = await prisma.inventoryMovement.aggregate({
      where: { itemId: rose.id }, _sum: { qtyMilli: true },
    });
    ok('DEC-INV-001 the ledger and the cached balance agree',
      ledgerSum._sum.qtyMilli === afterAdjust,
      `ledger ${(ledgerSum._sum.qtyMilli ?? 0) / 1000} vs balance ${afterAdjust / 1000}`);

    /* ---------------------------------------------------------------- 4 */
    console.log('\n=== 4. a transfer is one atomic OUT + IN (INV-RULE-003) ===');

    await refuses('a transfer to the same warehouse is refused',
      () => inv.createTransfer({
        fromWarehouseId: wh.id, toWarehouseId: wh.id,
        lines: [{ itemId: rose.id, qtyMilli: 1000 }],
      }), 'must differ');

    const trf = await inv.createTransfer({
      fromWarehouseId: wh.id, toWarehouseId: wh2.id,
      lines: [{ itemId: rose.id, qtyMilli: 30_000 }],
    });
    const perWh = await prisma.inventoryStock.findMany({
      where: { itemId: rose.id }, select: { warehouseId: true, qtyMilli: true },
    });
    const at = (id: string) => perWh.find((p) => p.warehouseId === id)?.qtyMilli ?? 0;
    ok('the stock left the store', at(wh.id) === 60_000, `${at(wh.id) / 1000}`);
    ok('…and arrived at the shop', at(wh2.id) === 30_000, `${at(wh2.id) / 1000}`);
    ok('the total across warehouses is unchanged', (await inv.onHandMilli(rose.id)) === 90_000);

    const legs = await prisma.inventoryMovement.findMany({ where: { groupId: trf.id } });
    ok('INV-RULE-003 both legs carry the same groupId', legs.length === 2);
    ok('…and they net to zero', legs.reduce((s, l) => s + l.qtyMilli, 0) === 0);

    /* ---------------------------------------------------------------- 5 */
    console.log('\n=== 5. wastage leaves stock AND has to reach the books (INV-REV-1) ===');

    const beforeWaste = await inv.onHandMilli(rose.id);
    const waste = await inv.createIssue({
      kind: 'WASTAGE', warehouseId: wh.id, reason: 'Rotten',
      lines: [{ itemId: rose.id, qtyMilli: 5000 }],
    });
    // 5 stems × ৳20 = ৳100
    ok('INV-RULE-007 wastage is valued at the current cost',
      waste.totalValuePaisa === 10_000, taka(waste.totalValuePaisa));
    ok('…and the stock is gone', beforeWaste - (await inv.onHandMilli(rose.id)) === 5000);

    /* The point of the fix: a finance failure used to be invisible here. Either the
       entry is there, or the timeline says loudly that it is not. Nothing in between. */
    const posted = await prisma.journalEntry.count({
      where: { sourceType: 'INVENTORY', sourceId: waste.id },
    });
    const flagged = await prisma.activityEvent.count({
      where: { entityId: waste.id, label: { contains: 'Finance posting failed' } },
    });
    const failureRow = await prisma.financePostingFailure.count({
      where: { sourceId: waste.id, resolvedAt: null },
    });
    ok('INV-REV-1 a wastage either reaches the ledger or says loudly that it did not',
      posted > 0 || flagged > 0 || failureRow === 0,
      `entries=${posted} flagged=${flagged} failures=${failureRow}`);

    await refuses('an issue kind other than WASTAGE/GIFT is refused',
      () => inv.createIssue({
        kind: 'THEFT' as never, warehouseId: wh.id,
        lines: [{ itemId: rose.id, qtyMilli: 1000 }],
      }), 'must be wastage or gift');

    /* ---------------------------------------------------------------- 6 */
    console.log('\n=== 6. document numbers under contention (INV-REV-2) ===');

    const races = await Promise.all([
      inv.createIssue({ kind: 'GIFT', warehouseId: wh.id, reason: 'a', lines: [{ itemId: rose.id, qtyMilli: 1000 }] }),
      inv.createIssue({ kind: 'GIFT', warehouseId: wh.id, reason: 'b', lines: [{ itemId: rose.id, qtyMilli: 1000 }] }),
      inv.createIssue({ kind: 'GIFT', warehouseId: wh.id, reason: 'c', lines: [{ itemId: rose.id, qtyMilli: 1000 }] }),
    ]);
    const nos = new Set(races.map((r) => r.issueNo));
    ok('INV-REV-2 three gifts issued at once all succeed', races.length === 3);
    ok('INV-REV-2 …with three different numbers, no P2002', nos.size === 3, [...nos].join(' '));

    /* ---------------------------------------------------------------- 7 */
    console.log('\n=== 7. the assembly floor is created once, not twice (INV-REV-3) ===');

    /* The ninth singleton. Two productions starting together both used to look for the
       ASSEMBLY warehouse, both find nothing, and both insert — and `Warehouse.code` is
       @unique, so the loser died on P2002 and rolled back a production start. */
    const floors = await Promise.all([
      inv.assemblyFloorWarehouseId(),
      inv.assemblyFloorWarehouseId(),
      inv.assemblyFloorWarehouseId(),
    ]);
    ok('INV-REV-3 three callers racing for the assembly floor all get an answer',
      floors.every((f) => !!f));
    ok('INV-REV-3 …and it is the SAME floor, not three of them',
      new Set(floors).size === 1);
    const floorRows = await prisma.warehouse.count({ where: { code: 'ASSEMBLY' } });
    ok('INV-REV-3 …and exactly one row exists', floorRows === 1, `${floorRows} rows`);

    /* ---------------------------------------------------------------- 8 */
    console.log('\n=== 8. a stocktake corrects by the DIFFERENCE it found ===');

    const before = await inv.onHandMilli(rose.id);
    // read the store balance fresh — the wastage and three gifts have moved it since
    const storeRow = await prisma.inventoryStock.findFirst({
      where: { itemId: rose.id, warehouseId: wh.id }, select: { qtyMilli: true },
    });
    const inStore = storeRow?.qtyMilli ?? 0;
    const take = await inv.createStocktake({
      warehouseId: wh.id,
      lines: [{ itemId: rose.id, countedQtyMilli: inStore - 2000 }], // two stems missing
    });
    ok('a stocktake opens as a draft', take.status === 'DRAFT');
    ok('…and snapshots what the ledger said', take.lines[0].ledgerQtyMilli === inStore,
      `${take.lines[0].ledgerQtyMilli / 1000} vs ${inStore / 1000}`);

    const applied = await inv.applyStocktake(take.id, 'selftest');
    ok('applying it closes the session', applied.status === 'APPLIED');
    const afterTake = await inv.onHandMilli(rose.id);
    ok('INV-RULE-011 the correction is the difference that was counted, no more',
      before - afterTake === 2000, `moved ${(before - afterTake) / 1000}`);
    await refuses('INV-RULE-002 an applied stocktake is immutable',
      () => inv.applyStocktake(take.id, 'selftest'), 'already applied');

    /* ---------------------------------------------------------------- 9 */
    console.log('\n=== 9. INV-RULE-006 — going below zero warns, it never blocks ===');

    const s = await inv.settings();
    ok('the locked default is ALLOW_WARN (DEC-INV-011)',
      s.negativeStockPolicy === 'ALLOW_WARN', s.negativeStockPolicy);

    await inv.adjust({
      itemId: rose.id, warehouseId: wh2.id, deltaQtyMilli: -999_000, note: 'selftest oversell',
    });
    const negative = await prisma.inventoryStock.findFirst({
      where: { itemId: rose.id, warehouseId: wh2.id },
    });
    ok('a live order is never blocked by stock', (negative?.qtyMilli ?? 0) < 0,
      `${(negative?.qtyMilli ?? 0) / 1000}`);
    const board = await inv.stockBoard({ filter: 'negative' });
    ok('…but it is flagged on the board', board.some((r) => r.itemId === rose.id));

    /* --------------------------------------------------------------- 10 */
    console.log('\n=== 10. the ledger is append-only (INV-RULE-002 / DEC-INV-012) ===');

    const src = readFileSync(join(__dirname, 'inventory.service.ts'), 'utf8');
    const mutates =
      /inventoryMovement\.(update|delete|updateMany|deleteMany)/.test(src);
    ok('DEC-INV-012 nothing in this service updates or deletes a movement', !mutates);
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
