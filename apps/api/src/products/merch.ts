import { Body, Controller, Get, Injectable, Module, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DAY_MS, startOfBdDay } from '../common/bd-day';

/*  ── DEC-PRD-050 · Best seller and New arrival ──────────────────────────────

    Until 24 August 2026 both badges were checkboxes on the product form. A
    checkbox makes the shop's own claim only as true as the last person who
    remembered to untick it, and "Best seller" on a bouquet nobody has bought
    is the same offence as an invented review.

    The owner's rules, in his words:

    · 90 days, not lifetime — otherwise last Eid holds the badge all year and
      a genuinely better bouquet can never climb past it.
    · The scope is the product's own TOP-LEVEL category. Shop-wide, every
      badge lands on fresh flowers and a teddy bear can never earn one; by
      sub-category, a shelf of four products badges all four.
    · A percentage, and the percentage alone decides the count. Shown a
      "top 10, capped at 12", he refused the cap outright: he does not accept
      a number that locks at twelve, and whatever the percentage works out to
      is what gets the badge. So there is no ceiling. 10% of 500 is 50.
    · A floor, because 10% of a twelve-product category is one, and one is a
      fluke rather than a shelf. It only ever tops the list up, never trims it.
    · A minimum number of real sales, so the top of a quiet category is not
      whoever happened to sell twice.

    WHAT COUNTS AS A SALE. Delivered WEBSITE order lines only, by quantity.

    · Not `Product.salesCount`, which is a running total that includes the
      owner's typed `salesSeed` display figures (DEC-PRD-025) — seeding a
      bouquet with "1000 sold" to reassure a shopper must not also hand it a
      badge.
    · Not counter sales. The owner's call, 24 August 2026: the website's badge
      belongs to the website. See `soldInWindow()` for why that is now written
      into the query instead of being true by accident.

    A badge is a claim about what other customers did, and it is only allowed
    to be made out of things other customers actually did.

    WHY IT IS STORED. Three grids sort by `isBestSeller`, and an aggregate
    over a whole category cannot run once per card. So `recompute()` owns the
    column and nothing else writes it.

    WHY THERE IS NO CRON. The same reason `salesSeedAt` has none: a nightly
    job is a thing that quietly stops running with nobody noticing. Standing
    can only change when a sale completes, when the rules change or when a
    product is published, so it is recomputed at exactly those three moments,
    plus a button on the admin screen.

    NEW ARRIVAL IS NOT STORED. "New" is a date question and a stored answer to
    a date question is wrong from the day after it is written. `isNewNow()`
    below is the single rule, called at read time by both the storefront and
    the admin list.                                                          */

export type BadgeMode = 'AUTO' | 'ALWAYS' | 'NEVER';

export interface MerchRules {
  bestSellerDays: number;
  bestSellerPercent: number;
  bestSellerMinCount: number;
  bestSellerMinSales: number;
  newArrivalDays: number;
  lastComputedAt: Date | null;
}

export const MERCH_DEFAULTS: MerchRules = {
  bestSellerDays: 90,
  bestSellerPercent: 10,
  bestSellerMinCount: 3,
  bestSellerMinSales: 3,
  newArrivalDays: 21,
  lastComputedAt: null,
};

/**
 * Is this product "new" right now — the one rule, used everywhere.
 *
 * `publishedAt` and not `createdAt`: a bouquet drafted in March and put live
 * in August is new in August. Rows older than the field fall back to
 * `createdAt`, which is the closest true answer available for them.
 */
export function isNewNow(
  p: { publishedAt: Date | null; createdAt: Date; newArrivalMode: BadgeMode },
  days: number,
  now: Date = new Date(),
): boolean {
  if (p.newArrivalMode === 'ALWAYS') return true;
  if (p.newArrivalMode === 'NEVER') return false;
  const live = p.publishedAt ?? p.createdAt;
  /*  DHAKA DAYS, NOT A ROLLING 504 HOURS. Counted from `now` the badge fell
      off mid-afternoon, at whatever o'clock the product had been published
      21 days earlier - and on a UTC server that moment is not even the same
      Dhaka day. "New for 21 days" means 21 of the shop's days, so the window
      opens at the start of the Dhaka day 20 days back and the badge lives out
      its last day whole.  */
  return live.getTime() >= startOfBdDay(new Date(now.getTime() - Math.max(0, days - 1) * DAY_MS));
}

