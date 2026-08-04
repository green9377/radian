import { BadRequestException, Injectable } from '@nestjs/common';
import { FinanceService } from '../finance/finance.service';
import { FinanceReportsService } from '../finance/finance-reports.service';
import { InventoryService } from '../inventory/inventory.service';
import { DeliveryAnalyticsService } from '../delivery/delivery-analytics.service';
import { ProductsService } from '../products/products.service';
import { SuppliersService } from '../suppliers/suppliers.service';

/*  REPORTS CENTRE — DEC-INT-004.

    "Reports" does NOT mean writing new reports. Every figure below already
    exists somewhere in the system; what did not exist was one place to find
    them, choose a date range, and get a file out. That is all this is.

    ONE SHAPE, LIKE THE LENSES. Every report answers with the same
    { columns, rows, totals } structure, so:

      · one table component draws all of them
      · one CSV writer exports all of them
      · one print stylesheet prints all of them
      · a tenth report is a method here and nothing at all on the screen

    ⚠️ NO `:key` ROUTE. The report is chosen with `?key=`, not `/reports/:key`,
    so this controller still has no dynamic segment anywhere — the Nest ordering
    trap that has caught five modules cannot reach it. Consistency with
    `analytics?lens=` is a bonus.

    WHY THERE IS NO PDF LIBRARY HERE, and why that is the right answer:

    Mushak 6.3 is a Bangladeshi government VAT form and it is printed in Bangla.
    `pdfkit` — the obvious choice — cannot shape complex scripts: Bangla
    conjuncts like ক্ত and ন্ধ come out broken into their parts. On a government
    form that is not a cosmetic problem, it is an invalid document.

    The browser shapes Bangla correctly, and the panel ALREADY prints the Mushak
    challan this way (`FinanceMushak.tsx`, `@media print`). So printing stays
    with the browser, and CSV — which needs no library at all — carries the data
    to the accountant. The API keeps its zero third-party dependencies.
*/

export type ColumnFormat = 'text' | 'paisa' | 'count' | 'bp' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  format: ColumnFormat;
  /** right-align numbers; the screen and the print sheet both honour it */
  numeric?: boolean;
}

export interface ReportResult {
  key: string;
  title: string;
  subtitle: string;
  /** whether the date range was used at all — a stock valuation is "as of now" */
  usesRange: boolean;
  from: string | null;
  to: string | null;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  /** the footer line. Keys match column keys. */
  totals: Record<string, string | number | null> | null;
  /** said in words when there is nothing — never an empty table with no reason */
  emptyNote: string | null;
  /** a warning the report itself wants to make about its own numbers */
  caveat?: string;
}

export interface ReportMeta {
  key: string;
  title: string;
  group: string;
  description: string;
  usesRange: boolean;
  /** who normally asks for this one — the reason it exists (DEC-INT-004) */
  audience: string;
}

export const REPORTS: ReportMeta[] = [
  { key: 'pnl', title: 'Profit & loss', group: 'Money', usesRange: true,
    description: 'Income, cost of goods, running costs, and what was left.', audience: 'Accountant' },
  { key: 'trial-balance', title: 'Trial balance', group: 'Money', usesRange: false,
    description: 'Every account, debit against credit. It must balance.', audience: 'Accountant' },
  { key: 'receivable', title: 'Owed to us', group: 'Money', usesRange: false,
    description: 'Who owes money, and how long it has been outstanding.', audience: 'Owner' },
  { key: 'payable', title: 'What we owe', group: 'Money', usesRange: false,
    description: 'Supplier bills waiting, by age.', audience: 'Owner' },
  { key: 'sales-breakdown', title: 'Sales by channel and zone', group: 'Sales', usesRange: true,
    description: 'Where sales came from and where they went, with margin.', audience: 'Owner' },
  /*  These two spent an afternoon as `usesRange: false`, because Products and
      Inventory only took a NUMBER OF DAYS counted back from today — so a report
      asked for March could only return the last 31 days, and the first version
      printed the March dates over it anyway.
      Rather than keep documenting the limitation, it was removed: both services
      now accept `{ from, to }`. The honest label was the right stopgap; fixing
      the owning module was the right answer. */
  { key: 'product-performance', title: 'Product performance', group: 'Sales', usesRange: true,
    description: 'Units, revenue and margin for every product.', audience: 'Owner' },
  { key: 'stock-valuation', title: 'Stock valuation', group: 'Stock', usesRange: false,
    description: 'What is on the shelf and what it is worth, at AVCO.', audience: 'Accountant · Bank' },
  { key: 'wastage', title: 'Wastage and gifts', group: 'Stock', usesRange: true,
    description: 'Flowers written off, in taka, day by day.', audience: 'Owner' },
  { key: 'delivery-performance', title: 'Delivery performance', group: 'Operations', usesRange: true,
    description: 'On-time, failures, cost against charge, by zone and carrier.', audience: 'Owner' },
  { key: 'supplier-balances', title: 'Supplier balances', group: 'Money', usesRange: false,
    description: 'Due and credit for each supplier.', audience: 'Owner' },
];

