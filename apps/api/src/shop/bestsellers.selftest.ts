/* eslint-disable no-console */
/**
 * BEST SELLERS self-test — the homepage grid, the badge ranking, the settings.
 *
 *     docker compose exec -T api npx ts-node -T --project tsconfig.json src/shop/bestsellers.selftest.ts
 *
 * WHY THIS FILE EXISTS (4 Sep 2026)
 * The homepage audit found the Best Sellers grid deciding everything for
 * itself in code: five tab slugs from the July mock that matched no live
 * category (so only "All" ever showed), and "All" a popularity SORT of 24
 * products padded by `salesCount` — a typed field — and newest-first. A shelf
 * called Best Sellers showing products that had never sold.
 *
 * What is asserted here is the replacement:
 *   · `recompute()` stores the window sales beside the badge, counting only
 *     delivered WEBSITE lines inside the window — not the counter, not old
 *     orders, and never the typed `salesCount`
 *   · `best=1` / `sort=best` on the product list mean the earned badge, ranked
 *     by those window sales
 *   · `popular` no longer lets a typed "999 sold" outrank real orders
 *   · the grid's tabs are the owner's categories in his order (or the featured
 *     ones), each tab is that category's own shelf, "All" spans the tabs
 *   · AUTO / MANUAL / AUTO_FILL do what the admin screen says they do
 *   · the settings sanitiser refuses what the storefront could not render
 *
 * SAFETY, because this touches a live database:
 *   · everything it makes is prefixed ZZBESTTEST and removed before AND after
 *   · the badge rules and the section's settings are read first and put back
 *     exactly as they were, and a final recompute leaves every real badge as
 *     the rules say it should be
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { MerchService, MERCH_DEFAULTS } from '../products/merch';
import { LayoutService } from '../storefront/layout';
import { StorefrontSettingsService } from '../storefront/banners';
import { ShopCatalogService, productRowQuery } from './catalog';
import { ShopService } from './shop';

const TAG = 'ZZBESTTEST';
const tag = TAG.toLowerCase();

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

const slugsOf = (items: { slug: string }[]) => items.map((i) => i.slug.replace(`${tag}-`, '')).join(',');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const merch = app.get(MerchService);
  const layout = app.get(LayoutService);
  const settings = app.get(StorefrontSettingsService);
  const catalog = app.get(ShopCatalogService);
  const shop = app.get(ShopService);

  const cleanup = async () => {
    const custs = await prisma.customer.findMany({ where: { phone: { startsWith: TAG } }, select: { id: true } });
    const custIds = custs.map((c) => c.id);
    const ords = await prisma.order.findMany({
      where: { OR: [{ orderNo: { startsWith: TAG } }, { customerId: { in: custIds } }] },
      select: { id: true },
    });
    const orderIds = ords.map((o) => o.id);
    if (orderIds.length) {
      await prisma.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.activityEvent.deleteMany({ where: { entityId: { in: orderIds } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    const prods = await prisma.product.findMany({ where: { slug: { startsWith: tag } }, select: { id: true } });
    await prisma.product.deleteMany({ where: { id: { in: prods.map((p) => p.id) } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: tag } } });
    await prisma.recipient.deleteMany({ where: { customerId: { in: custIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: custIds } } });
    return { orders: orderIds.length, products: prods.length };
  };

  // what is put back at the end, whatever happens in between
  const rulesBefore = await merch.rules();
  const sectionBefore = await prisma.pageSection.findUnique({
    where: { page_key: { page: 'home', key: 'bestsellers' } },
    select: { config: true },
  });
  const settingsBefore = await settings.get();

  const restore = async () => {
    await prisma.pageSection.update({
      where: { page_key: { page: 'home', key: 'bestsellers' } },
      data: { config: (sectionBefore?.config ?? {}) as object },
    });
    await settings.update({ announcementAuto: settingsBefore.announcementAuto });
    await merch.saveRules(rulesBefore); // recomputes too
  };

  try {
    console.log('=== 0. clearing anything a previous run left behind ===');
    console.log(JSON.stringify(await cleanup()));

    const channel = await prisma.channel.findFirst({ where: { deletedAt: null, isActive: true } });
    if (!channel) throw new Error('seed at least one channel first');

    /*  The defaults, so the expectations below do not depend on whatever the
        owner has the rules set to today: 10%, floor 3, at least 3 sales.  */
    await merch.saveRules(MERCH_DEFAULTS);
    const MIN = MERCH_DEFAULTS.bestSellerMinSales;

    const customer = await prisma.customer.create({ data: { name: `${TAG} Buyer`, phone: `${TAG}-01` } });
    const catA = await prisma.category.create({
      data: { name: `${TAG} Alpha`, slug: `${tag}-a`, isFeatured: true, isActive: true, sortOrder: 900 },
    });
    const catB = await prisma.category.create({
      data: { name: `${TAG} Beta`, slug: `${tag}-b`, isFeatured: false, isActive: true, sortOrder: 901 },
    });

    const mk = (slug: string, categoryId: string, extra: Record<string, unknown> = {}) =>
      prisma.product.create({
        data: {
          name: `${TAG} ${slug}`, slug: `${tag}-${slug}`, isPublished: true,
          categoryId, productType: 'READYMADE', zone: 'NATIONWIDE', natureType: 'ARTIFICIAL',
          costPaisa: 100, sellingPricePaisa: 1000, ...extra,
        } as never,
      });
    // created in this order on purpose — "newest first" is one of the tie-breaks tested
    const a1 = await mk('a1', catA.id);
    const a2 = await mk('a2', catA.id);
    const a3 = await mk('a3', catA.id);
    const a4 = await mk('a4', catA.id, { salesCount: 999 }); // the typed figure
    const a5 = await mk('a5', catA.id);
    const b1 = await mk('b1', catB.id);
    const b2 = await mk('b2', catB.id);
    const b3 = await mk('b3', catB.id);

    let n = 0;
    const sold = (productId: string, qty: number, o: { counter?: boolean; daysAgo?: number } = {}) =>
      prisma.order.create({
        data: {
          orderNo: `${TAG}-${++n}`,
          channelId: channel.id,
          customerId: customer.id,
          zone: 'DHAKA',
          senderName: customer.name,
          senderPhone: customer.phone,
          address: 'selftest',
          fulfillmentType: o.counter ? 'COUNTER' : 'DELIVERY',
          deliveryStatus: 'delivered',
          placedAt: new Date(Date.now() - (o.daysAgo ?? 0) * 24 * 60 * 60 * 1000),
          totalPaisa: 1000 * qty,
          paidPaisa: 1000 * qty,
          duePaisa: 0,
          lines: {
            create: [{ productId, name: 'selftest', productType: 'READYMADE', qty, unitPaisa: 1000, linePaisa: 1000 * qty }],
          },
        } as never,
      });

    await sold(a1.id, MIN + 7);
    await sold(a2.id, MIN + 2);
    await sold(a3.id, MIN);
    await sold(a4.id, 50, { counter: true }); // the counter does not vote
    await sold(a5.id, 20, { daysAgo: MERCH_DEFAULTS.bestSellerDays + 30 }); // outside the window
    await sold(b1.id, MIN + 4);
    await sold(b2.id, MIN + 1);

    /* ---------------------------------------------------------------- 1 */
    console.log('\n=== 1. recompute stores the window sales beside the badge ===');
    const result = await merch.recompute();
    ok('recompute reports the rows whose window sales changed', result.salesUpdated >= 5, `salesUpdated=${result.salesUpdated}`);

    const after = await prisma.product.findMany({
      where: { slug: { startsWith: tag } },
      select: { slug: true, isBestSeller: true, bestSellerSales: true, salesCount: true, updatedAt: true },
    });
    const of = (slug: string) => after.find((p) => p.slug === `${tag}-${slug}`)!;
    ok('a1 carries its delivered quantity', of('a1').bestSellerSales === MIN + 7, `${of('a1').bestSellerSales}`);
    ok('a4: a typed salesCount of 999 and a counter sale of 50 count for nothing', of('a4').bestSellerSales === 0 && of('a4').salesCount === 999);
    ok('a5: a delivery outside the window counts for nothing', of('a5').bestSellerSales === 0);
    ok('badges: a1 a2 a3 b1 b2 earned it', ['a1', 'a2', 'a3', 'b1', 'b2'].every((s) => of(s).isBestSeller));
    ok('badges: a4 a5 b3 did not', ['a4', 'a5', 'b3'].every((s) => !of(s).isBestSeller));
    /*  One more sale for a1: the badge is already on, so the only thing the
        recompute has to write is the figure — and that write must not make
        the product look edited.  */
    await sold(a1.id, 1);
    await merch.recompute();
    const a1Again = await prisma.product.findUnique({ where: { id: a1.id }, select: { bestSellerSales: true, updatedAt: true } });
    ok('a later sale moves the figure', a1Again?.bestSellerSales === MIN + 8, `${a1Again?.bestSellerSales}`);
    ok('writing the window figure did not touch updatedAt', a1Again?.updatedAt.getTime() === of('a1').updatedAt.getTime());

    /* ---------------------------------------------------------------- 2 */
    console.log('\n=== 2. the product list: best=1 / sort=best / popular ===');
    const bestA = await catalog.products({ category: `${tag}-a`, best: '1', sort: 'best', zone: 'NATIONWIDE' });
    ok('best=1 in category A is the three badge holders, ranked by window sales', slugsOf(bestA.items) === 'a1,a2,a3', slugsOf(bestA.items));
    const popA = await catalog.products({ category: `${tag}-a`, sort: 'popular', zone: 'NATIONWIDE' });
    ok('popular: badge holders first by real sales, then newest — the typed 999 does not lead', slugsOf(popA.items) === 'a1,a2,a3,a5,a4', slugsOf(popA.items));
    ok('productRowQuery: a "best sellers" row asks for the badge, ranked by it',
      JSON.stringify(productRowQuery({ rule: 'bestseller', count: 3 })) === JSON.stringify({ best: '1', speed: undefined, sort: 'best', limit: '3' }));
    ok('productRowQuery: an express row keeps the speed filter and the popular order',
      JSON.stringify(productRowQuery({ rule: 'express', count: 99 })) === JSON.stringify({ best: undefined, speed: 'express', sort: 'popular', limit: '12' }));

    /* ---------------------------------------------------------------- 3 */
    console.log('\n=== 3. the homepage grid — tabs from the owner, a shelf per tab ===');
    await layout.updateSettings('home', 'bestsellers', { mode: 'AUTO', categories: [`${tag}-b`, `${tag}-a`], perTab: 8, products: [] });
    let grid = await catalog.homeBestSellers('NATIONWIDE');
    ok('tabs are All + the chosen categories, in the owner\'s order', grid.tabs.map((t) => t.key).join(',') === `all,${tag}-b,${tag}-a`, grid.tabs.map((t) => t.key).join(','));
    ok('tab labels are the categories\' own names', grid.tabs[1].label === `${TAG} Beta` && grid.tabs[2].label === `${TAG} Alpha`);
    ok('the Beta tab is Beta\'s own badge holders', slugsOf(grid.tabs[1].items) === 'b1,b2', slugsOf(grid.tabs[1].items));
    ok('the Alpha tab is Alpha\'s own badge holders', slugsOf(grid.tabs[2].items) === 'a1,a2,a3', slugsOf(grid.tabs[2].items));
    ok('All spans the tab categories, ranked by window sales', slugsOf(grid.tabs[0].items) === 'a1,b1,a2,b2,a3', slugsOf(grid.tabs[0].items));
    ok('AUTO shows the earned badge only — five cards, not eight', grid.tabs[0].items.length === 5);
    ok('the button carries the defaults', grid.viewAll?.text === 'View All Products' && grid.viewAll?.href === '/products');

    await layout.updateSettings('home', 'bestsellers', { perTab: 2 });
    grid = await catalog.homeBestSellers('NATIONWIDE');
    ok('cards per tab is respected', slugsOf(grid.tabs[2].items) === 'a1,a2' && grid.tabs[0].items.length === 2);

    await layout.updateSettings('home', 'bestsellers', { categories: null, perTab: 8 });
    grid = await catalog.homeBestSellers('NATIONWIDE');
    ok('with no choice made, the tabs follow the featured categories', grid.tabs.some((t) => t.key === `${tag}-a`) && !grid.tabs.some((t) => t.key === `${tag}-b`));

    await layout.updateSettings('home', 'bestsellers', { categories: [`${tag}-b`], showViewAll: false, emptyTitle: 'Coming soon', allLabel: 'Everything' });
    grid = await catalog.homeBestSellers('NATIONWIDE');
    ok('a hidden button is not sent', grid.viewAll === null);
    ok('the empty-state words and the All label are the owner\'s', grid.empty.title === 'Coming soon' && grid.tabs[0].label === 'Everything');
    ok('All is restricted to the chosen tabs', slugsOf(grid.tabs[0].items) === 'b1,b2', slugsOf(grid.tabs[0].items));

    /* ---------------------------------------------------------------- 4 */
    console.log('\n=== 4. MANUAL and AUTO_FILL ===');
    await layout.updateSettings('home', 'bestsellers', {
      mode: 'MANUAL', categories: [`${tag}-a`, `${tag}-b`], perTab: 8,
      products: [`${tag}-a5`, `${tag}-b3`, `${tag}-a2`, 'no-such-product'],
    });
    grid = await catalog.homeBestSellers('NATIONWIDE');
    ok('MANUAL: All is the owner\'s list in his order, badge or no badge; an unknown slug leaves', slugsOf(grid.tabs[0].items) === 'a5,b3,a2', slugsOf(grid.tabs[0].items));
    ok('MANUAL: a tab shows the picks from its own category', slugsOf(grid.tabs[1].items) === 'a5,a2' && slugsOf(grid.tabs[2].items) === 'b3');

    await layout.updateSettings('home', 'bestsellers', { mode: 'MANUAL', products: [] });
    grid = await catalog.homeBestSellers('NATIONWIDE');
    ok('MANUAL with nothing picked yet still fills itself automatically', slugsOf(grid.tabs[1].items) === 'a1,a2,a3');

    await layout.updateSettings('home', 'bestsellers', { mode: 'AUTO_FILL', categories: [`${tag}-a`], perTab: 4 });
    grid = await catalog.homeBestSellers('NATIONWIDE');
    ok('AUTO_FILL: badge holders first, then the rest by real sales then newest', slugsOf(grid.tabs[1].items) === 'a1,a2,a3,a5', slugsOf(grid.tabs[1].items));

    /* ---------------------------------------------------------------- 5 */
    console.log('\n=== 5. the settings sanitiser ===');
    const clean = await layout.updateSettings('home', 'bestsellers', {
      mode: 'BOGUS', perTab: 99, viewAllHref: 'https://elsewhere.example', categories: ['bad slug!', `${tag}-a`], allLabel: '',
    });
    ok('an unknown mode falls back to Automatic', clean.mode === 'AUTO');
    ok('cards per tab is capped at 12', clean.perTab === 12);
    ok('an outside link is refused — the shop\'s own paths only', clean.viewAllHref === '/products');
    ok('a malformed category slug is dropped', JSON.stringify(clean.categories) === JSON.stringify([`${tag}-a`]));
    ok('a blank All label falls back', clean.allLabel === 'All Products');
    let refused = false;
    try { await layout.updateSettings('home', 'hero', { anything: 1 }); } catch { refused = true; }
    ok('a section without settings refuses to be written', refused);
    const list = await layout.list('home');
    ok('the admin list marks which sections have settings', list.find((r) => r.key === 'bestsellers')?.hasSettings === true && list.find((r) => r.key === 'hero')?.hasSettings === false);
    const forShop = await layout.forStorefront('home');
    const blog = forShop.find((r) => r.key === 'blog');
    ok('the storefront gets the defaults merged in', blog?.config.count === 3 && Array.isArray(blog?.config.slugs));

    /* ---------------------------------------------------------------- 6 */
    console.log('\n=== 6. the card wording and the announcement setting ===');
    const words = await shop.cardWording();
    ok('card wording answers the four pills, string or null', ['express', 'sameDay', 'midnight', 'courier'].every((k) => k in words && (words[k as keyof typeof words] === null || typeof words[k as keyof typeof words] === 'string')), JSON.stringify(words));
    await settings.update({ announcementAuto: false });
    ok('the announcement setting reaches the storefront', (await shop.banners()).announcementAuto === false);
    await settings.update({ announcementAuto: true });
    ok('…and back', (await shop.banners()).announcementAuto === true);
  } catch (e) {
    fail += 1;
    failures.push(`crashed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    console.log('  CRASH ', e);
  } finally {
    console.log('\n=== cleaning up and putting the rules and settings back ===');
    try {
      console.log(JSON.stringify(await cleanup()));
      await restore();
    } catch (e) {
      console.log('  cleanup failed', e);
    }
    await app.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

void main();