@Injectable()
export class MerchService {
  constructor(private readonly prisma: PrismaService) {}

  /** The rules row, created on first read so no seed script is required. */
  async rules(): Promise<MerchRules> {
    const row = await this.prisma.db.merchSetting.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    return {
      bestSellerDays: row.bestSellerDays,
      bestSellerPercent: row.bestSellerPercent,
      bestSellerMinCount: row.bestSellerMinCount,
      bestSellerMinSales: row.bestSellerMinSales,
      newArrivalDays: row.newArrivalDays,
      lastComputedAt: row.lastComputedAt,
    };
  }

  /**
   * Save the rules and immediately re-rank, because a percentage the owner
   * has just changed and cannot see the effect of is a screen he has to
   * trust rather than read.
   */
  async saveRules(dto: Partial<Omit<MerchRules, 'lastComputedAt'>>) {
    const clamp = (n: number | undefined, lo: number, hi: number, fallback: number) =>
      n == null || Number.isNaN(n) ? fallback : Math.min(hi, Math.max(lo, Math.round(n)));
    const now = await this.rules();
    await this.prisma.db.merchSetting.update({
      where: { id: 'singleton' },
      data: {
        /*  Bounds, not validation theatre: 0% badges nothing and 100% badges
            the whole shop, and both of those are a screen with a typo in it
            rather than a decision. 1–50 leaves the owner every number he
            asked for (10, 20) and a wide margin either side.  */
        bestSellerPercent: clamp(dto.bestSellerPercent, 1, 50, now.bestSellerPercent),
        bestSellerDays: clamp(dto.bestSellerDays, 7, 730, now.bestSellerDays),
        bestSellerMinCount: clamp(dto.bestSellerMinCount, 0, 50, now.bestSellerMinCount),
        bestSellerMinSales: clamp(dto.bestSellerMinSales, 1, 100, now.bestSellerMinSales),
        newArrivalDays: clamp(dto.newArrivalDays, 1, 180, now.newArrivalDays),
      },
    });
    return this.recompute();
  }

  /**
   * Re-rank every category and write `isBestSeller`.
   *
   * Never throws at its callers. It runs after a delivery and after a save,
   * and a ranking that could not be worked out must not take an order or a
   * product edit down with it.
   */
  async recomputeQuietly(): Promise<void> {
    try {
      await this.recompute();
    } catch {
      /*  Deliberately silent. The next sale, save or Recalculate press fixes
          it, and the badge being one order out of date harms nobody.  */
    }
  }

