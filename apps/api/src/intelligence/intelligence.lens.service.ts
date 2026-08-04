import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { FinanceReportsService } from '../finance/finance-reports.service';
import { InventoryService } from '../inventory/inventory.service';
import { DeliveryAnalyticsService } from '../delivery/delivery-analytics.service';
import { ProductsService } from '../products/products.service';
import { PurchasesService } from '../purchases/purchases.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { EmployeesService } from '../hr/employees.service';
import { CampaignsService } from '../marketing/campaigns.service';

/*  ANALYTICS LENSES — the whole business, one angle at a time.

    The owner's shape: a row of lenses across the top, and clicking one shows
    that part of the business in charts. Sales, Delivery, Inventory, Products,
    Customers, Finance, Marketing, Purchases, Staff.

    ONE SHAPE FOR ALL NINE. Every lens returns the same `{ cards, charts }`
    structure, so a single renderer draws any of them and a tenth lens is a
    method, not a screen. The alternative — nine bespoke payloads and nine
    bespoke screens — is how an analytics page becomes the thing nobody dares
    change.

    INT-R01 IS THE WHOLE DIFFICULTY HERE. This file reads from NINE modules, so
    it is the single most likely place in the system to grow a second source of
    truth. The rule: every figure is ASKED of the module that owns it.

      Sales & Finance    → FinanceService / FinanceReportsService
      Delivery           → DeliveryAnalyticsService  (built in Delivery, 29 Jul,
                           replacing the invented 94 % from deliveryDemo.ts)
      Inventory          → InventoryService
      Products           → ProductsService
      Purchases          → PurchasesService · SuppliersService
      Staff              → EmployeesService
      Marketing          → CampaignsService

    Only ONE lens counts anything itself — Customers — because no module
    produces customer aggregates, so counting them here is not a second source,
    it is the only one. That exception is marked where it happens.

    AND THE HONESTY RULE THROUGHOUT: a figure that cannot be worked out returns
    null and says why. It never returns 0. On an empty set of books — which is
    exactly where this shop is today — zero everywhere would make a broken lens
    and a working one look identical.
*/

export type LensKey =
  | 'sales' | 'delivery' | 'inventory' | 'products' | 'customers'
  | 'finance' | 'marketing' | 'purchases' | 'staff';

export type RangeKey = 'today' | '30d' | 'month' | 'year';

export type Unit = 'paisa' | 'count' | 'bp' | 'days' | 'minutes';

export interface Card {
  key: string;
  label: string;
  /** null = not knowable. The screen shows "—", never 0. */
  value: number | null;
  unit: Unit;
  hint?: string;
}

export type Chart =
  | { kind: 'line'; key: string; title: string; note?: string; unit: Unit; points: { label: string; value: number }[] }
  | { kind: 'bar'; key: string; title: string; note?: string; unit: Unit; rows: { label: string; value: number; sub?: string }[] }
  | { kind: 'split'; key: string; title: string; note?: string; unit: Unit; parts: { label: string; value: number }[] };

export interface LensResult {
  lens: LensKey;
  label: string;
  range: RangeKey;
  /** how much of the chosen period this lens could actually use */
  rangeMode: RangeMode;
  /** said on screen, so the period buttons cannot mislead */
  rangeNote: string;
  from: string;
  to: string;
  cards: Card[];
  charts: Chart[];
  /** shown at the top when the lens has nothing to say yet */
  emptyNote: string | null;
}

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/*  HOW MUCH OF THE CHOSEN PERIOD A LENS CAN ACTUALLY HONOUR.

    This exists because the first version offered four period buttons on every
    lens and FOUR OF THE NINE ignored them completely — Finance, Marketing,
    Purchases and Staff answered identically whether you asked for today or the
    whole year. Two more, Inventory and Products, used only the LENGTH of the
    period and always ended at today.

    A control that changes nothing is worse than no control: it does not merely
    fail to help, it tells the reader the number means something it does not.
    The Reports centre already refused to do this; Analytics was doing it.

    So each lens now declares the truth, and the screen says it out loud:

      full     — from and to are honoured exactly
      lookback — only the LENGTH is used; the window always ends today, because
                 the owning service takes a number of days, not a date range
      none     — the lens is a snapshot of how things stand right now

    `lookback` and `none` are not laziness — they are the owning modules'
    signatures. Reaching around them to compute a ranged figure here would be a
    second source of truth, which is the one thing this module may not do. */