const money = (key: string, label: string): ReportColumn => ({ key, label, format: 'paisa', numeric: true });
const count = (key: string, label: string): ReportColumn => ({ key, label, format: 'count', numeric: true });
const text = (key: string, label: string): ReportColumn => ({ key, label, format: 'text' });

@Injectable()
export class IntelligenceReportsService {
  constructor(
    private readonly finance: FinanceService,
    private readonly reports: FinanceReportsService,
    private readonly inventory: InventoryService,
    private readonly delivery: DeliveryAnalyticsService,
    private readonly products: ProductsService,
    private readonly suppliers: SuppliersService,
  ) {}

  list() {
    return { reports: REPORTS };
  }

  async run(key: string, fromIso?: string, toIso?: string): Promise<ReportResult> {
    const meta = REPORTS.find((r) => r.key === key);
    if (!meta) throw new BadRequestException(`No such report: ${key}`);

    // default range: this month to now, in Dhaka terms via Finance's own default
    const to = toIso ? new Date(toIso) : new Date();
    const from = fromIso ? new Date(fromIso) : new Date(to.getFullYear(), to.getMonth(), 1);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
      throw new BadRequestException('Those dates do not make sense');
    if (from > to) throw new BadRequestException('The start date is after the end date');

    const body = await this.build(key, from, to);
    return {
      key,
      title: meta.title,
      usesRange: meta.usesRange,
      from: meta.usesRange ? from.toISOString() : null,
      to: meta.usesRange ? to.toISOString() : null,
      ...body,
    };
  }

  private async build(key: string, from: Date, to: Date): Promise<Omit<ReportResult, 'key' | 'title' | 'usesRange' | 'from' | 'to'>> {
    switch (key) {
      case 'pnl': return this.pnl(from, to);
      case 'trial-balance': return this.trialBalance();
      case 'receivable': return this.aging('receivable');
      case 'payable': return this.aging('payable');
      case 'sales-breakdown': return this.salesBreakdown(from, to);
      case 'product-performance': return this.productPerformance(from, to);
      case 'stock-valuation': return this.stockValuation();
      case 'wastage': return this.wastage(from, to);
      case 'delivery-performance': return this.deliveryPerformance(from, to);
      case 'supplier-balances': return this.supplierBalances();
      default: throw new BadRequestException(`No such report: ${key}`);
    }
  }

  /* ---------------- Money ---------------- */

  private async pnl(from: Date, to: Date) {
    const p = await this.reports.profitAndLoss(from.toISOString(), to.toISOString());

    /*  A P&L is not a flat list — it is a story with subtotals, and flattening
        it into rows loses the shape an accountant reads it by. So the section
        is carried as a column, and the rows stay in the order they must be
        read in. */
    const rows: Record<string, string | number | null>[] = [];
    for (const i of p.income) rows.push({ section: 'Income', account: `${i.code} ${i.name}`, amount: i.paisa });
    rows.push({ section: 'Income', account: 'Total income', amount: p.totalIncomePaisa });
    rows.push({ section: 'Cost of goods', account: 'Cost of goods sold', amount: p.cogsPaisa });
    rows.push({ section: 'Cost of goods', account: 'Gross profit', amount: p.grossProfitPaisa });
    for (const g of p.expenseGroups) rows.push({ section: 'Running costs', account: g.group, amount: g.paisa });
    rows.push({ section: 'Running costs', account: 'Total running costs', amount: p.totalExpensePaisa });

    return {
      subtitle: `Gross margin ${(p.grossMarginBp / 100).toFixed(1)} %`,
      columns: [text('section', 'Section'), text('account', 'Account'), money('amount', 'Amount')],
      rows,
      totals: { section: '', account: 'Net profit', amount: p.netProfitPaisa },
      emptyNote: p.totalIncomePaisa === 0 && p.totalExpensePaisa === 0
        ? 'Nothing was posted to the books in this period.' : null,
    };
  }