  /**
   * Real sales per product inside the window — quantity, from orders that
   * actually arrived.
   *
   * `placedAt` and not a delivery timestamp: an Order has no `deliveredAt` of
   * its own (the date lives on DeliveryAssignment, and a re-assigned parcel
   * has several rows). "Ordered within the window and did arrive" is the
   * honest reading, and the one a shopper would recognise.
   */
  private async soldInWindow(since: Date): Promise<Map<string, number>> {
    /*  The one predicate for "this was really sold", so the subtraction below
        can be taken against exactly the same set of lines.  */
    const soldOrder: Prisma.OrderWhereInput = {
      deletedAt: null,
      deliveryStatus: 'delivered',
      placedAt: { gte: since },
      /*  A CANCELLED SALE IS NOT A SALE.
          Only `deliveryStatus: 'delivered'` was asked, and Sales owns a
          second, separate column: an order cancelled AFTER the rider handed
          it over keeps `delivered` and turns `salesStatus` to `cancelled`.
          Those were counting towards the badge, which is a claim about what
          customers bought made partly out of orders that were unbought.  */
      salesStatus: { not: 'cancelled' },
    };
    const rows = await this.prisma.db.orderLine.groupBy({
      by: ['productId'],
      where: {
        deletedAt: null,
        productId: { not: null },
        order: {
          ...soldOrder,
          /*  ── THE COUNTER DOES NOT VOTE ─────────────────────────────
              Owner, 24 August 2026, asked outright whether a hundred of the
              same bouquet sold over the counter should earn the website's
              badge. His answer: the website's badge belongs to the website.

              The counter's customer is a different person making a different
              choice, and "Best seller" on a product page is a sentence about
              what the people browsing THAT page chose.

              ⚠️ Stated here rather than left to chance. It was already true
              by accident — DEC-POS-018 gives a counter line an `itemId` and
              no `productId`, so the filter above dropped them anyway. An
              accident is not a rule: the day one POS path starts writing a
              productId, the badge would quietly start counting walk-ins and
              nobody would know why the numbers moved.  */
          fulfillmentType: 'DELIVERY',
        },
      },
      _sum: { qty: true },
    });
    const sold = new Map(
      rows
        .filter((r): r is typeof r & { productId: string } => r.productId != null)
        .map((r) => [r.productId, r._sum.qty ?? 0]),
    );

    /*  AND GOODS THAT CAME BACK WERE NEVER SOLD.
        A bouquet delivered and then returned left the badge untouched, so a
        product could be "Best seller" on the strength of parcels the shop had
        already taken back and refunded.

        Returns owns this, and this is Returns' own reading of it: a line on a
        return that is neither rejected nor cancelled, which is the predicate
        `returns.service.ts` itself uses to work out how much of an order line
        has already come back. Scoped through the order line to the very same
        window and the same delivered, not-cancelled orders counted above, so
        the subtraction can never take away more than was counted.

        A REPLACEMENT is still subtracted: the goods came back, and the
        replacement that went out is not itself an order line anybody placed.
        Listed for the owner - see the note in the report.  */
    const returned = await this.prisma.db.salesReturnLine.groupBy({
      by: ['productId'],
      where: {
        deletedAt: null,
        productId: { not: null },
        /*  ⚠️ ONLY GOODS THAT HAVE ACTUALLY COME BACK.
            The `notIn: ['rejected','cancelled']` predicate borrowed from the
            Returns module counts DRAFTS on purpose - there it stops a
            half-built return double-claiming a line. Used here it would mean a
            staff member opening a return form for 40 units, never submitting
            it, and the product losing its Best seller badge that minute.  */
        return: { deletedAt: null, status: { in: ['approved', 'completed'] } },
        orderLine: { deletedAt: null, order: { ...soldOrder, fulfillmentType: 'DELIVERY' } },
      },
      _sum: { qty: true },
    });
    for (const r of returned) {
      if (!r.productId) continue;
      const net = (sold.get(r.productId) ?? 0) - (r._sum.qty ?? 0);
      /*  Never below zero: a return recorded against a line outside this
          window would otherwise push a product into negative sales and past
          `bestSellerMinSales` from the wrong side.  */
      if (net > 0) sold.set(r.productId, net);
      else sold.delete(r.productId);
    }
    return sold;
  }

  /*  THE WINDOW IS IN DHAKA DAYS (12 Sep 2026).
      `Date.now() - 90 * 86400000` is a rolling 2160 hours ending at whatever
      time of day the ranking happens to run, on a server that keeps UTC. Run
      at 09:00 Dhaka it dropped the first six hours of the 90th day, so the
      same 90 days gave two different answers depending on when the button was
      pressed. "The last 90 days" is 90 of the shop's days, ending tonight.  */
  private windowStart(days: number): Date {
    return new Date(startOfBdDay(new Date(Date.now() - Math.max(0, days - 1) * DAY_MS)));
  }

