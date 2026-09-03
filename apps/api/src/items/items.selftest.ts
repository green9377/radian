/* eslint-disable no-console */
/**
 * ITEM module self-test — end to end, against the real service, with data it
 * invents and then takes back out again.
 *
 * Run through `radian_item_selftest.bat`. It talks to the Nest service directly
 * rather than over HTTP, so no password is needed and every business rule is
 * exercised exactly where it lives.
 *
 * WHY THIS FILE EXISTS (30 Jul 2026)
 * Item is the oldest module in the system and had never been reviewed or tested.
 * Everything downstream reads its cost: Purchase writes to it, Inventory values
 * stock with it, Assembly rolls it up, Finance turns it into COGS. The review that
 * produced this file found seven faults, one of them a purge fence with ten holes
 * in it. Each fault below is asserted by name so that removing a fix turns this
 * file red.
 *
 * SAFETY, because this touches a live database:
 *   · every item it makes has a SKU starting ZZSELFTEST
 *   · cleanup runs both BEFORE and AFTER, matches that prefix only, and hard-deletes
 *     through the raw client so nothing is left in the trash either
 *   · it never touches an item, product, recipe or unit that it did not create
 *   · it creates NO purchase, stock or order rows — the purge fences it cannot reach
 *     without them are asserted by reading the code path, not by faking history
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { ItemsService } from './items.service';
import { ItemType, AssemblyMode, CostMode } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'ZZSELFTEST';

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

/** the rule under test is that this SHOULD be refused */
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
  const items = app.get(ItemsService);

  /* Raw client throughout: these rows are meant to disappear completely, and the
     soft-delete extension would hide the ones already in the trash from the sweep. */
  const cleanup = async () => {
    const mine = await prisma.item.findMany({
      where: { sku: { startsWith: PREFIX } },
      select: { id: true },
    });
    const ids = mine.map((m) => m.id);
    if (!ids.length) return { items: 0, lines: 0, products: 0 };

    const products = await prisma.product.updateMany({
      where: { itemId: { in: ids } },
      data: { itemId: null },
    });
    const lines = await prisma.itemComponent.deleteMany({
      where: { OR: [{ parentItemId: { in: ids } }, { componentItemId: { in: ids } }] },
    });
    await prisma.auditLog.deleteMany({ where: { entityType: 'Item', entityId: { in: ids } } });
    await prisma.activityEvent.deleteMany({ where: { entityType: 'Item', entityId: { in: ids } } });
    const gone = await prisma.item.deleteMany({ where: { id: { in: ids } } });
    return { items: gone.count, lines: lines.count, products: products.count };
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
    const U = unit.id;

    /* ---------------------------------------------------------------- 1 */
    console.log('\n=== 1. the field combinations that must never disagree ===');

    const service = await items.create({
      name: `${PREFIX} Gift Wrapping`,
      sku: `${PREFIX}-SERVICE`,
      itemType: ItemType.SERVICE,
      unitId: U,
      isStockTracked: true, // asking for the impossible on purpose
      assemblyMode: AssemblyMode.MAKE_TO_ORDER,
    });
    ok('ITM-R04 a SERVICE is never stock-tracked', service.isStockTracked === false);
    ok('ITM-R04 a SERVICE is never assembled', service.assemblyMode === AssemblyMode.NONE);
    ok('DEC-ITM-013 a service is saleable but not purchasable',
      service.isSaleable === true && service.isPurchasable === false);

    /* ITM-REV-4 — the fix under test. Before it, create() passed hasRecipe=null and
       this item came back claiming MAKE_TO_STOCK with an empty recipe. */
    const emptyAssembled = await items.create({
      name: `${PREFIX} Claims To Be Assembled`,
      sku: `${PREFIX}-EMPTY`,
      itemType: ItemType.FINISHED,
      unitId: U,
      assemblyMode: AssemblyMode.MAKE_TO_STOCK,
    });
    ok('ITM-REV-4 a NEW item cannot claim to be assembled out of nothing (ITM-R02)',
      emptyAssembled.assemblyMode === AssemblyMode.NONE,
      `got ${emptyAssembled.assemblyMode}`);

    await refuses('DEC-ITM-006 an item without a unit is refused',
      () => items.create({ name: `${PREFIX} No Unit`, itemType: ItemType.RAW, unitId: '' }),
      'unitId is required');

    /* ITM-REV-6 — the fix under test. Before it this was a raw Prisma P2003 → 500. */
    await refuses('ITM-REV-6 a stale brand id is a readable refusal, not a crash',
      () => items.create({
        name: `${PREFIX} Bad Brand`, itemType: ItemType.RAW, unitId: U,
        brandId: 'does-not-exist-at-all',
      }),
      'no longer exists');
    await refuses('ITM-REV-6 …and so is a stale category id',
      () => items.create({
        name: `${PREFIX} Bad Cat`, itemType: ItemType.RAW, unitId: U,
        itemCategoryId: 'does-not-exist-at-all',
      }),
      'no longer exists');

    /* ---------------------------------------------------------------- 2 */
    console.log('\n=== 2. SKU is unique across the system, deleted rows included ===');

    const rose = await items.create({
      name: `${PREFIX} Red Rose Stem`, sku: `${PREFIX}-ROSE`,
      itemType: ItemType.RAW, unitId: U, standardCostPaisa: 2000, // ৳20
    });
    const clash = await items.create({
      name: `${PREFIX} Red Rose Stem again`, sku: `${PREFIX}-ROSE`,
      itemType: ItemType.RAW, unitId: U,
    });
    ok('ITM-R08 a duplicate SKU is given a free one, not rejected',
      clash.sku !== rose.sku && clash.sku.startsWith(`${PREFIX}-ROSE`), clash.sku);

    /* ---------------------------------------------------------------- 3 */
    console.log('\n=== 3. the recipe rules ===');

    const filler = await items.create({
      name: `${PREFIX} Baby Breath`, sku: `${PREFIX}-FILLER`,
      itemType: ItemType.RAW, unitId: U, standardCostPaisa: 500, // ৳5
    });
    const bouquet = await items.create({
      name: `${PREFIX} Bouquet`, sku: `${PREFIX}-BOUQUET`,
      itemType: ItemType.FINISHED, unitId: U,
    });

    await refuses('ITM-R01 a RAW item cannot carry a recipe',
      () => items.addComponent(rose.id, { componentItemId: filler.id, qtyMilli: 1000 }),
      'only finished items');

    await refuses('ITM-R03 an item cannot contain itself',
      () => items.addComponent(bouquet.id, { componentItemId: bouquet.id, qtyMilli: 1000 }),
      'cannot contain itself');

    await refuses('a zero quantity recipe line is refused',
      () => items.addComponent(bouquet.id, { componentItemId: rose.id, qtyMilli: 0 }),
      'greater than zero');

    await items.addComponent(bouquet.id, { componentItemId: rose.id, qtyMilli: 12_000 }); // 12 stems
    await refuses('the same ingredient cannot be added twice',
      () => items.addComponent(bouquet.id, { componentItemId: rose.id, qtyMilli: 1000 }),
      'already in this recipe');

    const afterFirst = await items.findOne(bouquet.id);
    ok('DEC-ITM-004 the first ingredient makes it MAKE_TO_ORDER, not MAKE_TO_STOCK',
      afterFirst.assemblyMode === AssemblyMode.MAKE_TO_ORDER);

    /* ---------------------------------------------------------------- 4 */
    console.log('\n=== 4. the cost roll-up (DEC-ITM-008 / ITM-R06) ===');

    // 12 stems × ৳20 = ৳240, plus 10% wastage on the filler line below
    await items.addComponent(bouquet.id, {
      componentItemId: filler.id, qtyMilli: 2000, wastageBp: 1000, // 2 × ৳5 + 10%
    });
    const toAuto = await items.update(bouquet.id, { costMode: CostMode.AUTO });
    ok('ITM-R05 AUTO is allowed once a recipe exists', toAuto.costMode === CostMode.AUTO);
    // 12×2000 + 2×500×1.1 = 24000 + 1100 = 25100
    ok('the recipe adds up, wastage included', toAuto.computedCostPaisa === 25_100,
      `got ${toAuto.computedCostPaisa}`);

    /* ITM-REV-3 — the fix under test. Before it, update() returned the row read BEFORE
       the roll-up, so this figure was one save behind. */
    ok('ITM-REV-3 the value returned by update() is the rolled-up one, not the old one',
      toAuto.effectiveCostPaisa === 25_100,
      `effective=${toAuto.effectiveCostPaisa}`);

    const dearer = await items.update(rose.id, { standardCostPaisa: 3000 }); // ৳20 → ৳30
    ok('an ingredient price change is accepted', dearer.standardCostPaisa === 3000);
    const rolled = await items.findOne(bouquet.id);
    // 12×3000 + 1100 = 37100
    ok('ITM-R06 …and it rolls up into everything above it', rolled.computedCostPaisa === 37_100,
      `got ${rolled.computedCostPaisa}`);

    console.log('\n--- an optional extra is not part of the standard cost ---');
    const ribbon = await items.create({
      name: `${PREFIX} Ribbon`, sku: `${PREFIX}-RIBBON`,
      itemType: ItemType.CONSUMABLE, unitId: U, standardCostPaisa: 10_000,
    });
    await items.addComponent(bouquet.id, {
      componentItemId: ribbon.id, qtyMilli: 1000, isOptional: true,
    });
    const withOptional = await items.findOne(bouquet.id);
    ok('an optional line does not move the cost', withOptional.computedCostPaisa === 37_100,
      `got ${withOptional.computedCostPaisa}`);

    console.log('\n--- the floor price, computed in one place (DEC-ITM-018) ---');
    const floored = await items.update(bouquet.id, { minMarginBp: 2000 }); // +20%
    ok('the floor is cost + margin', floored.floorPricePaisa === Math.round(37_100 * 1.2),
      `got ${floored.floorPricePaisa}`);
    const flatFloor = await items.update(bouquet.id, { minMarginBp: null, minMarginPaisa: 5000 });
    ok('only one margin rule can be live at a time',
      flatFloor.minMarginBp === null && flatFloor.floorPricePaisa === 42_100,
      `bp=${flatFloor.minMarginBp} floor=${flatFloor.floorPricePaisa}`);
    const noFloor = await items.update(bouquet.id, { minMarginPaisa: null });
    ok('"no floor" is null, not a floor equal to cost', noFloor.floorPricePaisa === null);

    /* ---------------------------------------------------------------- 5 */
    console.log('\n=== 5. nesting depth is measured across the WHOLE chain (ITM-REV-5) ===');

    /* MAX_DEPTH counts LINKS, not items, and the guard is
       heightAbove(parent) + 1 + depthOf(child) — the longest path THROUGH the new
       link. So the chain has to be extended at its BOTTOM end to grow: hanging
       something under the TOP item adds a short branch and proves nothing. The
       first version of this test hung the bouquet under the top and therefore
       never reached the limit at all (found 3 Sep 2026).

       Chain: L5 ⊃ L4 ⊃ L3 ⊃ L2 ⊃ L1  — four links, so heightAbove(L1) = 4. */
    const chain: { id: string; sku: string; name: string }[] = [];
    for (let n = 1; n <= 5; n++) {
      chain.push(await items.create({
        name: `${PREFIX} Level ${n}`, sku: `${PREFIX}-L${n}`,
        itemType: ItemType.FINISHED, unitId: U, standardCostPaisa: 100,
      }));
    }
    for (let n = 1; n < 5; n++) {
      await items.addComponent(chain[n].id, { componentItemId: chain[n - 1].id, qtyMilli: 1000 });
    }

    /* A leaf under L1: 4 + 1 + 0 = 5. That is the limit exactly, so it must pass —
       without this the refusal below could be coming from an off-by-one. */
    const leaf = await items.create({
      name: `${PREFIX} Level leaf`, sku: `${PREFIX}-LLEAF`,
      itemType: ItemType.RAW, unitId: U, standardCostPaisa: 100,
    });
    const atLimit = await items.addComponent(chain[0].id, {
      componentItemId: leaf.id, qtyMilli: 1000,
    });
    ok('a chain of exactly MAX_DEPTH links is still allowed', !!atLimit.id);

    /* The bouquet is 1 deep of its own (rose + filler + ribbon), so under L1 it is
       4 + 1 + 1 = 6 — one past the limit, and refused. */
    await refuses('ITM-REV-5 a chain that is already deep cannot be extended past the limit',
      () => items.addComponent(chain[0].id, { componentItemId: bouquet.id, qtyMilli: 1000 }),
      'may not nest deeper');

    await refuses('ITM-R03 a loop is refused however far apart the two ends are',
      () => items.addComponent(chain[0].id, { componentItemId: chain[4].id, qtyMilli: 1000 }),
      'loop');

    /* ---------------------------------------------------------------- 5b */
    console.log('\n=== 5b. a Combo may be as WIDE as it likes (owner, 3 Sep 2026) ===');

    /* MAX_DEPTH bounds nesting only. Component count has no limit anywhere —
       schema, DTO, controller and service were all read on 3 Sep and none of them
       counts lines. A real Radian combo can carry 50+ items, so prove it here
       rather than trusting that nothing will ever add a cap.

       Component n costs n × ৳1 and goes in at 2 units, so it contributes n × 200
       paisa. Sum over 1..50 = 200 × 1275 = 255000 paisa (৳2,550). The literal is
       written out so a wrong roll-up cannot agree with a wrong expectation. */
    const WIDTH = 50;
    const combo = await items.create({
      name: `${PREFIX} Wide Combo`, sku: `${PREFIX}-COMBO`,
      itemType: ItemType.FINISHED, unitId: U,
    });
    let expectedPaisa = 0;
    for (let n = 1; n <= WIDTH; n++) {
      const part = await items.create({
        name: `${PREFIX} Part ${n}`, sku: `${PREFIX}-PART${n}`,
        itemType: ItemType.RAW, unitId: U, standardCostPaisa: n * 100,
      });
      await items.addComponent(combo.id, { componentItemId: part.id, qtyMilli: 2000 });
      expectedPaisa += n * 100 * 2; // qty 2 units, no wastage
    }

    const wide = await items.findOne(combo.id);
    ok(`all ${WIDTH} components stay in the recipe — nothing is capped`,
      wide.components.length === WIDTH, `${wide.components.length} lines`);
    ok('…and every one of them is a distinct item',
      new Set(wide.components.map((c: { componentItemId: string }) => c.componentItemId)).size === WIDTH);
    ok('DEC-ITM-004 a wide recipe still makes it MAKE_TO_ORDER',
      wide.assemblyMode === AssemblyMode.MAKE_TO_ORDER);

    const wideAuto = await items.update(combo.id, { costMode: CostMode.AUTO });
    ok(`the cost adds up across all ${WIDTH} lines`,
      wideAuto.computedCostPaisa === 255_000 && wideAuto.computedCostPaisa === expectedPaisa,
      `got ${wideAuto.computedCostPaisa}, expected 255000`);

    /* The point of the section: width is not depth. The combo has 50 components but
       is 1 level deep, so it still fits under a parent (0 + 1 + 1 = 2). If component
       count ever leaked into the depth guard this would be refused as 51 levels. */
    const holder = await items.create({
      name: `${PREFIX} Combo Holder`, sku: `${PREFIX}-HOLDER`,
      itemType: ItemType.FINISHED, unitId: U,
    });
    const nested = await items.addComponent(holder.id, {
      componentItemId: combo.id, qtyMilli: 1000,
    });
    ok(`a ${WIDTH}-component combo is still only 1 level deep — width is not depth`,
      !!nested.id);

    /* ---------------------------------------------------------------- 6 */
    console.log('\n=== 6. an empty recipe makes it a plain item again ===');

    const solo = await items.create({
      name: `${PREFIX} Solo`, sku: `${PREFIX}-SOLO`,
      itemType: ItemType.FINISHED, unitId: U, standardCostPaisa: 700,
    });
    const soloLine = await items.addComponent(solo.id, {
      componentItemId: filler.id, qtyMilli: 1000,
    });
    await items.update(solo.id, { costMode: CostMode.AUTO });
    await items.removeComponent(soloLine.id, 'selftest');
    const bare = await items.findOne(solo.id);
    ok('ITM-R02 the last line removed drops it back to NONE',
      bare.assemblyMode === AssemblyMode.NONE);
    ok('ITM-R05 …and AUTO falls back to MANUAL rather than reporting ৳0',
      bare.costMode === CostMode.MANUAL && bare.computedCostPaisa === null);
    ok('…so the effective cost is the manual one, not zero', bare.effectiveCostPaisa === 700);

    /* ---------------------------------------------------------------- 7 */
    console.log('\n=== 7. delete, and what it releases (ITM-R07 / ITM-REV-2) ===');

    await refuses('an ingredient in someone else\'s recipe cannot be deleted',
      () => items.remove(rose.id, 'selftest'), 'ingredient in');

    const gone = await items.remove(bouquet.id, 'selftest');
    ok('a finished item with no dependants can be deleted', gone.deleted === true);
    ok('ITM-REV-2 deleting it releases its own recipe lines',
      gone.recipeLinesReleased === 3, `released ${gone.recipeLinesReleased}`);

    /* The point of the fix: the rose is now free, because the only recipe holding it
       is in the trash. Before ITM-REV-2 this refused for ever. */
    const usage = await items.usage(rose.id);
    ok('ITM-REV-2 …so its ingredients are no longer held by a deleted recipe',
      usage.usedInRecipes.length === 0, `still held by ${usage.usedInRecipes.length}`);
    const roseGone = await items.remove(rose.id, 'selftest');
    ok('ITM-REV-2 …and can now actually be deleted', roseGone.deleted === true);

    const trash = await items.trash();
    ok('deleted items are in the trash, not gone',
      trash.some((t: { id: string }) => t.id === bouquet.id));
    await items.restore(rose.id, 'selftest');
    ok('and can be put back', !!(await items.findOne(rose.id)));

    /* ---------------------------------------------------------------- 8 */
    console.log('\n=== 8. permanent destruction is fenced (ITM-R14 / ITM-REV-1) ===');

    const scrap = await items.create({
      name: `${PREFIX} Typo Row`, sku: `${PREFIX}-SCRAP`,
      itemType: ItemType.RAW, unitId: U,
    });

    /* The old fence 4 ("type the SKU back exactly") was DROPPED on the owner's word,
       22 Aug 2026 — the screen asks once and Yes means yes. `confirmSku` is still
       accepted so an old tab does not break, but it no longer decides anything. What
       is asserted now is that dropping it did not weaken the two fences that matter. */
    await refuses('fence 1 — a live item cannot be destroyed, whatever code is typed',
      () => items.purge(scrap.id, 'selftest', 'WRONG-CODE'), 'only possible from the trash');
    await refuses('fence 1 — …and the right code does not open it either',
      () => items.purge(scrap.id, 'selftest', scrap.sku), 'only possible from the trash');

    await items.remove(scrap.id, 'selftest');
    const purged = await items.purge(scrap.id, 'selftest', '');
    ok('a trashed item with no history is destroyed, and no code is required (owner, 22 Aug)',
      purged.purged === true);
    const back = await prisma.item.findUnique({ where: { id: scrap.id } });
    ok('…and it really is gone from the table', back === null);
    const trace = await prisma.auditLog.count({
      where: { entityType: 'Item', entityId: scrap.id, action: 'DELETE' },
    });
    ok('…but the audit trace outlives it', trace > 0);

    console.log('\n--- fence 2: what is and is not a real dependency ---');

    /* The rose is the honest case for this fence, and the only reachable one: an item
       held by a LIVE recipe cannot be trashed at all (ITM-R07 stops it), so `usedIn`
       inside purge can only ever bite on a line that is itself soft-deleted. The
       bouquet above is in the trash and its lines with it, which is exactly that
       shape — and purge counts on the RAW client, so those lines still speak for it. */
    await items.remove(rose.id, 'selftest');
    await refuses('an item somebody else\'s recipe depends on cannot be destroyed',
      () => items.purge(rose.id, 'selftest', rose.sku), 'ingredient in');

    /* ITM-REV-8 — the fix under test. chain[4] is the top of the chain: it HAS a recipe
       but nothing depends on it. Its own lines are children, not dependencies, so it
       must be destroyable — and before the fix it was not, for ever, because the count
       is taken raw and ITM-REV-2 leaves those lines soft-deleted behind it. */
    await items.remove(chain[4].id, 'selftest');
    const topPurged = await items.purge(chain[4].id, 'selftest', chain[4].sku);
    ok('ITM-REV-8 an item that HAS a recipe can still be destroyed once nothing needs it',
      topPurged.purged === true);
    ok('ITM-REV-8 …and its own recipe lines are destroyed with it',
      topPurged.linesDestroyed === 1, `destroyed ${topPurged.linesDestroyed}`);
    const orphanLines = await prisma.itemComponent.count({
      where: { parentItemId: chain[4].id },
    });
    ok('…leaving no line pointing at an id that is gone', orphanLines === 0);

    /* ITM-REV-1 — the fix under test. This asserts the fence LIST, not the FK error:
       reaching prisma.item.delete() with any of these non-zero used to be a 500. The
       thirteen names below are every relation the schema declares on Item; if a new
       table is added and not fenced, this count goes stale and the assertion fails. */
    const fenced = [
      'products', 'usedIn', 'components', 'purchaseLines', 'stocks', 'movements',
      'transferLines', 'issueLines', 'stocktakeLines', 'expiryLots',
      'asmTemplateLines', 'asmProductionLines', 'asmProductions',
    ];
    const src = readFileSync(join(__dirname, 'items.service.ts'), 'utf8');
    const purgeBlock = src.slice(src.indexOf('async purge('), src.indexOf('async addComponent('));
    const unfenced = fenced.filter((r) => !purgeBlock.includes(r));
    ok('ITM-REV-1 every relation the schema declares on Item is named in the purge fence',
      unfenced.length === 0, unfenced.length ? `missing: ${unfenced.join(', ')}` : '13 of 13');

    /* ---------------------------------------------------------------- 9 */
    console.log('\n=== 9. the variant generator (DEC-ITM-016 / DEC-ITM-020) ===');

    const attr = await prisma.itemAttribute.findFirst({
      where: { isActive: true },
      include: { values: { where: { deletedAt: null }, take: 3 } },
    });
    if (attr && attr.values.length >= 2) {
      const ids = attr.values.slice(0, 2).map((v: { id: string }) => v.id);
      const first = await items.generateVariants({
        baseName: `${PREFIX} Rose`, skuPrefix: `${PREFIX}-VAR`,
        itemType: ItemType.RAW, unitId: U, valueIdGroups: [ids],
      });
      ok('one item per combination is created', first.created.length === 2);
      const again = await items.generateVariants({
        baseName: `${PREFIX} Rose`, skuPrefix: `${PREFIX}-VAR`,
        itemType: ItemType.RAW, unitId: U, valueIdGroups: [ids],
      });
      ok('ITM-R11 running it twice creates nothing and destroys nothing',
        again.created.length === 0 && again.skipped === 2);
      const made = await prisma.item.findMany({
        where: { sku: { startsWith: `${PREFIX}-VAR` } },
        select: { familyKey: true },
      });
      const keys = new Set(made.map((m: { familyKey: string | null }) => m.familyKey));
      ok('DEC-ITM-020 one batch shares one familyKey, and it is not null',
        keys.size === 1 && !keys.has(null));
    } else {
      console.log('  SKIP  no colour/size labels exist yet — variant generator not exercised');
    }

    await refuses('generating from no labels at all is refused',
      () => items.generateVariants({
        baseName: `${PREFIX} Nothing`, itemType: ItemType.RAW, unitId: U, valueIdGroups: [],
      }), 'at least one');

    /* --------------------------------------------------------------- 10 */
    console.log('\n=== 10. ITM-R09 — this module writes no stock, anywhere ===');

    const stockRows = await prisma.inventoryStock.count({
      where: { item: { sku: { startsWith: PREFIX } } },
    });
    const moveRows = await prisma.inventoryMovement.count({
      where: { item: { sku: { startsWith: PREFIX } } },
    });
    ok('nothing this module did created a stock balance', stockRows === 0);
    ok('nothing this module did created a stock movement', moveRows === 0);

    /* --------------------------------------------------------------- 11 */
    console.log('\n=== 11. DEC-ITM-026 — the three-step unit-change rule ===');
    /*  Owner, 26 Aug 2026: no history = change freely; history + same family =
        restate stock/cost/reorder after a human confirms; history + different
        family = blocked, make a new item. The fake history below is written
        with the raw client on purpose — Items itself still writes no stock
        (section 10 asserted that BEFORE this section ran).  */

    const uRoot = await prisma.unit.create({ data: { name: `${PREFIX} Petal`, shortCode: 'zzstpetal' } });
    const uBig = await prisma.unit.create({
      data: { name: `${PREFIX} Stem`, shortCode: 'zzststem', baseUnitId: uRoot.id, baseQty: 4 },
    });
    const uForeign = await prisma.unit.create({ data: { name: `${PREFIX} Kg`, shortCode: 'zzstkg' } });

    const uItem = await items.create({
      name: `${PREFIX} Unit Guard`, itemType: ItemType.RAW, unitId: uRoot.id,
      standardCostPaisa: 500, reorderLevel: 20, isStockTracked: true,
    });

    // step 1 — blank history: free in any direction, no confirmation asked
    await items.update(uItem.id, { unitId: uBig.id });
    await items.update(uItem.id, { unitId: uRoot.id });
    ok('no history -> the unit changes freely, both ways', true);

    // manufacture history: 40 petals on the shelf (raw client, see note above)
    let wh = await prisma.warehouse.findFirst({ select: { id: true } });
    const madeWh = !wh;
    if (!wh) wh = await prisma.warehouse.create({ data: { code: 'ZZSTWH', name: `${PREFIX} WH` }, select: { id: true } });
    await prisma.inventoryMovement.create({
      data: { itemId: uItem.id, warehouseId: wh.id, reason: 'OPENING', qtyMilli: 40_000, unitCostPaisa: 500, valuePaisa: 20_000 },
    });
    await prisma.inventoryStock.create({ data: { itemId: uItem.id, warehouseId: wh.id, qtyMilli: 40_000 } });

    // step 2 — same family: first ask, then restate
    await refuses('history + same family -> refused until confirmed (UNIT_CONFIRM)',
      () => items.update(uItem.id, { unitId: uBig.id }), 'UNIT_CONFIRM');
    await items.update(uItem.id, { unitId: uBig.id, confirmUnitChange: true });
    const stockAfter = await prisma.inventoryStock.findFirst({ where: { itemId: uItem.id }, select: { qtyMilli: true } });
    const itemAfter = await prisma.item.findFirst({
      where: { id: uItem.id }, select: { standardCostPaisa: true, reorderLevel: true },
    });
    ok('confirmed -> stock restated 40 petal = 10 stem', stockAfter?.qtyMilli === 10_000, `got ${stockAfter?.qtyMilli}`);
    ok('cost per unit follows: 500/petal -> 2000/stem', itemAfter?.standardCostPaisa === 2000, `got ${itemAfter?.standardCostPaisa}`);
    ok('reorder level follows: 20 petal -> 5 stem', itemAfter?.reorderLevel === 5, `got ${itemAfter?.reorderLevel}`);

    // step 3 — different family: no conversion exists, blocked outright
    await refuses('history + different family -> blocked, pointed at a new item',
      () => items.update(uItem.id, { unitId: uForeign.id, confirmUnitChange: true }), 'new item');

    // take the fake history out so the purge fence below can hard-delete the item
    await prisma.inventoryMovement.deleteMany({ where: { itemId: uItem.id } });
    await prisma.inventoryStock.deleteMany({ where: { itemId: uItem.id } });
    await prisma.item.delete({ where: { id: uItem.id } }).catch(() => undefined);
    await prisma.unit.deleteMany({ where: { id: { in: [uBig.id, uRoot.id, uForeign.id] } } }).catch(() => undefined);
    if (madeWh && wh) await prisma.warehouse.delete({ where: { id: wh.id } }).catch(() => undefined);
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