  private async trialBalance() {
    const t = await this.reports.trialBalance();
    return {
      subtitle: t.balanced ? 'Balanced' : 'NOT BALANCED — the ledger disagrees with itself',
      /*  A trial balance that does not balance is the single most serious thing
          this screen can report, so it is said in the subtitle rather than left
          for the reader to add up two columns and notice. */
      caveat: t.balanced ? undefined : 'Debits and credits do not match. Nothing else on this page can be trusted until that is resolved.',
      columns: [text('code', 'Code'), text('name', 'Account'), text('group', 'Group'),
        money('debitPaisa', 'Debit'), money('creditPaisa', 'Credit')],
      rows: t.rows as unknown as Record<string, string | number | null>[],
      totals: { code: '', name: 'Total', group: '', debitPaisa: t.totalDebitPaisa, creditPaisa: t.totalCreditPaisa },
      emptyNote: t.rows.length === 0 ? 'No account has any movement yet.' : null,
    };
  }

  private async aging(side: 'receivable' | 'payable') {
    const a = await this.reports.aging();
    const s = side === 'receivable' ? a.receivable : a.payable;
    const rows = s.rows as unknown as Record<string, string | number | null>[];
    return {
      subtitle: `${rows.length} outstanding · ${side === 'receivable' ? 'owed to us' : 'we owe'}`,
      caveat: 'The older a debt, the less of it comes back. The age column is the point of this report.',
      columns: [text('ref', 'Reference'), text('who', side === 'receivable' ? 'Customer' : 'Supplier'),
        count('days', 'Days'), text('bucket', 'Age'), money('paisa', 'Amount')],
      rows,
      totals: { ref: '', who: 'Total', days: null, bucket: '', paisa: s.totalPaisa },
      emptyNote: rows.length === 0
        ? (side === 'receivable' ? 'Nobody owes us anything.' : 'We owe nothing.') : null,
    };
  }

  private async supplierBalances() {
    const s = await this.suppliers.stats();
    return {
      subtitle: `${s.supplierCount} active · ${s.dueCount} with money outstanding`,
      columns: [text('name', 'Supplier'), text('typeName', 'Type'), text('status', 'Status'),
        money('duePaisa', 'We owe'), money('creditPaisa', 'They owe us')],
      rows: s.board as unknown as Record<string, string | number | null>[],
      totals: { name: 'Total', typeName: '', status: '', duePaisa: s.totalDuePaisa, creditPaisa: s.totalCreditPaisa },
      emptyNote: s.board.length === 0 ? 'No suppliers on file.' : null,
    };
  }

  /* ---------------- Sales ---------------- */

  private async salesBreakdown(from: Date, to: Date) {
    const b = await this.reports.salesBreakdown(from.toISOString(), to.toISOString());
    const rows = [
      ...b.channels.map((c) => ({ kind: 'Channel', name: c.name, salesPaisa: c.salesPaisa, costPaisa: c.costPaisa, marginPaisa: c.marginPaisa })),
      ...b.zones.map((z) => ({ kind: 'Zone', name: z.name, salesPaisa: z.salesPaisa, costPaisa: z.costPaisa, marginPaisa: z.marginPaisa })),
    ];
    return {
      subtitle: 'Channels and zones, side by side',
      caveat: 'A channel and a zone describe the SAME sales from two angles — do not add the two halves together.',
      columns: [text('kind', 'Kind'), text('name', 'Name'), money('salesPaisa', 'Sales'),
        money('costPaisa', 'Cost'), money('marginPaisa', 'Margin')],
      rows,
      totals: null,
      emptyNote: rows.length === 0 ? 'No sales in this period.' : null,
    };
  }