  /*  ONE SCOPE, WALKED TO THE REAL ROOT (12 Sep 2026).
      The doc block above promises the product's TOP-LEVEL category, and
      neither side delivered it: `recompute` keyed on `category.parentId ??
      categoryId`, which is one level up and not the top, while `preview`
      listed only `parentId: null` categories and matched the same one-level
      key against them. A product three levels deep (Gifts > Flowers > Roses >
      Red Roses) was therefore ranked inside "Roses" by one and shown under
      nothing at all by the other - the owner's screen and the badges it
      explained were computed by two different rules. Both now call this.

      The RAW client on purpose: a soft-deleted parent still shapes the tree,
      and stopping the walk at it would file a product under a middle category
      again. A cycle - which the tree should not have and a bad edit can
      create - stops the walk rather than hanging the ranking.  */
  private async rootCategoryReader(): Promise<(categoryId: string) => string> {
    const cats = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const parentOf = new Map(cats.map((c) => [c.id, c.parentId]));
    return (categoryId: string): string => {
      let cur = categoryId;
      const seen = new Set<string>([categoryId]);
      for (;;) {
        const up = parentOf.get(cur);
        if (!up || seen.has(up)) return cur;
        seen.add(up);
        cur = up;
      }
    };
  }

  /** Products filed under their top-level category — the badge's scope. */
  private async groupByScope<T extends { categoryId: string }>(rows: T[]) {
    const rootOf = await this.rootCategoryReader();
    const byScope = new Map<string, T[]>();
    for (const p of rows) {
      const key = rootOf(p.categoryId);
      const list = byScope.get(key);
      if (list) list.push(p);
      else byScope.set(key, [p]);
    }
    return byScope;
  }

  async recompute() {
    const rules = await this.rules();
    const since = this.windowStart(rules.bestSellerDays);

    const soldBy = await this.soldInWindow(since);

    const products = await this.prisma.db.product.findMany({
      where: { isPublished: true, deletedAt: null },
      select: {
        id: true,
        isBestSeller: true,
        bestSellerSales: true,
        bestSellerMode: true,
        categoryId: true,
      },
    });

    /*  Scope = the TOP-LEVEL category. A product filed under Roses competes
        with everything under Fresh Flowers, not with the three other roses.
        The walk to the real root, and the grouping itself, are shared with
        `preview()` - see `groupByScope`.  */
    const byScope = await this.groupByScope(products);

    const winners = new Set<string>();
    for (const [, group] of byScope) {
      /*  The percentage is of the WHOLE category, not of the products that
          happen to have sold. "Top 10% of Fresh Flowers" has to mean the same
          thing in a quiet month as in a busy one.  */
      const target = Math.max(
        rules.bestSellerMinCount,
        Math.ceil((group.length * rules.bestSellerPercent) / 100),
      );
      const ranked = group
        .map((p) => ({ id: p.id, qty: soldBy.get(p.id) ?? 0 }))
        .filter((p) => p.qty >= rules.bestSellerMinSales)
        .sort((a, b) => b.qty - a.qty);
      /*  Fewer eligible than the target simply means fewer badges. The floor
          tops the list up out of products that qualify; it never invents one
          out of a product that has not sold.  */
      for (const r of ranked.slice(0, target)) winners.add(r.id);
    }

    /*  The owner's override has the last word — the rule decides only where
        he has left it on AUTO.  */
    const wantOn: string[] = [];
    const wantOff: string[] = [];
    for (const p of products) {
      const on =
        p.bestSellerMode === 'ALWAYS'
          ? true
          : p.bestSellerMode === 'NEVER'
            ? false
            : winners.has(p.id);
      if (on !== p.isBestSeller) (on ? wantOn : wantOff).push(p.id);
    }

    /*  Only the rows that actually change are written, so `updatedAt` still
        means "somebody edited this" rather than "the ranking ran".  */
    if (wantOn.length > 0)
      await this.prisma.db.product.updateMany({
        where: { id: { in: wantOn } },
        data: { isBestSeller: true },
      });
    if (wantOff.length > 0)
      await this.prisma.db.product.updateMany({
        where: { id: { in: wantOff } },
        data: { isBestSeller: false },
      });

    /*  The window figure itself is stored beside the badge, so the storefront
        can ORDER a best-seller row by it in SQL — "best seller" says which
        products, this says which comes first. Same moments, same rule, and
        never `salesCount`. Written with raw SQL so `updatedAt` keeps meaning
        "somebody edited this", exactly as the two writes above take care of.  */
    const salesChanged = products
      .map((p) => ({ id: p.id, qty: soldBy.get(p.id) ?? 0 }))
      .filter((p, i) => p.qty !== products[i].bestSellerSales);
    if (salesChanged.length > 0)
      await this.prisma.$executeRaw`
        UPDATE "Product" AS p SET "bestSellerSales" = v.qty
        FROM (VALUES ${Prisma.join(salesChanged.map((c) => Prisma.sql`(${c.id}::text, ${c.qty}::int)`))}) AS v(id, qty)
        WHERE p.id = v.id`;

    await this.prisma.db.merchSetting.update({
      where: { id: 'singleton' },
      data: { lastComputedAt: new Date() },
    });

    return {
      ...rules,
      lastComputedAt: new Date(),
      categories: byScope.size,
      products: products.length,
      bestSellers: [...winners].length,
      changed: wantOn.length + wantOff.length,
      salesUpdated: salesChanged.length,
    };
  }