export type RangeMode = 'full' | 'lookback' | 'none';

export const LENSES: { key: LensKey; label: string; rangeMode: RangeMode }[] = [
  { key: 'sales', label: 'Sales', rangeMode: 'full' },
  { key: 'delivery', label: 'Delivery', rangeMode: 'full' },
  /*  Both were 'lookback' for one afternoon, because their services only took
      a day count. That was fixed at the source instead of documented for ever —
      see ProductsService.analytics and InventoryService.issueReport. */
  { key: 'inventory', label: 'Inventory', rangeMode: 'full' },
  { key: 'products', label: 'Products', rangeMode: 'full' },
  { key: 'customers', label: 'Customers', rangeMode: 'full' },
  { key: 'finance', label: 'Finance', rangeMode: 'none' },
  { key: 'marketing', label: 'Marketing', rangeMode: 'none' },
  { key: 'purchases', label: 'Purchases', rangeMode: 'none' },
  { key: 'staff', label: 'Staff', rangeMode: 'none' },
];

@Injectable()
export class IntelligenceLensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly reports: FinanceReportsService,
    private readonly inventory: InventoryService,
    private readonly delivery: DeliveryAnalyticsService,
    private readonly products: ProductsService,
    private readonly purchases: PurchasesService,
    private readonly suppliers: SuppliersService,
    private readonly employees: EmployeesService,
    private readonly campaigns: CampaignsService,
  ) {}

  /*  Ranges are resolved in DHAKA time, not UTC. Between midnight and 6 AM the
      two disagree, and on the 1st of a month that is the difference between
      "this month" meaning the new month and the old one. */
  private range(key: RangeKey): { from: Date; to: Date; days: number } {
    const now = new Date();
    const bd = new Date(now.getTime() + BD_OFFSET_MS);
    const dayStart = new Date(Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate()) - BD_OFFSET_MS);
    switch (key) {
      case 'today':
        return { from: dayStart, to: now, days: 1 };
      case 'month':
        return { from: new Date(Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), 1) - BD_OFFSET_MS), to: now, days: bd.getUTCDate() };
      case 'year':
        return { from: new Date(Date.UTC(bd.getUTCFullYear(), 0, 1) - BD_OFFSET_MS), to: now, days: 365 };
      case '30d':
      default:
        return { from: new Date(now.getTime() - 30 * DAY_MS), to: now, days: 30 };
    }
  }

  async lens(key: LensKey, rangeKey: RangeKey): Promise<LensResult> {
    const meta = LENSES.find((l) => l.key === key);
    if (!meta) throw new BadRequestException(`No such lens: ${key}`);
    const { from, to, days } = this.range(rangeKey);

    const body = await this.build(key, from, to, days);
    const rangeNote =
      meta.rangeMode === 'full'
        ? ''
        : meta.rangeMode === 'lookback'
          ? `${meta.label} counts back a number of days from today, so only the LENGTH of the period is used — this is the last ${days} days.`
          : `${meta.label} shows how things stand right now. The period buttons do not change these figures.`;

    return {
      lens: key, label: meta.label, range: rangeKey,
      rangeMode: meta.rangeMode, rangeNote,
      from: from.toISOString(), to: to.toISOString(),
      ...body,
    };
  }

  private async build(key: LensKey, from: Date, to: Date, days: number) {
    switch (key) {
      case 'sales': return this.sales(from, to);
      case 'delivery': return this.deliveryLens(from, to);
      case 'inventory': return this.inventoryLens(from, to);
      case 'products': return this.productsLens(from, to);
      case 'customers': return this.customersLens(from, to);
      case 'finance': return this.financeLens();
      case 'marketing': return this.marketingLens();
      case 'purchases': return this.purchasesLens();
      case 'staff': return this.staffLens();
    }
  }

  /*  The one helper that keeps every lens honest: if nothing at all happened,
      say so in words instead of drawing nine flat charts that cannot be told
      apart from nine broken ones. */
  private empty(condition: boolean, note: string) {
    return condition ? note : null;
  }

  /* ==================== 1. SALES ==================== */

  private async sales(from: Date, to: Date) {
    const [pnl, orders, breakdown, snaps] = await Promise.all([
      this.reports.profitAndLoss(from.toISOString(), to.toISOString()),
      this.prisma.db.order.findMany({
        where: { createdAt: { gte: from, lte: to }, salesStatus: { not: 'cancelled' } },
        select: { totalPaisa: true, channelId: true, salesStatus: true, createdAt: true },
      }),
      this.reports.salesBreakdown(from.toISOString(), to.toISOString()),
      this.prisma.db.dailySnapshot.findMany({
        where: { onDate: { gte: from, lte: to } },
        orderBy: { onDate: 'asc' },
        select: { onDate: true, revenuePaisa: true, ordersCount: true },
      }),
    ]);

    const count = orders.length;
    const aov = count > 0 ? Math.round(orders.reduce((n, o) => n + o.totalPaisa, 0) / count) : null;

    const byStatus = new Map<string, number>();
    for (const o of orders) byStatus.set(o.salesStatus, (byStatus.get(o.salesStatus) ?? 0) + 1);

    const cards: Card[] = [
      { key: 'revenue', label: 'Revenue', value: pnl.totalIncomePaisa, unit: 'paisa', hint: 'From the ledger, via Finance' },
      { key: 'orders', label: 'Orders', value: count, unit: 'count' },
      { key: 'aov', label: 'Average order', value: aov, unit: 'paisa' },
      { key: 'margin', label: 'Gross margin', value: pnl.totalIncomePaisa > 0 ? pnl.grossMarginBp : null, unit: 'bp' },
    ];

    const charts: Chart[] = [
      { kind: 'line', key: 'revenueTrend', title: 'Revenue, day by day', note: 'From the nightly record', unit: 'paisa',
        points: snaps.map((s) => ({ label: s.onDate.toISOString().slice(5, 10), value: s.revenuePaisa })) },
      { kind: 'bar', key: 'byChannel', title: 'Where the orders came from', unit: 'paisa',
        rows: breakdown.channels.map((c) => ({ label: c.name, value: c.salesPaisa })) },
      { kind: 'bar', key: 'byZone', title: 'Where they went', unit: 'paisa',
        rows: breakdown.zones.map((z) => ({ label: z.name, value: z.salesPaisa })) },
      { kind: 'bar', key: 'byStatus', title: 'Order status', unit: 'count',
        rows: [...byStatus.entries()].map(([label, value]) => ({ label, value })) },
    ];

    return { cards, charts, emptyNote: this.empty(count === 0, 'No orders in this period. Every figure below is genuinely zero, not missing.') };
  }

  /* ==================== 2. DELIVERY ==================== */

  /*  Read from Delivery, never computed here. The verdict on whether a parcel
      was on time belongs to the module that carried it. */
  private async deliveryLens(from: Date, to: Date) {
    const a = await this.delivery.analytics(from, to);

    const cards: Card[] = [
      { key: 'delivered', label: 'Delivered', value: a.delivered, unit: 'count' },
      { key: 'onTime', label: 'On time', value: a.onTimeBp, unit: 'bp',
        hint: a.measurable === 0
          ? 'No delivery in this period has a promised time yet'
          : `judged on ${a.measurable} of ${a.delivered} · ${a.unmeasurable} have no promised time` },
      { key: 'failed', label: 'Failed', value: a.failed, unit: 'count' },
      { key: 'avgTime', label: 'Average time out', value: a.avgMinutesToDeliver, unit: 'minutes' },
      { key: 'margin', label: 'Delivery margin', value: a.marginPaisa, unit: 'paisa',
        hint: 'What customers paid, minus what we paid carriers — it can be negative' },
    ];

    const charts: Chart[] = [
      { kind: 'line', key: 'deliveredTrend', title: 'Deliveries per day', unit: 'count',
        points: a.daily.map((d) => ({ label: d.onDate.slice(5), value: d.delivered })) },
      { kind: 'bar', key: 'byZone', title: 'By zone', unit: 'count',
        rows: a.byZone.map((z) => ({ label: z.name, value: z.delivered,
          sub: z.onTimeBp === null ? 'no promised times' : `${(z.onTimeBp / 100).toFixed(1)}% on time` })) },
      { kind: 'bar', key: 'byCarrier', title: 'By rider and courier', unit: 'count',
        rows: a.byCarrier.map((c) => ({ label: c.name, value: c.delivered,
          sub: c.onTimeBp === null ? 'no promised times' : `${(c.onTimeBp / 100).toFixed(1)}% on time` })) },
      { kind: 'split', key: 'chargeVsCost', title: 'Charged vs what it cost us', unit: 'paisa',
        parts: [{ label: 'Charged to customers', value: a.chargedPaisa }, { label: 'Paid to carriers', value: a.costPaisa }] },
    ];

    return { cards, charts, emptyNote: this.empty(
      a.delivered === 0,
      'Nothing was delivered in this period.',
    ) };
  }

  /* ==================== 3. INVENTORY ==================== */

  private async inventoryLens(from: Date, to: Date) {
    const [ov, issues] = await Promise.all([
      /*  overview() is a "right now" figure by nature — stock value and low
          stock have no date range, and pretending otherwise would be the same
          lie this whole review was about. The wastage series IS ranged. */
      this.inventory.overview(),
      this.inventory.issueReport({ from, to }),
    ]);

    const cards: Card[] = [
      { key: 'value', label: 'Stock value', value: ov.kpis.totalValuePaisa, unit: 'paisa', hint: 'At AVCO' },
      { key: 'items', label: 'Items tracked', value: ov.kpis.itemCount, unit: 'count' },
      { key: 'low', label: 'Running low', value: ov.needsAttention.lowCount, unit: 'count' },
      { key: 'negative', label: 'Negative stock', value: ov.needsAttention.negativeCount, unit: 'count' },
      { key: 'wastage', label: 'Wastage this month', value: ov.kpis.wastageMonthPaisa, unit: 'paisa' },
    ];

    const byDay = issues.series;
    const charts: Chart[] = [
      { kind: 'line', key: 'wastageTrend', title: 'Wastage, day by day', note: 'Flowers that were not sold in time', unit: 'paisa',
        points: byDay.map((d) => ({ label: d.date.slice(5), value: d.wastagePaisa })) },
      { kind: 'bar', key: 'expiring', title: 'Expiring soonest', unit: 'count',
        rows: ov.needsAttention.expiring.slice(0, 8).map((e: { item?: { name?: string }; qtyMilli: number }) =>
          ({ label: e.item?.name ?? 'Item', value: Math.round(e.qtyMilli / 1000) })) },
      { kind: 'split', key: 'wasteVsGift', title: 'Written off this month', unit: 'paisa',
        parts: [{ label: 'Wastage', value: ov.kpis.wastageMonthPaisa }, { label: 'Given free', value: ov.kpis.giftMonthPaisa }] },
    ];

    return { cards, charts, emptyNote: this.empty(ov.kpis.itemCount === 0, 'No items are being tracked yet — start with Opening stock.') };
  }

  /* ==================== 4. PRODUCTS ==================== */

  private async productsLens(from: Date, to: Date) {
    const a = await this.products.analytics({ from, to });
    const rows = a.items;
    const withSales = rows.filter((p) => p.units > 0);

    const cards: Card[] = [
      { key: 'listed', label: 'Products listed', value: rows.length, unit: 'count' },
      { key: 'sold', label: 'Products that sold', value: withSales.length, unit: 'count' },
      { key: 'revenue', label: 'Revenue from products', value: a.totals.revenuePaisa, unit: 'paisa' },
      { key: 'units', label: 'Units sold', value: a.totals.units, unit: 'count' },
      { key: 'refunds', label: 'Refunded', value: a.totals.refundPaisa, unit: 'paisa' },
    ];

    const top = [...withSales].sort((x, y) => y.revenuePaisa - x.revenuePaisa).slice(0, 8);
    /*  Margin is returned in PAISA, not basis points. Dividing one by the other
        to fake a percentage would be a second, disagreeing margin figure — so
        the taka amount is shown as it is. */
    const thin = [...withSales].sort((x, y) => x.marginPaisa - y.marginPaisa).slice(0, 8);
    const charts: Chart[] = [
      { kind: 'bar', key: 'topProducts', title: 'Best sellers by revenue', unit: 'paisa',
        rows: top.map((p) => ({ label: p.name, value: p.revenuePaisa, sub: `${p.units} sold` })) },
      { kind: 'bar', key: 'byMargin', title: 'Least margin earned', note: 'Worth a price review', unit: 'paisa',
        rows: thin.map((p) => ({ label: p.name, value: p.marginPaisa, sub: `${p.units} sold` })) },
    ];

    return { cards, charts, emptyNote: this.empty(withSales.length === 0, 'No product has sold in this period, so there is nothing to rank.') };
  }

  /* ==================== 5. CUSTOMERS ==================== */

  /*  ⚠️ THE ONE LENS THAT COUNTS FOR ITSELF. No module produces customer
      aggregates, so this is not a second source — it is the only one. If a
      Customers module ever grows a stats() method, this must switch to calling
      it rather than keeping its own answer alongside. */
  private async customersLens(from: Date, to: Date) {
    const [total, newInRange, repeat, top] = await Promise.all([
      this.prisma.db.customer.count(),
      this.prisma.db.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.prisma.db.customer.count({ where: { ordersCount: { gt: 1 } } }),
      this.prisma.db.customer.findMany({
        where: { ltvPaisa: { gt: 0 } },
        orderBy: { ltvPaisa: 'desc' },
        take: 8,
        select: { name: true, ltvPaisa: true, ordersCount: true },
      }),
    ]);

    const oneTime = total - repeat;
    const cards: Card[] = [
      { key: 'total', label: 'Customers on file', value: total, unit: 'count' },
      { key: 'new', label: 'New in this period', value: newInRange, unit: 'count' },
      { key: 'repeat', label: 'Bought more than once', value: repeat, unit: 'count' },
      { key: 'repeatRate', label: 'Repeat rate', value: total > 0 ? Math.round((repeat / total) * 10000) : null, unit: 'bp',
        hint: 'For a flower shop this is the number that decides the year' },
    ];

    const charts: Chart[] = [
      { kind: 'split', key: 'repeatSplit', title: 'One-time against repeat', unit: 'count',
        parts: [{ label: 'Bought once', value: oneTime }, { label: 'Came back', value: repeat }] },
      { kind: 'bar', key: 'topCustomers', title: 'Most valuable customers', note: 'Lifetime value', unit: 'paisa',
        /* ltvPaisa is a BigInt in the schema (future-safe); Number() here is
           safe because a customer lifetime value cannot approach 2^53 paisa */
        rows: top.map((c) => ({ label: c.name, value: Number(c.ltvPaisa), sub: `${c.ordersCount} orders` })) },
    ];

    return { cards, charts, emptyNote: this.empty(total === 0, 'No customers on file yet — the radianbd.com import has not been done.') };
  }

  /* ==================== 6. FINANCE ==================== */

  private async financeLens() {
    const [ov, aging] = await Promise.all([this.finance.overview(), this.reports.aging()]);

    const cards: Card[] = [
      { key: 'cash', label: 'Cash in hand', value: ov.cashPaisa, unit: 'paisa' },
      { key: 'spendable', label: 'Actually spendable', value: ov.spendablePaisa, unit: 'paisa' },
      { key: 'receivable', label: 'Owed to us', value: ov.receivablePaisa, unit: 'paisa' },
      { key: 'payable', label: 'We owe', value: ov.payablePaisa, unit: 'paisa' },
      { key: 'profit', label: 'Profit this month', value: ov.profitPaisa, unit: 'paisa' },
      { key: 'runway', label: 'Runway', value: ov.runwayDays, unit: 'days' },
    ];

    const charts: Chart[] = [
      { kind: 'split', key: 'inOut', title: 'Money in against money out', unit: 'paisa',
        parts: [{ label: 'Income', value: ov.incomePaisa }, { label: 'Expense', value: ov.expensePaisa }] },
      { kind: 'bar', key: 'topExpenses', title: 'Where it went', unit: 'paisa',
        rows: (ov.topExpenses ?? []).map((e: { name: string; paisa: number }) => ({ label: e.name, value: e.paisa })) },
      { kind: 'bar', key: 'agingCustomers', title: 'Owed to us, by age', note: 'The older a debt, the less of it comes back', unit: 'paisa',
        rows: aging.receivable.buckets.map((b) => ({ label: b.bucket, value: b.paisa })) },
      { kind: 'bar', key: 'agingSuppliers', title: 'We owe, by age', unit: 'paisa',
        rows: aging.payable.buckets.map((b) => ({ label: b.bucket, value: b.paisa })) },
    ];

    return { cards, charts, emptyNote: this.empty(ov.incomePaisa === 0 && ov.expensePaisa === 0, 'Nothing has been posted to the books this month.') };
  }

  /* ==================== 7. MARKETING ==================== */

  private async marketingLens() {
    const s = await this.campaigns.stats();

    const cards: Card[] = [
      { key: 'running', label: 'Campaigns running', value: s.running, unit: 'count' },
      { key: 'planned', label: 'Planned', value: s.planned, unit: 'count' },
      { key: 'spend', label: 'Spent on live campaigns', value: s.liveSpendPaisa, unit: 'paisa' },
      { key: 'contribution', label: 'What they brought in', value: s.liveContributionPaisa, unit: 'paisa' },
      { key: 'orders30', label: 'Orders in 30 days', value: s.orders30, unit: 'count' },
    ];

    const charts: Chart[] = [
      { kind: 'split', key: 'spendVsReturn', title: 'Spent against what came back', note: 'Contribution, not revenue — what was left after the goods', unit: 'paisa',
        parts: [{ label: 'Spent', value: s.liveSpendPaisa }, { label: 'Contribution', value: s.liveContributionPaisa }] },
      /*  MKT-D02 — attribution is only as honest as the count of orders it
          could NOT explain, so that count is shown beside it, never hidden. */
      { kind: 'split', key: 'attribution', title: 'Orders we can and cannot explain', note: 'Rung 3 stays empty until the storefront forwards UTMs', unit: 'count',
        parts: [{ label: 'Attributed', value: s.attributed30 }, { label: 'Unattributed', value: s.unattributed30 }] },
    ];

    return { cards, charts, emptyNote: this.empty(s.running + s.planned + s.finished === 0, 'No campaigns have been set up yet.') };
  }

  /* ==================== 8. PURCHASES ==================== */

  private async purchasesLens() {
    const [p, sup] = await Promise.all([this.purchases.stats(), this.suppliers.stats()]);

    const cards: Card[] = [
      { key: 'bought', label: 'Bought, all time', value: p.totalBoughtPaisa, unit: 'paisa' },
      { key: 'month', label: 'Bought this month', value: p.monthBoughtPaisa, unit: 'paisa', hint: `${p.monthCount} purchases` },
      { key: 'due', label: 'Still owed to suppliers', value: p.totalDuePaisa, unit: 'paisa', hint: `${p.dueCount} unpaid` },
      { key: 'advance', label: 'Paid in advance, not received', value: p.advanceWaiting.length, unit: 'count' },
      { key: 'suppliers', label: 'Active suppliers', value: sup.supplierCount, unit: 'count' },
    ];

    const charts: Chart[] = [
      { kind: 'split', key: 'paidVsDue', title: 'Paid against still owed', unit: 'paisa',
        parts: [{ label: 'Paid', value: p.totalPaidPaisa }, { label: 'Still owed', value: p.totalDuePaisa }] },
      { kind: 'bar', key: 'bySupplier', title: 'Owed, by supplier', unit: 'paisa',
        rows: sup.board.filter((r) => r.duePaisa > 0).slice(0, 8).map((r) => ({ label: r.name, value: r.duePaisa })) },
    ];

    return { cards, charts, emptyNote: this.empty(p.totalBoughtPaisa === 0, 'No purchases recorded yet.') };
  }

  /* ==================== 9. STAFF ==================== */

  private async staffLens() {
    const s = await this.employees.stats();

    const cards: Card[] = [
      { key: 'total', label: 'People on the books', value: s.total, unit: 'count' },
      { key: 'active', label: 'Active', value: s.active, unit: 'count' },
      { key: 'wageBill', label: 'Monthly wage bill', value: s.monthlyWageBillPaisa, unit: 'paisa' },
      { key: 'advances', label: 'Advances outstanding', value: s.advanceOutstandingPaisa, unit: 'paisa' },
      { key: 'present', label: 'Present today', value: s.presentToday, unit: 'count',
        hint: `${s.attendanceMarkedToday} marked so far` },
    ];

    const charts: Chart[] = [
      { kind: 'split', key: 'activeSplit', title: 'Active against inactive', unit: 'count',
        parts: [{ label: 'Active', value: s.active }, { label: 'Inactive', value: s.inactive }] },
      { kind: 'split', key: 'today', title: 'Attendance today', note: 'Marked, against everyone active', unit: 'count',
        parts: [{ label: 'Present', value: s.presentToday }, { label: 'Not marked', value: Math.max(0, s.active - s.attendanceMarkedToday) }] },
    ];

    return { cards, charts, emptyNote: this.empty(s.total === 0, 'Nobody has been added to Staff yet.') };
  }
}