  private async productPerformance(from: Date, to: Date) {
    const a = await this.products.analytics({ from, to });
    const rows = a.items
      .filter((i) => i.units > 0 || i.orders > 0)
      .sort((x, y) => y.revenuePaisa - x.revenuePaisa)
      .map((i) => ({
        sku: i.sku, name: i.name, category: i.categoryName,
        units: i.units, orders: i.orders, delivered: i.delivered, cancelled: i.cancelled,
        revenuePaisa: i.revenuePaisa, refundPaisa: i.refundPaisa, marginPaisa: i.marginPaisa,
      }));
    return {
      subtitle: `${rows.length} products with activity`,
      columns: [text('sku', 'SKU'), text('name', 'Product'), text('category', 'Category'),
        count('units', 'Units'), count('orders', 'Orders'), count('cancelled', 'Cancelled'),
        money('revenuePaisa', 'Revenue'), money('refundPaisa', 'Refunded'), money('marginPaisa', 'Margin')],
      rows,
      totals: { sku: '', name: 'Total', category: '',
        units: a.totals.units, orders: a.totals.orders, cancelled: a.totals.cancelled,
        revenuePaisa: a.totals.revenuePaisa, refundPaisa: a.totals.refundPaisa, marginPaisa: a.totals.marginPaisa },
      emptyNote: rows.length === 0 ? 'No product sold in this period.' : null,
    };
  }

  /* ---------------- Stock ---------------- */

  private async stockValuation() {
    const v = await this.inventory.valuationReport();
    return {
      subtitle: 'As it stands right now — a valuation has no date range',
      caveat: 'Valued at AVCO, the average of what each unit actually cost. Not at selling price.',
      columns: [text('sku', 'SKU'), text('name', 'Item'), text('unitShort', 'Unit'),
        count('qty', 'Quantity'), money('unitCostPaisa', 'Unit cost'), money('valuePaisa', 'Value')],
      rows: v.rows.map((r) => ({
        sku: r.sku, name: r.name, unitShort: r.unitShort,
        // qty is stored in thousandths — shown as the real number, not the raw one
        qty: Math.round(r.totalQtyMilli / 1000),
        unitCostPaisa: r.unitCostPaisa, valuePaisa: r.valuePaisa,
      })),
      totals: { sku: '', name: 'Total', unitShort: '', qty: null, unitCostPaisa: null, valuePaisa: v.totalPaisa },
      emptyNote: v.rows.length === 0 ? 'Nothing is in stock.' : null,
    };
  }

  private async wastage(from: Date, to: Date) {
    const r = await this.inventory.issueReport({ from, to });
    return {
      subtitle: `${r.series.length} day(s) with something written off`,
      columns: [text('date', 'Date'), money('wastagePaisa', 'Wastage'), money('giftPaisa', 'Given free')],
      rows: r.series as unknown as Record<string, string | number | null>[],
      totals: { date: 'Total', wastagePaisa: r.totalWastagePaisa, giftPaisa: r.totalGiftPaisa },
      emptyNote: r.series.length === 0 ? 'Nothing was written off in this period.' : null,
    };
  }

  /* ---------------- Operations ---------------- */

  private async deliveryPerformance(from: Date, to: Date) {
    const a = await this.delivery.analytics(from, to);

    const rows = [
      ...a.byZone.map((z) => ({
        kind: 'Zone', name: z.name, delivered: z.delivered, measurable: z.measurable,
        onTimeBp: z.onTimeBp, costPaisa: null as number | null,
      })),
      ...a.byCarrier.map((c) => ({
        kind: c.kind === 'RIDER' ? 'Rider' : 'Courier', name: c.name, delivered: c.delivered,
        measurable: c.measurable, onTimeBp: c.onTimeBp, costPaisa: c.costPaisa,
      })),
    ];

    return {
      subtitle: a.measurable === 0
        ? `${a.delivered} delivered · none can be judged for lateness yet`
        : `${a.delivered} delivered · ${((a.onTimeBp ?? 0) / 100).toFixed(1)} % on time, judged on ${a.measurable}`,
      /*  INT-R09 at the report level. A delivery with no promised time is not
          late — it is unmeasurable, and saying so is the difference between a
          percentage and a rumour. */
      caveat: a.unmeasurable > 0
        ? `${a.unmeasurable} of ${a.delivered} deliveries have no promised time and are NOT counted as late. Orders fills that in from the delivery date and slot; until then the on-time figure covers only part of the work.`
        : undefined,
      columns: [text('kind', 'Kind'), text('name', 'Name'), count('delivered', 'Delivered'),
        count('measurable', 'Judged'), { key: 'onTimeBp', label: 'On time', format: 'bp' as const, numeric: true },
        money('costPaisa', 'Paid out')],
      rows,
      totals: { kind: '', name: 'All', delivered: a.delivered, measurable: a.measurable,
        onTimeBp: a.onTimeBp, costPaisa: a.costPaisa },
      emptyNote: a.delivered === 0 ? 'Nothing was delivered in this period.' : null,
    };
  }
}