  /**
   * What the admin screen shows under the numbers: for each top-level
   * category, how many products it holds, how many the percentage works out
   * to, and how many actually qualified. This is the answer to "10% of 500 —
   * then what happens", shown rather than explained.
   */
  async preview() {
    const rules = await this.rules();
    const since = this.windowStart(rules.bestSellerDays);
    const soldBy = await this.soldInWindow(since);

    const products = await this.prisma.db.product.findMany({
      where: { isPublished: true, deletedAt: null },
      select: {
        id: true,
        categoryId: true,
        bestSellerMode: true,
      },
    });

    /*  THE SCREEN IS BUILT FROM THE GROUPING, NOT FROM A SECOND GUESS AT
        IT (12 Sep 2026). This used to list the `parentId: null` categories and
        then filter the products against a one-level-up key of its own, so a
        product three levels deep landed in no row here while `recompute` gave
        it a badge inside its middle parent - the screen explaining the badges
        and the badges themselves disagreed. One grouping, one answer; the
        names are looked up afterwards, for whatever roots the products
        actually have.  */
    const byScope = await this.groupByScope(products);
    const names = new Map(
      (
        await this.prisma.db.category.findMany({
          where: { id: { in: [...byScope.keys()] } },
          select: { id: true, name: true },
        })
      ).map((c) => [c.id, c.name]),
    );

    return {
      rules,
      rows: [...byScope.entries()]
        .map(([id, group]) => {
          const target = Math.max(
            rules.bestSellerMinCount,
            Math.ceil((group.length * rules.bestSellerPercent) / 100),
          );
          const eligible = group.filter(
            (p) => (soldBy.get(p.id) ?? 0) >= rules.bestSellerMinSales,
          ).length;
          return {
            id,
            /*  A root that is itself soft-deleted still holds products and
                still gets a row; it is named rather than left blank, because a
                row the owner cannot name is a row he cannot act on.  */
            name: names.get(id) ?? 'Deleted category',
            products: group.length,
            /*  What the percentage asks for … */
            target,
            /*  … and what the shop can actually fill, which is the smaller of
                the two whenever trade has been quiet.  */
            earned: Math.min(target, eligible),
            eligible,
            pinned: group.filter((p) => p.bestSellerMode === 'ALWAYS').length,
            blocked: group.filter((p) => p.bestSellerMode === 'NEVER').length,
          };
        })
        .filter((r) => r.products > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}

@Controller('products/badge-rules')
export class MerchController {
  constructor(private readonly svc: MerchService) {}

  @Get()
  get() {
    return this.svc.preview();
  }

  @Patch()
  save(@Body() dto: Partial<Omit<MerchRules, 'lastComputedAt'>>) {
    return this.svc.saveRules(dto);
  }

  @Post('recompute')
  recompute() {
    return this.svc.recompute();
  }
}

@Module({
  providers: [MerchService],
  controllers: [MerchController],
  exports: [MerchService],
})
export class MerchModule {}
