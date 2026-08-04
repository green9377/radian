import { ensureSingleton } from '../common/singleton';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, FinAccountType, CostBehavior } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type {
  AccountWriteDto,
  SettingsWriteDto,
  ReconcileDto,
  PostOpeningDto,
  PostEntryInput,
  LineInput,
  ExpenseWriteDto,
  IncomeWriteDto,
  TransferWriteDto,
  PartnerWriteDto,
  PartnerTxnDto,
  ApprovalActionDto,
  RecurringWriteDto,
  StaffAdvanceDto,
  StaffSalaryDto,
  ManualJournalDto,
} from './finance.dto';

/*  FINANCE (ledger) — RADIAN_FINANCE_MODULE_ARCHITECTURE.md v1.1
    DEC-FIN-001  double-entry inside, simple forms outside (never Dr/Cr in the UI)
    DEC-FIN-013  the EXPENSE account IS the expense category (no second master)
    DEC-FIN-014  posted entries are immutable — correction is a reversal entry
    DEC-FIN-020  VAT collected is a LIABILITY (2400), never income
    DEC-FIN-021  COD cash sits in 1110 until a rider/courier actually hands it over
    DEC-FIN-023  sourceKey unique — one business event, one journal entry
    DEC-FIN-025  period lock — no entry dated on/before lastClosedDate
    FIN-RULE-002 every entry must balance (Σ debit === Σ credit)
    FIN-RULE-008 balances are DERIVED from the ledger, never stored/edited
    FIN-RULE-016 every number is computed server-side (D1 lesson)
*/

const ENTITY = 'FinanceAccount';

/** system account codes the posting engine references by name */
export const ACC = {
  CASH: '1000',
  BKASH: '1010',
  NAGAD: '1020',
  WALLET: '1030',
  BANK: '1040',
  GATEWAY: '1050',
  RECEIVABLE: '1100',
  CASH_WITH_CARRIER: '1110',
  INVENTORY: '1150',
  GOODS_OUT: '1160',
  SUPPLIER_ADVANCE: '1200',
  PREPAID: '1300',
  DEPOSIT: '1310',
  FIXED_ASSET: '1400',
  ACCUM_DEP: '1410',
  VAT_INPUT: '1500',
  SUPPLIER_PAYABLE: '2000',
  CUSTOMER_ADVANCE: '2100',
  STORE_CREDIT: '2110',
  LOAN_PAYABLE: '2200',
  ACCRUED: '2300',
  VAT_PAYABLE: '2400',
  PARTNER_CAPITAL: '3000',
  PARTNER_DRAWINGS: '3100',
  RETAINED: '3200',
  SALES: '4000',
  DELIVERY_INCOME: '4010',
  SALES_RETURN: '4100',
  SALES_ADJUSTMENT: '4110',
  OTHER_INCOME: '4200',
  CASH_OVER: '4300',
  COGS: '5000',
  WASTAGE: '5100',
  GIFT: '5110',
  INV_ADJUSTMENT: '5150',
  DELIVERY_COST: '5200',
  GATEWAY_FEE: '5300',
  PACKAGING: '5310',
  RENT: '5400',
  PARTNER_SALARY: '5410',
  STAFF_SALARY: '5420',
  UTILITY: '5430',
  INTERNET: '5440',
  MARKETING: '5450',
  TRANSPORT: '5460',
  REPAIR: '5470',
  BANK_CHARGE: '5480',
  MISC: '5490',
  DEPRECIATION: '5500',
  LOAN_INTEREST: '5600',
  CASH_SHORT: '5700',
} as const;

type SeedRow = {
  code: string;
  name: string;
  type: FinAccountType;
  money?: boolean;
  payMethod?: string;
  behavior?: CostBehavior;
  note?: string;
  group?: string;
};

/** extra system codes added after v1.0 (Biznify gap review) */
export const ACC2 = {
  EMPLOYEE_ADVANCE: '1210',
  UNCATEGORISED: '5499',
  /// MKT-D10 — commission earned by an outside promoter but not yet paid out.
  /// A liability, exactly like an unpaid salary: the sale happened, the money
  /// has not left yet.
  AFFILIATE_PAYABLE: '2120',
  /// MKT-D10 — that commission as a cost of selling. NOT 5450, which is what
  /// Radian spends on advertising; this is what Radian owes on a sale.
  AFFILIATE_COMMISSION: '5451',
  /// MKT-D17 — points already handed out. A point is a promise to give away
  /// ৳1 of future revenue, so it is a liability the day it is earned, not the
  /// day it is spent. Without this the books show a profit that is already
  /// half spoken for.
  LOYALTY_POINTS: '2130',
  /// what those points cost, as a cost of selling
  REFERRAL_COST: '5452',
  /// MKT-D21 — points earned on ordinary purchases, kept apart from 5452 so
  /// "what referrals cost us" and "what the loyalty scheme costs us" are two
  /// answerable questions instead of one blurred one.
  LOYALTY_COST: '5453',
} as const;

/** Chart of Accounts — §3 of the architecture doc. Seeded once, admin-extendable. */
const CHART: SeedRow[] = [
  // ASSET
  { code: ACC.CASH, name: 'Cash Drawer', type: 'ASSET', money: true, payMethod: 'CASH' , group: 'Money' },
  { code: ACC.BKASH, name: 'bKash', type: 'ASSET', money: true, payMethod: 'BKASH' , group: 'Money' },
  { code: ACC.NAGAD, name: 'Nagad', type: 'ASSET', money: true, payMethod: 'NAGAD' , group: 'Money' },
  { code: ACC.WALLET, name: 'Other Wallet (Rocket/Upay)', type: 'ASSET', money: true, payMethod: 'OTHER' , group: 'Money' },
  { code: ACC.BANK, name: 'Bank', type: 'ASSET', money: true, payMethod: 'BANK' , group: 'Money' },
  { code: ACC.GATEWAY, name: 'Card / Gateway Settlement', type: 'ASSET', money: true, payMethod: 'CARD', note: 'Money still held by the payment gateway' , group: 'Money' },
  { code: ACC.RECEIVABLE, name: 'Customer Receivable', type: 'ASSET', note: 'COD due + POS credit sales' , group: 'Receivable' },
  { code: ACC.CASH_WITH_CARRIER, name: 'Cash with Rider / Courier', type: 'ASSET', note: 'COD collected but not yet handed over (DEC-FIN-021)' , group: 'Receivable' },
  { code: ACC.INVENTORY, name: 'Inventory', type: 'ASSET', note: 'Stock at AVCO value' , group: 'Stock' },
  { code: ACC.GOODS_OUT, name: 'Goods Out for Delivery', type: 'ASSET', note: 'Left the warehouse, not delivered yet (DEC-FIN-003)' , group: 'Stock' },
  { code: ACC.SUPPLIER_ADVANCE, name: 'Supplier Advance / Credit', type: 'ASSET' , group: 'Advance & Deposit' },
  { code: ACC.PREPAID, name: 'Prepaid Expense', type: 'ASSET', note: 'Advance rent etc — spread monthly' , group: 'Advance & Deposit' },
  { code: ACC.DEPOSIT, name: 'Security Deposit', type: 'ASSET', note: 'Refundable — never amortised' , group: 'Advance & Deposit' },
  { code: ACC.FIXED_ASSET, name: 'Fixed Asset — Cost', type: 'ASSET' , group: 'Fixed Asset' },
  { code: ACC.ACCUM_DEP, name: 'Accumulated Depreciation', type: 'ASSET', note: 'Contra-asset (negative)' , group: 'Fixed Asset' },
  { code: ACC.VAT_INPUT, name: 'VAT Input (rebate)', type: 'ASSET' , group: 'Tax' },
  // LIABILITY
  { code: ACC.SUPPLIER_PAYABLE, name: 'Supplier Payable', type: 'LIABILITY' , group: 'Payable' },
  { code: ACC.CUSTOMER_ADVANCE, name: 'Customer Advance', type: 'LIABILITY', note: 'Money taken before delivery (DEC-FIN-002)' , group: 'Customer Liability' },
  { code: ACC.STORE_CREDIT, name: 'Customer Store Credit', type: 'LIABILITY' , group: 'Customer Liability' },
  { code: ACC.LOAN_PAYABLE, name: 'Loan Payable', type: 'LIABILITY' , group: 'Loan' },
  { code: ACC.ACCRUED, name: 'Accrued Expense / Salary Payable', type: 'LIABILITY' , group: 'Payable' },
  { code: ACC.VAT_PAYABLE, name: 'VAT Payable (NBR)', type: 'LIABILITY', note: 'Collected VAT — the government’s money, not income' , group: 'Tax' },
  // EQUITY
  { code: ACC.PARTNER_CAPITAL, name: 'Partner Capital', type: 'EQUITY' , group: 'Owner' },
  { code: ACC.PARTNER_DRAWINGS, name: 'Partner Drawings / Capital Return', type: 'EQUITY' , group: 'Owner' },
  { code: ACC.RETAINED, name: 'Retained Earnings', type: 'EQUITY' , group: 'Owner' },
  // INCOME
  { code: ACC.SALES, name: 'Sales Income', type: 'INCOME' , group: 'Sales' },
  { code: ACC.DELIVERY_INCOME, name: 'Delivery Fee Income', type: 'INCOME' , group: 'Sales' },
  { code: ACC.SALES_RETURN, name: 'Sales Return', type: 'INCOME', note: 'Contra-income' , group: 'Sales' },
  { code: ACC.SALES_ADJUSTMENT, name: 'Sales Adjustment', type: 'INCOME', note: 'Order adjustment + POS negotiation' , group: 'Sales' },
  { code: ACC.OTHER_INCOME, name: 'Other Income', type: 'INCOME' , group: 'Other Income' },
  { code: ACC.CASH_OVER, name: 'Cash Over', type: 'INCOME' , group: 'Other Income' },
  // EXPENSE — costBehavior drives break-even (FIN-RULE-016)
  { code: ACC.COGS, name: 'Cost of Goods Sold', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Cost of Goods Sold' },
  { code: ACC.WASTAGE, name: 'Wastage / Spoilage', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Cost of Goods Sold' },
  { code: ACC.GIFT, name: 'Gift & Sampling', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Cost of Goods Sold' },
  { code: ACC.INV_ADJUSTMENT, name: 'Inventory Adjustment', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Cost of Goods Sold' },
  { code: ACC.DELIVERY_COST, name: 'Delivery Cost (courier/rider)', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Selling Cost' },
  { code: ACC.GATEWAY_FEE, name: 'Payment Gateway Fee', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Selling Cost' },
  { code: ACC.PACKAGING, name: 'Packaging', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Selling Cost' },
  { code: ACC.RENT, name: 'Shop Rent', type: 'EXPENSE', behavior: 'FIXED' , group: 'Shop Running' },
  { code: ACC.PARTNER_SALARY, name: 'Partner Salary', type: 'EXPENSE', behavior: 'FIXED', note: 'DEC-FIN-004 — salary is a cost, drawings are not' , group: 'People' },
  { code: ACC.STAFF_SALARY, name: 'Employee Salary', type: 'EXPENSE', behavior: 'FIXED' , group: 'People' },
  { code: ACC.UTILITY, name: 'Utility (electricity/water/gas)', type: 'EXPENSE', behavior: 'FIXED' , group: 'Shop Running' },
  { code: ACC.INTERNET, name: 'Internet & Phone', type: 'EXPENSE', behavior: 'FIXED' , group: 'Shop Running' },
  { code: ACC.MARKETING, name: 'Marketing & Ads', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Selling Cost' },
  { code: ACC.TRANSPORT, name: 'Transport & Conveyance', type: 'EXPENSE', behavior: 'VARIABLE' , group: 'Selling Cost' },
  { code: ACC.REPAIR, name: 'Repair & Maintenance', type: 'EXPENSE', behavior: 'FIXED' , group: 'Shop Running' },
  { code: ACC.BANK_CHARGE, name: 'Bank Charge & Fees', type: 'EXPENSE', behavior: 'FIXED' , group: 'Finance Cost' },
  { code: ACC.MISC, name: 'Miscellaneous', type: 'EXPENSE', behavior: 'FIXED' , group: 'Other' },
  { code: ACC.DEPRECIATION, name: 'Depreciation', type: 'EXPENSE', behavior: 'FIXED' , group: 'Other' },
  { code: ACC.LOAN_INTEREST, name: 'Loan Interest', type: 'EXPENSE', behavior: 'FIXED' , group: 'Finance Cost' },
  { code: ACC.CASH_SHORT, name: 'Cash Short', type: 'EXPENSE', behavior: 'FIXED' , group: 'Other' },
  // ---- added after the Biznify gap review (G2 / G4 / G5) ----
  { code: ACC2.EMPLOYEE_ADVANCE, name: 'Employee Advance', type: 'ASSET', group: 'Advance & Deposit', note: 'Salary paid before it is earned — comes back out of the next payslip' },
  { code: '5491', name: 'Website & Software', type: 'EXPENSE', behavior: 'FIXED', group: 'Shop Running', note: 'Hosting, domain, apps, subscriptions' },
  { code: '5492', name: 'Professional Fees', type: 'EXPENSE', behavior: 'FIXED', group: 'Shop Running', note: 'Accountant, lawyer, consultant' },
  { code: '5493', name: 'Insurance', type: 'EXPENSE', behavior: 'FIXED', group: 'Shop Running', note: 'Shop or vehicle insurance' },
  { code: '5494', name: 'Import & Customs', type: 'EXPENSE', behavior: 'VARIABLE', group: 'Cost of Goods Sold', note: 'Duty, clearing and freight on imported goods' },
  { code: '5495', name: 'Branding & Design', type: 'EXPENSE', behavior: 'VARIABLE', group: 'Selling Cost', note: 'Logo, packaging design, print artwork' },
  { code: '5496', name: 'Event Cost', type: 'EXPENSE', behavior: 'VARIABLE', group: 'Selling Cost', note: 'Fairs, stalls, wedding and corporate setups' },
  { code: '5497', name: 'Temporary Worker', type: 'EXPENSE', behavior: 'VARIABLE', group: 'People', note: 'Day-labour hired for a rush (Valentine, Pohela Falgun)' },
  { code: '5498', name: 'Staff Food & Refreshment', type: 'EXPENSE', behavior: 'FIXED', group: 'People', note: 'Shop nasta, tea, staff meals' },
  { code: ACC2.UNCATEGORISED, name: 'Uncategorised Expense', type: 'EXPENSE', behavior: 'FIXED', group: 'Other', note: 'Not sure where it belongs — park it here and sort it out later' },
  // ---- added by the Marketing module (MKT-D10) ----
  { code: ACC2.AFFILIATE_PAYABLE, name: 'Affiliate & Partner Payable', type: 'LIABILITY', group: 'Payable', note: 'Commission earned on a delivered order, not yet withdrawn' },
  { code: ACC2.AFFILIATE_COMMISSION, name: 'Affiliate Commission', type: 'EXPENSE', behavior: 'VARIABLE', group: 'Selling Cost', note: 'What an outside promoter earned on a sale — separate from 5450, which is ad spend' },
  // ---- added by Referral & Points (MKT-D17) ----
  { code: ACC2.LOYALTY_POINTS, name: 'Customer Points Payable', type: 'LIABILITY', group: 'Customer Liability', note: 'Points earned but not yet spent — ৳1 of future revenue already promised away' },
  { code: ACC2.REFERRAL_COST, name: 'Referral Reward Cost', type: 'EXPENSE', behavior: 'VARIABLE', group: 'Selling Cost', note: 'What referral rewards cost, on the day they are given' },
  { code: ACC2.LOYALTY_COST, name: 'Loyalty Points Cost', type: 'EXPENSE', behavior: 'VARIABLE', group: 'Selling Cost', note: 'What points earned on ordinary purchases cost, on the day they are given (MKT-D21)' },
];

/** normal side per account type — used for opening balances and report signs */
const DEBIT_POSITIVE: Record<FinAccountType, boolean> = {
  ASSET: true,
  EXPENSE: true,
  LIABILITY: false,
  EQUITY: false,
  INCOME: false,
};

export interface AccountBalance {
  id: string;
  code: string;
  name: string;
  type: FinAccountType;
  groupName: string | null;
  isMoneyAccount: boolean;
  payMethod: string | null;
  costBehavior: CostBehavior | null;
  isSystem: boolean;
  isActive: boolean;
  openingBalancePaisa: number;
  note: string | null;
  sortOrder: number;
  /** derived from the ledger (FIN-RULE-008) — signed to the account's normal side */
  balancePaisa: number;
  debitPaisa: number;
  creditPaisa: number;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ===================== seed & settings ===================== */

  /** Chart of Accounts + settings singleton, created on first read (Delivery pattern). */
  async ensureSeed(): Promise<void> {
    // idempotent: create what is missing and backfill group/description on an
    // existing database, so the chart can grow without a data migration
    const existing = await this.prisma.db.financeAccount.findMany({
      select: { id: true, code: true, groupName: true, note: true },
    });
    const byCode = new Map(existing.map((a) => [a.code, a]));
    const missing = CHART.filter((r) => !byCode.has(r.code));
    if (missing.length > 0)
      await this.prisma.db.financeAccount.createMany({
        data: missing.map((r) => ({
          code: r.code,
          name: r.name,
          type: r.type,
          groupName: r.group ?? null,
          isMoneyAccount: r.money ?? false,
          payMethod: r.payMethod ?? null,
          costBehavior: r.behavior ?? null,
          isSystem: true,
          note: r.note ?? null,
          sortOrder: CHART.indexOf(r) * 10,
        })),
        skipDuplicates: true,
      });
    for (const r of CHART) {
      const cur = byCode.get(r.code);
      if (!cur) continue;
      const needsGroup = !cur.groupName && !!r.group;
      const needsNote = !cur.note && !!r.note;
      if (needsGroup || needsNote)
        await this.prisma.db.financeAccount.update({
          where: { id: cur.id },
          data: {
            groupName: needsGroup ? r.group : undefined,
            note: needsNote ? r.note : undefined,
          },
        });
    }
    // same P2002 race as every other singleton — two callers seeding at once
    // both insert, and the loser used to take ensureSeed down with it
    await ensureSingleton(
      () => this.prisma.db.financeSetting.findUnique({ where: { id: 'singleton' } }),
      async () => {
        const cash = await this.prisma.db.financeAccount.findUnique({ where: { code: ACC.CASH } });
        return this.prisma.db.financeSetting.create({
          data: { id: 'singleton', defaultCashAccountId: cash?.id ?? null },
        });
      },
    );
  }

  async settings() {
    await this.ensureSeed();
    return this.prisma.db.financeSetting.findUnique({ where: { id: 'singleton' } });
  }

  async updateSettings(dto: SettingsWriteDto, opts?: { allowPeriodChange?: boolean }) {
    await this.ensureSeed();
    const data: Prisma.FinanceSettingUpdateInput = {};
    if (dto.goLiveDate !== undefined)
      data.goLiveDate = dto.goLiveDate ? new Date(dto.goLiveDate) : null;
    /*  lastClosedDate is deliberately NOT settable here.

        Closing a month goes through month-end (which also runs depreciation and
        refuses to close a month that has not ended), and reopening one goes
        through period/reopen (OWNER + PIN + an audit entry). Leaving it on this
        general settings endpoint meant the period lock could be lifted with a
        plain PATCH — no PIN, no trace — which makes the lock decorative.
        Found while testing the close button, closed the same day. */
    if (dto.lastClosedDate !== undefined && !opts?.allowPeriodChange)
      throw new BadRequestException(
        'Use Close month / Reopen month — the period lock is not a plain setting',
      );
    if (dto.lastClosedDate !== undefined && opts?.allowPeriodChange)
      data.lastClosedDate = dto.lastClosedDate ? new Date(dto.lastClosedDate) : null;
    if (dto.fiscalYearStartMonth !== undefined) data.fiscalYearStartMonth = dto.fiscalYearStartMonth;
    if (dto.defaultCashAccountId !== undefined) data.defaultCashAccountId = dto.defaultCashAccountId;
    if (dto.expenseApprovalThresholdPaisa !== undefined)
      data.expenseApprovalThresholdPaisa = dto.expenseApprovalThresholdPaisa;
    if (dto.paymentApprovalThresholdPaisa !== undefined)
      data.paymentApprovalThresholdPaisa = dto.paymentApprovalThresholdPaisa;
    if (dto.refundApprovalThresholdPaisa !== undefined)
      data.refundApprovalThresholdPaisa = dto.refundApprovalThresholdPaisa;
    if (dto.wastageApprovalThresholdPaisa !== undefined)
      data.wastageApprovalThresholdPaisa = dto.wastageApprovalThresholdPaisa;
    if (dto.labourBonusPercentBp !== undefined) data.labourBonusPercentBp = dto.labourBonusPercentBp;
    if (dto.assetThresholdPaisa !== undefined) data.assetThresholdPaisa = dto.assetThresholdPaisa;
    if (dto.autoPostEnabled !== undefined) data.autoPostEnabled = dto.autoPostEnabled;
    if (dto.vatEnabled !== undefined) data.vatEnabled = dto.vatEnabled;
    if (dto.vatRateBps !== undefined) data.vatRateBps = dto.vatRateBps;
    if (dto.vatInclusivePricing !== undefined) data.vatInclusivePricing = dto.vatInclusivePricing;
    if (dto.businessBin !== undefined) data.businessBin = dto.businessBin;
    if (dto.businessName !== undefined) data.businessName = dto.businessName;
    if (dto.businessAddress !== undefined) data.businessAddress = dto.businessAddress;
    if (dto.businessVatCircle !== undefined) data.businessVatCircle = dto.businessVatCircle;
    if (dto.signatoryName !== undefined) data.signatoryName = dto.signatoryName;
    if (dto.signatoryDesignation !== undefined) data.signatoryDesignation = dto.signatoryDesignation;
    if (dto.riderCashLimitPaisa !== undefined) data.riderCashLimitPaisa = dto.riderCashLimitPaisa;

    const row = await this.prisma.db.financeSetting.update({ where: { id: 'singleton' }, data });
    await this.audit.record({
      entityType: 'FinanceSetting',
      entityId: 'singleton',
      action: 'UPDATE',
      actorName: 'admin',
      changes: dto as Record<string, unknown>,
    });
    return row;
  }

  /* ===================== accounts ===================== */

  async accounts(): Promise<AccountBalance[]> {
    await this.ensureSeed();
    const rows = await this.prisma.db.financeAccount.findMany({
      where: { deletedAt: null },
      orderBy: [{ code: 'asc' }],
    });
    const sums = await this.prisma.db.journalLine.groupBy({
      by: ['accountId'],
      _sum: { debitPaisa: true, creditPaisa: true },
    });
    const byId = new Map<string, { d: number; c: number }>();
    for (const s of sums)
      byId.set(s.accountId, { d: s._sum.debitPaisa ?? 0, c: s._sum.creditPaisa ?? 0 });

    const out: AccountBalance[] = rows.map((a) => {
      const s = byId.get(a.id) ?? { d: 0, c: 0 };
      const signed = DEBIT_POSITIVE[a.type] ? s.d - s.c : s.c - s.d;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        groupName: a.groupName,
        isMoneyAccount: a.isMoneyAccount,
        payMethod: a.payMethod,
        costBehavior: a.costBehavior,
        isSystem: a.isSystem,
        isActive: a.isActive,
        openingBalancePaisa: a.openingBalancePaisa,
        note: a.note,
        sortOrder: a.sortOrder,
        balancePaisa: signed,
        debitPaisa: s.d,
        creditPaisa: s.c,
      };
    });
    return out;
  }

  /** header numbers for the Accounts screen — all computed here (FIN-RULE-016) */
  async accountsSummary() {
    const accs = await this.accounts();
    const setting = await this.settings();
    // an account can be switched off, but if it still holds money it must stay
    // visible — hidden cash is how a set of books starts lying
    const money = accs.filter((a) => a.isMoneyAccount && (a.isActive || a.balancePaisa !== 0));
    const cashPaisa = money.reduce((n, a) => n + a.balancePaisa, 0);
    const customerAdvance = accs.find((a) => a.code === ACC.CUSTOMER_ADVANCE)?.balancePaisa ?? 0;
    const carrierCash = accs.find((a) => a.code === ACC.CASH_WITH_CARRIER)?.balancePaisa ?? 0;
    const receivable = accs.find((a) => a.code === ACC.RECEIVABLE)?.balancePaisa ?? 0;
    const payable = accs.find((a) => a.code === ACC.SUPPLIER_PAYABLE)?.balancePaisa ?? 0;
    const openingPending = accs.reduce((n, a) => n + Math.abs(a.openingBalancePaisa), 0);
    return {
      cashPaisa,
      // DEC-FIN-027 — what is actually ours to spend
      spendablePaisa: cashPaisa - customerAdvance,
      customerAdvancePaisa: customerAdvance,
      carrierCashPaisa: carrierCash,
      receivablePaisa: receivable,
      payablePaisa: payable,
      moneyAccountCount: money.length,
      openingPosted: !!setting?.openingPostedAt,
      openingPendingPaisa: setting?.openingPostedAt ? 0 : openingPending,
      goLiveDate: setting?.goLiveDate ?? null,
      lastClosedDate: setting?.lastClosedDate ?? null,
      vatEnabled: setting?.vatEnabled ?? false,
    };
  }

  async createAccount(dto: AccountWriteDto) {
    await this.ensureSeed();
    if (!dto.code || !dto.name || !dto.type)
      throw new BadRequestException('code, name and type are required');
    if (dto.type === 'EXPENSE' && !dto.costBehavior)
      throw new BadRequestException(
        'An expense account needs a Fixed/Variable tag — break-even depends on it',
      );
    const exists = await this.prisma.db.financeAccount.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException(`Account code ${dto.code} already exists`);
    const row = await this.prisma.db.financeAccount.create({
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        groupName: dto.groupName ?? null,
        isMoneyAccount: dto.isMoneyAccount ?? false,
        payMethod: dto.payMethod ?? null,
        costBehavior: dto.costBehavior ?? null,
        openingBalancePaisa: dto.openingBalancePaisa ?? 0,
        note: dto.note ?? null,
        sortOrder: dto.sortOrder ?? 999,
        isSystem: false,
      },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: row.id,
      action: 'CREATE',
      actorName: 'admin',
      changes: dto as Record<string, unknown>,
    });
    return row;
  }

  async updateAccount(id: string, dto: AccountWriteDto) {
    const cur = await this.prisma.db.financeAccount.findUnique({ where: { id } });
    if (!cur || cur.deletedAt) throw new NotFoundException('Account not found');
    const setting = await this.settings();
    if (
      dto.openingBalancePaisa !== undefined &&
      dto.openingBalancePaisa !== cur.openingBalancePaisa &&
      setting?.openingPostedAt
    )
      throw new BadRequestException(
        'Opening balances are locked — they were already posted to the ledger',
      );
    if (cur.isSystem && dto.type && dto.type !== cur.type)
      throw new BadRequestException('A system account cannot change its type');
    // turning off an account that still holds money would quietly hide it from
    // "money on hand" — the fastest way to make the books lie
    if (dto.isActive === false && cur.isMoneyAccount) {
      const bal = (await this.accounts()).find((a) => a.id === id)?.balancePaisa ?? 0;
      if (bal !== 0)
        throw new BadRequestException(
          `${cur.name} still holds ${(bal / 100).toLocaleString()} tk — move that money somewhere else first, then turn it off`,
        );
    }

    const data: Prisma.FinanceAccountUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.groupName !== undefined) data.groupName = dto.groupName;
    if (dto.isMoneyAccount !== undefined && !cur.isSystem) data.isMoneyAccount = dto.isMoneyAccount;
    if (dto.payMethod !== undefined) data.payMethod = dto.payMethod;
    if (dto.costBehavior !== undefined) data.costBehavior = dto.costBehavior;
    if (dto.openingBalancePaisa !== undefined) data.openingBalancePaisa = dto.openingBalancePaisa;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const row = await this.prisma.db.financeAccount.update({ where: { id }, data });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: 'admin',
      changes: dto as Record<string, unknown>,
    });
    return row;
  }

  async removeAccount(id: string) {
    const cur = await this.prisma.db.financeAccount.findUnique({ where: { id } });
    if (!cur || cur.deletedAt) throw new NotFoundException('Account not found');
    if (cur.isSystem)
      throw new BadRequestException(
        'This account is used by the posting engine — it can be renamed or hidden, not deleted',
      );
    const used = await this.prisma.db.journalLine.count({ where: { accountId: id } });
    if (used > 0)
      throw new BadRequestException(
        `This account already has ${used} ledger lines — turn it off instead of deleting`,
      );
    await this.prisma.db.financeAccount.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'DELETE',
      actorName: 'admin',
    });
    return { ok: true };
  }

  /* ===================== posting engine ===================== */

  private async nextNo(prefix: string): Promise<string> {
    // same max+1 pattern as the other modules; the @unique column + retry in
    // postEntry() covers the race (D8 lesson, DEC-FIN-018)
    const last = await this.prisma.db.journalEntry.findFirst({
      where: { entryNo: { startsWith: `${prefix}-` } },
      orderBy: { entryNo: 'desc' },
      select: { entryNo: true },
    });
    const n = last ? Number(last.entryNo.split('-')[1]) + 1 : 1;
    return `${prefix}-${String(n).padStart(6, '0')}`;
  }

  private async resolveAccountIds(lines: LineInput[]): Promise<Map<string, string>> {
    const codes = lines.map((l) => l.accountCode).filter((c): c is string => !!c);
    if (codes.length === 0) return new Map<string, string>();
    const rows = await this.prisma.db.financeAccount.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.code, r.id);
    for (const c of codes)
      if (!map.has(c)) throw new BadRequestException(`Unknown account code ${c}`);
    return map;
  }

  private lineAccountId(l: LineInput, codeMap: Map<string, string>): string {
    const id = l.accountId ?? (l.accountCode ? codeMap.get(l.accountCode) : undefined);
    if (!id)
      throw new BadRequestException(
        `Journal line has no account (code=${l.accountCode ?? '-'}) — the chart of accounts may be incomplete`,
      );
    return id;
  }

  /**
   * The single door into the ledger. Balanced, idempotent, period-aware.
   * Returns null when the entry was skipped as a duplicate (DEC-FIN-023).
   */
  async postEntry(input: PostEntryInput) {
    await this.ensureSeed();
    const lines = (input.lines ?? []).filter(
      (l) => (l.debitPaisa ?? 0) !== 0 || (l.creditPaisa ?? 0) !== 0,
    );
    if (lines.length < 2)
      throw new BadRequestException('A journal entry needs at least two lines');

    const debit = lines.reduce((n, l) => n + (l.debitPaisa ?? 0), 0);
    const credit = lines.reduce((n, l) => n + (l.creditPaisa ?? 0), 0);
    if (debit !== credit)
      throw new BadRequestException(
        `Entry does not balance: debit ${debit} vs credit ${credit} (FIN-RULE-002)`,
      );
    if (lines.some((l) => (l.debitPaisa ?? 0) < 0 || (l.creditPaisa ?? 0) < 0))
      throw new BadRequestException('Negative amounts are not allowed — use the other side');

    const entryDate = input.entryDate ? new Date(input.entryDate) : new Date();
    const setting = await this.settings();
    if (setting?.lastClosedDate && entryDate <= setting.lastClosedDate)
      throw new BadRequestException(
        `Period is closed up to ${setting.lastClosedDate.toISOString().slice(0, 10)} — pick a later date (FIN-RULE-023)`,
      );

    if (input.sourceKey) {
      const dup = await this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: input.sourceKey },
        select: { id: true },
      });
      if (dup) return null; // already posted — silently skip (FIN-RULE-021)
    }

    const codeMap = await this.resolveAccountIds(lines);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const entryNo = await this.nextNo('JV');
      try {
        return await this.prisma.db.journalEntry.create({
          data: {
            entryNo,
            entryDate,
            sourceType: input.sourceType,
            sourceId: input.sourceId ?? null,
            sourceKey: input.sourceKey ?? null,
            narration: input.narration,
            branchId: input.branchId ?? null,
            carrierId: input.carrierId ?? null,
            reversesId: input.reversesId ?? null,
            isManual: input.isManual ?? false,
            actorName: input.actorName ?? null,
            lines: {
              create: lines.map((l) => ({
                accountId: this.lineAccountId(l, codeMap),
                debitPaisa: l.debitPaisa ?? 0,
                creditPaisa: l.creditPaisa ?? 0,
                partnerId: l.partnerId ?? null,
                employeeName: l.employeeName ?? null,
                employeeId: l.employeeId ?? null, // HR-D06 dimension
                orderId: l.orderId ?? null,
                itemId: l.itemId ?? null,
                occasion: l.occasion ?? null,
                zone: l.zone ?? null,
                channelId: l.channelId ?? null,
                note: l.note ?? null,
              })),
            },
          },
          include: { lines: true },
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
        if (code === 'P2002' && target.includes('sourceKey')) return null; // raced duplicate
        if (code === 'P2002' && attempt < 2) continue; // raced entryNo — retry
        throw e;
      }
    }
    throw new BadRequestException('Could not allocate a journal number, please retry');
  }

  /* ===================== opening balances (W6) ===================== */

  async postOpening(dto: PostOpeningDto) {
    await this.ensureSeed();
    const setting = await this.settings();
    if (setting?.openingPostedAt)
      throw new BadRequestException('Opening balances were already posted');

    const accs = await this.prisma.db.financeAccount.findMany({
      where: { deletedAt: null, openingBalancePaisa: { not: 0 } },
    });
    if (accs.length === 0)
      throw new BadRequestException('No opening balance has been entered yet');

    const lines: LineInput[] = [];
    let net = 0;
    for (const a of accs) {
      const amt = a.openingBalancePaisa;
      if (DEBIT_POSITIVE[a.type]) {
        lines.push({ accountId: a.id, debitPaisa: amt, note: 'Opening balance' });
        net += amt;
      } else {
        lines.push({ accountId: a.id, creditPaisa: amt, note: 'Opening balance' });
        net -= amt;
      }
    }
    // the difference is what the business is actually worth on day one
    const retained = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC.RETAINED },
    });
    if (net !== 0 && retained)
      lines.push(
        net > 0
          ? { accountId: retained.id, creditPaisa: net, note: 'Opening net worth' }
          : { accountId: retained.id, debitPaisa: -net, note: 'Opening net worth' },
      );

    const entry = await this.postEntry({
      sourceType: 'OPENING',
      sourceKey: 'OPENING:singleton:v1',
      entryDate: dto.entryDate ?? setting?.goLiveDate ?? new Date(),
      narration: 'Opening balances (go-live)',
      isManual: true,
      actorName: dto.actorName ?? 'admin',
      lines,
    });
    await this.prisma.db.financeSetting.update({
      where: { id: 'singleton' },
      data: { openingPostedAt: new Date() },
    });
    return entry;
  }

  /* ===================== reconciliation (W5) ===================== */

  async reconcile(dto: ReconcileDto) {
    const accs = await this.accounts();
    const acc = accs.find((a) => a.id === dto.accountId);
    if (!acc) throw new NotFoundException('Account not found');
    if (!acc.isMoneyAccount)
      throw new BadRequestException('Only a money account can be counted');

    const diff = dto.countedBalancePaisa - acc.balancePaisa;
    const asOf = dto.asOfDate ? new Date(dto.asOfDate) : new Date();
    const last = await this.prisma.db.accountReconciliation.findFirst({
      orderBy: { reconNo: 'desc' },
      select: { reconNo: true },
    });
    const n = last ? Number(last.reconNo.split('-')[1]) + 1 : 1;
    const reconNo = `REC-${String(n).padStart(6, '0')}`;

    let entryId: string | null = null;
    if (diff !== 0) {
      const shortAcc = await this.prisma.db.financeAccount.findUnique({
        where: { code: ACC.CASH_SHORT },
      });
      const overAcc = await this.prisma.db.financeAccount.findUnique({
        where: { code: ACC.CASH_OVER },
      });
      const lines: LineInput[] =
        diff < 0
          ? [
              { accountId: shortAcc?.id, debitPaisa: -diff, note: 'Counted less than the books' },
              { accountId: acc.id, creditPaisa: -diff },
            ]
          : [
              { accountId: acc.id, debitPaisa: diff },
              { accountId: overAcc?.id, creditPaisa: diff, note: 'Counted more than the books' },
            ];
      const entry = await this.postEntry({
        sourceType: 'RECONCILE',
        sourceKey: `RECONCILE:${reconNo}:diff`,
        entryDate: asOf,
        narration: `${acc.name} counted — difference ${(diff / 100).toFixed(2)}`,
        isManual: true,
        actorName: dto.actorName ?? 'admin',
        lines,
      });
      entryId = entry?.id ?? null;
    }

    const row = await this.prisma.db.accountReconciliation.create({
      data: {
        reconNo,
        accountId: acc.id,
        asOfDate: asOf,
        systemBalancePaisa: acc.balancePaisa,
        countedBalancePaisa: dto.countedBalancePaisa,
        differencePaisa: diff,
        journalEntryId: entryId,
        note: dto.note ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });
    await this.audit.record({
      entityType: 'AccountReconciliation',
      entityId: row.id,
      action: 'CREATE',
      actorName: dto.actorName ?? 'admin',
      changes: { account: acc.code, diff },
    });
    return row;
  }

  async reconciliations(accountId?: string) {
    return this.prisma.db.accountReconciliation.findMany({
      where: accountId ? { accountId } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { account: { select: { code: true, name: true } } },
    });
  }

  /* ===================== ledger ===================== */

  async ledger(params: { accountId?: string; from?: string; to?: string; take?: number }) {
    await this.ensureSeed();
    const where: Prisma.JournalEntryWhereInput = {};
    if (params.from || params.to) {
      where.entryDate = {};
      if (params.from) (where.entryDate as Prisma.DateTimeFilter).gte = new Date(params.from);
      if (params.to) (where.entryDate as Prisma.DateTimeFilter).lte = new Date(params.to);
    }
    if (params.accountId) where.lines = { some: { accountId: params.accountId } };

    const rows = await this.prisma.db.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { entryNo: 'desc' }],
      take: Math.min(params.take ?? 100, 500),
      include: {
        lines: { include: { account: { select: { code: true, name: true, type: true } } } },
      },
    });
    return rows;
  }

  /* ===================== manual money forms (W2) =====================
     The four things that never come from an operational module:
     expense · income · transfer between our own accounts · partner capital.
     The owner fills a plain form; the double entry is built here. */

  private async nextDocNo(
    prefix: string,
    read: (p: string) => Promise<string | null>,
  ): Promise<string> {
    const last = await read(prefix);
    const n = last ? Number(last.split('-')[1]) + 1 : 1;
    return `${prefix}-${String(n).padStart(6, '0')}`;
  }

  private async moneyAccount(id: string) {
    const a = await this.prisma.db.financeAccount.findUnique({ where: { id } });
    if (!a || a.deletedAt) throw new NotFoundException('Account not found');
    return a;
  }

  /* ---------------- expense ---------------- */

  async expenses(params: { approval?: string } = {}) {
    await this.ensureSeed();
    return this.prisma.db.expense.findMany({
      where: params.approval ? { approval: params.approval as never } : {},
      orderBy: [{ spentAt: 'desc' }, { expenseNo: 'desc' }],
      take: 200,
      include: {
        account: { select: { code: true, name: true, costBehavior: true } },
        paidFrom: { select: { code: true, name: true } },
      },
    });
  }

  async createExpense(dto: ExpenseWriteDto) {
    await this.ensureSeed();
    if (!dto.accountId || !dto.paidFromId || !dto.amountPaisa)
      throw new BadRequestException('Category, account and amount are all required');
    if (dto.amountPaisa <= 0) throw new BadRequestException('Amount must be more than zero');

    const cat = await this.moneyAccount(dto.accountId);
    if (cat.type !== 'EXPENSE')
      throw new BadRequestException(`${cat.name} is not an expense heading`);
    const from = await this.moneyAccount(dto.paidFromId);
    if (!from.isMoneyAccount)
      throw new BadRequestException(`${from.name} is not a place money sits`);

    const setting = await this.settings();
    const threshold = setting?.expenseApprovalThresholdPaisa ?? 0;
    const needsApproval = threshold > 0 && dto.amountPaisa >= threshold;

    const expenseNo = await this.nextDocNo('EXP', async (p) => {
      const r = await this.prisma.db.expense.findFirst({
        where: { expenseNo: { startsWith: `${p}-` } },
        orderBy: { expenseNo: 'desc' },
        select: { expenseNo: true },
      });
      return r?.expenseNo ?? null;
    });

    const row = await this.prisma.db.expense.create({
      data: {
        expenseNo,
        spentAt: dto.spentAt ? new Date(dto.spentAt) : new Date(),
        accountId: cat.id,
        paidFromId: from.id,
        amountPaisa: dto.amountPaisa,
        payeeName: dto.payeeName ?? null,
        note: dto.note ?? null,
        attachmentUrl: dto.attachmentUrl ?? null,
        partnerId: dto.partnerId ?? null,
        branchId: dto.branchId ?? null,
        // MKT-D05 — just a tag. The taka stays here, in one ledger.
        campaignId: dto.campaignId ?? null,
        actorName: dto.actorName ?? 'admin',
        approval: needsApproval ? 'PENDING' : 'AUTO',
      },
    });

    if (!needsApproval) await this.postExpense(row.id);
    await this.audit.record({
      entityType: 'Expense',
      entityId: row.id,
      action: 'CREATE',
      actorName: dto.actorName ?? 'admin',
      changes: { amountPaisa: dto.amountPaisa, account: cat.code, needsApproval },
    });
    return this.prisma.db.expense.findUnique({ where: { id: row.id } });
  }

  /** writes the journal for an expense that is allowed to post (FIN-RULE-009) */
  private async postExpense(id: string) {
    const e = await this.prisma.db.expense.findUnique({ where: { id } });
    if (!e || e.journalEntryId) return null;
    const entry = await this.postEntry({
      sourceType: 'EXPENSE',
      sourceId: e.id,
      sourceKey: `EXPENSE:${e.id}:paid`,
      entryDate: e.spentAt,
      narration: e.note?.trim() ? e.note : `Expense ${e.expenseNo}`,
      branchId: e.branchId,
      isManual: true,
      actorName: e.actorName,
      lines: [
        { accountId: e.accountId, debitPaisa: e.amountPaisa, partnerId: e.partnerId },
        { accountId: e.paidFromId, creditPaisa: e.amountPaisa },
      ],
    });
    if (entry)
      await this.prisma.db.expense.update({
        where: { id: e.id },
        data: { journalEntryId: entry.id },
      });
    return entry;
  }

  async approveExpense(id: string, dto: ApprovalActionDto) {
    const e = await this.prisma.db.expense.findUnique({ where: { id } });
    if (!e || e.deletedAt) throw new NotFoundException('Expense not found');
    if (e.approval !== 'PENDING') throw new BadRequestException('This one is not waiting for approval');
    await this.prisma.db.expense.update({
      where: { id },
      data: { approval: 'APPROVED', approvedBy: dto.actorName ?? 'admin', approvedAt: new Date() },
    });
    await this.postExpense(id);
    await this.audit.record({
      entityType: 'Expense',
      entityId: id,
      action: 'UPDATE',
      actorName: dto.actorName ?? 'admin',
      changes: { approval: 'APPROVED' },
    });
    return this.prisma.db.expense.findUnique({ where: { id } });
  }

  async declineExpense(id: string, dto: ApprovalActionDto) {
    const e = await this.prisma.db.expense.findUnique({ where: { id } });
    if (!e || e.deletedAt) throw new NotFoundException('Expense not found');
    if (e.approval !== 'PENDING') throw new BadRequestException('This one is not waiting for approval');
    const row = await this.prisma.db.expense.update({
      where: { id },
      data: {
        approval: 'DECLINED',
        approvedBy: dto.actorName ?? 'admin',
        approvedAt: new Date(),
        note: dto.reason ? `${e.note ?? ''} · declined: ${dto.reason}`.trim() : e.note,
      },
    });
    return row;
  }

  async removeExpense(id: string) {
    const e = await this.prisma.db.expense.findUnique({ where: { id } });
    if (!e || e.deletedAt) throw new NotFoundException('Expense not found');
    if (e.journalEntryId)
      throw new BadRequestException(
        'This is already in the ledger — it can only be corrected with a reversing entry (FIN-RULE-003)',
      );
    await this.prisma.db.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /* ---------------- income ---------------- */

  async incomes() {
    await this.ensureSeed();
    return this.prisma.db.income.findMany({
      orderBy: [{ earnedAt: 'desc' }, { incomeNo: 'desc' }],
      take: 200,
      include: {
        account: { select: { code: true, name: true } },
        receivedIn: { select: { code: true, name: true } },
      },
    });
  }

  async createIncome(dto: IncomeWriteDto) {
    await this.ensureSeed();
    if (!dto.accountId || !dto.receivedInId || !dto.amountPaisa)
      throw new BadRequestException('Heading, account and amount are all required');
    if (dto.amountPaisa <= 0) throw new BadRequestException('Amount must be more than zero');

    const cat = await this.moneyAccount(dto.accountId);
    if (cat.type !== 'INCOME') throw new BadRequestException(`${cat.name} is not an income heading`);
    if (cat.code === ACC.SALES)
      throw new BadRequestException(
        'Sales income is posted by the Sales/POS modules — this form is only for other income',
      );
    const into = await this.moneyAccount(dto.receivedInId);
    if (!into.isMoneyAccount)
      throw new BadRequestException(`${into.name} is not a place money sits`);

    const incomeNo = await this.nextDocNo('INC', async (p) => {
      const r = await this.prisma.db.income.findFirst({
        where: { incomeNo: { startsWith: `${p}-` } },
        orderBy: { incomeNo: 'desc' },
        select: { incomeNo: true },
      });
      return r?.incomeNo ?? null;
    });

    const row = await this.prisma.db.income.create({
      data: {
        incomeNo,
        earnedAt: dto.earnedAt ? new Date(dto.earnedAt) : new Date(),
        accountId: cat.id,
        receivedInId: into.id,
        amountPaisa: dto.amountPaisa,
        payerName: dto.payerName ?? null,
        note: dto.note ?? null,
        branchId: dto.branchId ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });

    const entry = await this.postEntry({
      sourceType: 'INCOME',
      sourceId: row.id,
      sourceKey: `INCOME:${row.id}:received`,
      entryDate: row.earnedAt,
      narration: row.note?.trim() ? row.note : `Income ${row.incomeNo}`,
      branchId: row.branchId,
      isManual: true,
      actorName: row.actorName,
      lines: [
        { accountId: into.id, debitPaisa: row.amountPaisa },
        { accountId: cat.id, creditPaisa: row.amountPaisa },
      ],
    });
    if (entry)
      await this.prisma.db.income.update({
        where: { id: row.id },
        data: { journalEntryId: entry.id },
      });
    return this.prisma.db.income.findUnique({ where: { id: row.id } });
  }

  /* ---------------- transfer between our own accounts ---------------- */

  async transfers() {
    await this.ensureSeed();
    return this.prisma.db.transfer.findMany({
      orderBy: [{ movedAt: 'desc' }, { transferNo: 'desc' }],
      take: 200,
      include: {
        from: { select: { code: true, name: true } },
        to: { select: { code: true, name: true } },
      },
    });
  }

  async createTransfer(dto: TransferWriteDto) {
    await this.ensureSeed();
    if (!dto.fromId || !dto.toId || !dto.amountPaisa)
      throw new BadRequestException('From, to and amount are all required');
    if (dto.fromId === dto.toId)
      throw new BadRequestException('Money cannot move to the same place it came from');
    if (dto.amountPaisa <= 0) throw new BadRequestException('Amount must be more than zero');

    const from = await this.moneyAccount(dto.fromId);
    const to = await this.moneyAccount(dto.toId);
    if (!from.isMoneyAccount || !to.isMoneyAccount)
      throw new BadRequestException('Both sides must be a place money sits');

    const fee = dto.feePaisa ?? 0;
    const transferNo = await this.nextDocNo('TRN', async (p) => {
      const r = await this.prisma.db.transfer.findFirst({
        where: { transferNo: { startsWith: `${p}-` } },
        orderBy: { transferNo: 'desc' },
        select: { transferNo: true },
      });
      return r?.transferNo ?? null;
    });

    const row = await this.prisma.db.transfer.create({
      data: {
        transferNo,
        movedAt: dto.movedAt ? new Date(dto.movedAt) : new Date(),
        fromId: from.id,
        toId: to.id,
        amountPaisa: dto.amountPaisa,
        feePaisa: fee,
        note: dto.note ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });

    const charge = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC.BANK_CHARGE },
    });
    const lines: LineInput[] = [
      { accountId: to.id, debitPaisa: dto.amountPaisa },
      { accountId: from.id, creditPaisa: dto.amountPaisa + fee },
    ];
    if (fee > 0 && charge)
      lines.splice(1, 0, { accountId: charge.id, debitPaisa: fee, note: 'Cash-out / transfer charge' });

    const entry = await this.postEntry({
      sourceType: 'TRANSFER',
      sourceId: row.id,
      sourceKey: `TRANSFER:${row.id}:moved`,
      entryDate: row.movedAt,
      narration: row.note?.trim() ? row.note : `${from.name} → ${to.name}`,
      isManual: true,
      actorName: row.actorName,
      lines,
    });
    if (entry)
      await this.prisma.db.transfer.update({
        where: { id: row.id },
        data: { journalEntryId: entry.id },
      });
    return this.prisma.db.transfer.findUnique({ where: { id: row.id } });
  }

  /* ---------------- partners (DEC-FIN-004 / 005) ---------------- */

  async partners() {
    await this.ensureSeed();
    const rows = await this.prisma.db.partner.findMany({
      where: { deletedAt: null },
      orderBy: { joinedAt: 'asc' },
      include: { transactions: { where: { deletedAt: null }, orderBy: { happenedAt: 'desc' } } },
    });
    return rows.map((p) => {
      const sum = (k: string) =>
        p.transactions.filter((t) => t.kind === k).reduce((n, t) => n + t.amountPaisa, 0);
      const capitalIn = sum('CAPITAL_IN');
      const capitalReturned = sum('CAPITAL_RETURN');
      const drawings = sum('DRAWING');
      const salary = sum('SALARY');
      const profitShare = sum('PROFIT_SHARE') + sum('BONUS');
      return {
        ...p,
        capitalInPaisa: capitalIn,
        capitalReturnedPaisa: capitalReturned,
        capitalOutstandingPaisa: capitalIn - capitalReturned,
        drawingsPaisa: drawings,
        salaryPaidPaisa: salary,
        profitSharePaisa: profitShare,
        /** what this partner still has in the business */
        standingPaisa: capitalIn - capitalReturned - drawings + profitShare,
      };
    });
  }

  async createPartner(dto: PartnerWriteDto) {
    await this.ensureSeed();
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    return this.prisma.db.partner.create({
      data: {
        name: dto.name.trim(),
        kind: dto.kind ?? 'CAPITAL',
        sharePercentBp: dto.sharePercentBp ?? 0,
        monthlySalaryPaisa: dto.monthlySalaryPaisa ?? 0,
        phone: dto.phone ?? null,
        note: dto.note ?? null,
        joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : new Date(),
      },
    });
  }

  async updatePartner(id: string, dto: PartnerWriteDto) {
    const cur = await this.prisma.db.partner.findUnique({ where: { id } });
    if (!cur || cur.deletedAt) throw new NotFoundException('Partner not found');
    return this.prisma.db.partner.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        kind: dto.kind ?? undefined,
        sharePercentBp: dto.sharePercentBp ?? undefined,
        monthlySalaryPaisa: dto.monthlySalaryPaisa ?? undefined,
        phone: dto.phone === undefined ? undefined : dto.phone,
        note: dto.note === undefined ? undefined : dto.note,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async removePartner(id: string) {
    const used = await this.prisma.db.partnerTransaction.count({ where: { partnerId: id } });
    if (used > 0)
      throw new BadRequestException(
        'This partner already has money movements — turn them off instead of deleting',
      );
    await this.prisma.db.partner.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /**
   * Money in or out for a partner. SALARY is an expense; CAPITAL_IN / DRAWING /
   * CAPITAL_RETURN touch equity only — never mixed (FIN-RULE-010).
   */
  async partnerTransaction(dto: PartnerTxnDto) {
    await this.ensureSeed();
    if (!dto.amountPaisa || dto.amountPaisa <= 0)
      throw new BadRequestException('Amount must be more than zero');
    const p = await this.prisma.db.partner.findUnique({ where: { id: dto.partnerId } });
    if (!p || p.deletedAt) throw new NotFoundException('Partner not found');

    const setting = await this.settings();
    const accId = dto.accountId ?? setting?.defaultCashAccountId ?? '';
    const money = await this.moneyAccount(accId);
    if (!money.isMoneyAccount)
      throw new BadRequestException(`${money.name} is not a place money sits`);

    const capital = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC.PARTNER_CAPITAL },
    });
    const drawings = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC.PARTNER_DRAWINGS },
    });
    const salaryAcc = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC.PARTNER_SALARY },
    });
    if (!capital || !drawings || !salaryAcc)
      throw new BadRequestException('Partner accounts are missing from the chart of accounts');

    const when = dto.happenedAt ? new Date(dto.happenedAt) : new Date();
    const row = await this.prisma.db.partnerTransaction.create({
      data: {
        partnerId: p.id,
        kind: dto.kind,
        amountPaisa: dto.amountPaisa,
        happenedAt: when,
        fromAccountId: money.id,
        note: dto.note ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });

    let lines: LineInput[];
    let narration: string;
    if (dto.kind === 'CAPITAL_IN') {
      narration = `${p.name} put money into the business`;
      lines = [
        { accountId: money.id, debitPaisa: dto.amountPaisa },
        { accountId: capital.id, creditPaisa: dto.amountPaisa, partnerId: p.id },
      ];
    } else if (dto.kind === 'SALARY') {
      narration = `${p.name} — monthly salary`;
      lines = [
        { accountId: salaryAcc.id, debitPaisa: dto.amountPaisa, partnerId: p.id },
        { accountId: money.id, creditPaisa: dto.amountPaisa },
      ];
    } else {
      narration =
        dto.kind === 'CAPITAL_RETURN'
          ? `${p.name} — capital returned`
          : `${p.name} took money out`;
      lines = [
        { accountId: drawings.id, debitPaisa: dto.amountPaisa, partnerId: p.id },
        { accountId: money.id, creditPaisa: dto.amountPaisa },
      ];
    }

    const entry = await this.postEntry({
      sourceType: 'PARTNER',
      sourceId: row.id,
      sourceKey: `PARTNER:${row.id}:${dto.kind}`,
      entryDate: when,
      narration: dto.note?.trim() ? dto.note : narration,
      isManual: true,
      actorName: dto.actorName ?? 'admin',
      lines,
    });
    if (entry)
      await this.prisma.db.partnerTransaction.update({
        where: { id: row.id },
        data: { journalEntryId: entry.id },
      });
    await this.audit.record({
      entityType: 'PartnerTransaction',
      entityId: row.id,
      action: 'CREATE',
      actorName: dto.actorName ?? 'admin',
      changes: { partner: p.name, kind: dto.kind, amountPaisa: dto.amountPaisa },
    });
    return row;
  }

  /* ===================== overview (the money picture) =====================
     Every number is computed here, never in the browser (FIN-RULE-016 / D1). */

  async overview(monthsBack = 0) {
    await this.ensureSeed();
    const lastDriftRow = await this.prisma.db.auditLog.findFirst({
      where: { entityType: 'FinanceDrift' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, changes: true },
    });
    const dc = (lastDriftRow?.changes ?? null) as {
      worst?: string;
      wrongCount?: number;
      watchCount?: number;
    } | null;
    const lastDrift = lastDriftRow
      ? {
          ranAt: lastDriftRow.createdAt.toISOString(),
          worst: dc?.worst ?? 'ok',
          wrongCount: dc?.wrongCount ?? 0,
          watchCount: dc?.watchCount ?? 0,
        }
      : null;
    const accs = await this.accounts();
    const byId = new Map(accs.map((a) => [a.id, a]));

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0, 23, 59, 59);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - monthsBack - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - monthsBack, 0, 23, 59, 59);

    const periodSums = async (from: Date, to: Date) => {
      const rows = await this.prisma.db.journalLine.groupBy({
        by: ['accountId'],
        where: { entry: { entryDate: { gte: from, lte: to } } },
        _sum: { debitPaisa: true, creditPaisa: true },
      });
      let income = 0;
      let expense = 0;
      let cogs = 0;
      let fixed = 0;
      let variable = 0;
      const expenseByAccount: { code: string; name: string; paisa: number }[] = [];
      for (const r of rows) {
        const a = byId.get(r.accountId);
        if (!a) continue;
        const d = r._sum.debitPaisa ?? 0;
        const c = r._sum.creditPaisa ?? 0;
        if (a.type === 'INCOME') income += c - d;
        if (a.type === 'EXPENSE') {
          const amt = d - c;
          expense += amt;
          if (a.groupName === 'Cost of Goods Sold') cogs += amt;
          if (a.costBehavior === 'FIXED') fixed += amt;
          else variable += amt;
          if (amt !== 0) expenseByAccount.push({ code: a.code, name: a.name, paisa: amt });
        }
      }
      expenseByAccount.sort((x, y) => y.paisa - x.paisa);
      return { income, expense, cogs, fixed, variable, profit: income - expense, expenseByAccount };
    };

    const cur = await periodSums(start, end);
    const prev = await periodSums(prevStart, prevEnd);

    // break-even: what sales are needed just to cover the fixed costs
    const contributionPaisa = cur.income - cur.variable;
    const marginBp = cur.income > 0 ? Math.round((contributionPaisa / cur.income) * 10000) : 0;
    // with almost no sales the margin is guesswork, so don't pretend to know the
    // break-even point — the screen says "not enough sales yet" instead
    const marginIsReliable = cur.income >= 5000000 || cur.income >= cur.fixed / 4;
    const rawBreakEven = marginBp > 0 ? (cur.fixed / marginBp) * 10000 : 0;
    const breakEvenPaisa =
      marginIsReliable && rawBreakEven > 0 ? Math.round(rawBreakEven / 100) * 100 : 0; // whole taka
    const breakEvenProgressBp =
      breakEvenPaisa > 0 ? Math.min(10000, Math.round((cur.income / breakEvenPaisa) * 10000)) : 0;

    const money = accs.filter((a) => a.isMoneyAccount && (a.isActive || a.balancePaisa !== 0));
    const cashPaisa = money.reduce((n, a) => n + a.balancePaisa, 0);
    const pick = (code: string) => accs.find((a) => a.code === code)?.balancePaisa ?? 0;
    const customerAdvance = pick(ACC.CUSTOMER_ADVANCE);
    const spendable = cashPaisa - customerAdvance;

    // how long the money lasts at the current fixed burn
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyFixed = cur.fixed > 0 ? cur.fixed / daysInMonth : 0;
    const runwayDays = dailyFixed > 0 ? Math.floor(spendable / dailyFixed) : null;

    const [pendingApprovals, failures, recurringRows, staffRows, partnerRows] = await Promise.all([
      this.prisma.db.expense.count({ where: { approval: 'PENDING', deletedAt: null } }),
      this.prisma.db.financePostingFailure.count({ where: { resolvedAt: null } }),
      this.recurring(),
      this.staffAdvances(),
      this.partners(),
    ]);

    return {
      period: { from: start.toISOString(), to: end.toISOString(), monthsBack },
      cashPaisa,
      spendablePaisa: spendable,
      customerAdvancePaisa: customerAdvance,
      carrierCashPaisa: pick(ACC.CASH_WITH_CARRIER),
      receivablePaisa: pick(ACC.RECEIVABLE),
      payablePaisa: pick(ACC.SUPPLIER_PAYABLE),
      inventoryPaisa: pick(ACC.INVENTORY),
      goodsOutPaisa: pick(ACC.GOODS_OUT),
      vatPayablePaisa: pick(ACC.VAT_PAYABLE),
      moneyAccounts: money.map((a) => ({ id: a.id, code: a.code, name: a.name, balancePaisa: a.balancePaisa })),

      incomePaisa: cur.income,
      expensePaisa: cur.expense,
      cogsPaisa: cur.cogs,
      profitPaisa: cur.profit,
      fixedCostPaisa: cur.fixed,
      variableCostPaisa: cur.variable,
      prevProfitPaisa: prev.profit,
      prevIncomePaisa: prev.income,
      topExpenses: cur.expenseByAccount.slice(0, 6),

      breakEvenPaisa,
      breakEvenProgressBp,
      contributionMarginBp: marginBp,
      runwayDays,

      staffAdvanceOutstandingPaisa: staffRows.reduce((n, s) => n + s.outstandingPaisa, 0),
      partnerCapitalOutstandingPaisa: partnerRows.reduce((n, p) => n + p.capitalOutstandingPaisa, 0),
      dueRecurringCount: recurringRows.filter((r) => r.isDue).length,
      pendingApprovalCount: pendingApprovals,
      postingFailureCount: failures,

      /*  The nightly books-vs-shop verdict, read straight from the audit trail.
          It belongs on the Overview and not only on its own screen: a drift
          nobody opens the page to look at is a drift nobody finds. */
      drift: lastDrift,
    };
  }

  /* =============== G1 · recurring expense (rent, internet, salary) ===============
     The system prepares the draft when it falls due; the owner posts it.
     Nothing is ever written to the ledger without a click. */

  async recurring() {
    await this.ensureSeed();
    const rows = await this.prisma.db.recurringExpense.findMany({
      where: { deletedAt: null },
      orderBy: { dayOfMonth: 'asc' },
    });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return rows.map((r) => {
      const started = r.startsOn <= now;
      const ended = r.endsOn ? r.endsOn < monthStart : false;
      const postedThisMonth = r.lastPostedFor
        ? r.lastPostedFor.getTime() === monthStart.getTime()
        : false;
      const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(r.dayOfMonth, 28));
      return {
        ...r,
        postedThisMonth,
        isDue: r.isActive && started && !ended && !postedThisMonth && now >= dueDate,
        dueOn: dueDate.toISOString(),
      };
    });
  }

  async createRecurring(dto: RecurringWriteDto) {
    await this.ensureSeed();
    if (!dto.name?.trim() || !dto.accountId || !dto.paidFromId || !dto.amountPaisa)
      throw new BadRequestException('Name, heading, account and amount are all required');
    const cat = await this.moneyAccount(dto.accountId);
    if (cat.type !== 'EXPENSE') throw new BadRequestException('Pick an expense heading');
    return this.prisma.db.recurringExpense.create({
      data: {
        name: dto.name.trim(),
        accountId: dto.accountId,
        paidFromId: dto.paidFromId,
        amountPaisa: dto.amountPaisa,
        dayOfMonth: Math.min(Math.max(dto.dayOfMonth ?? 1, 1), 28),
        startsOn: dto.startsOn ? new Date(dto.startsOn) : new Date(),
        endsOn: dto.endsOn ? new Date(dto.endsOn) : null,
        note: dto.note ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });
  }

  async updateRecurring(id: string, dto: RecurringWriteDto) {
    const cur = await this.prisma.db.recurringExpense.findUnique({ where: { id } });
    if (!cur || cur.deletedAt) throw new NotFoundException('Not found');
    return this.prisma.db.recurringExpense.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        amountPaisa: dto.amountPaisa ?? undefined,
        accountId: dto.accountId ?? undefined,
        paidFromId: dto.paidFromId ?? undefined,
        dayOfMonth: dto.dayOfMonth ? Math.min(Math.max(dto.dayOfMonth, 1), 28) : undefined,
        endsOn: dto.endsOn === undefined ? undefined : dto.endsOn ? new Date(dto.endsOn) : null,
        note: dto.note === undefined ? undefined : dto.note,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async removeRecurring(id: string) {
    await this.prisma.db.recurringExpense.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /** turn a due recurring line into a real Expense (which then posts as usual) */
  async postRecurring(id: string, dto: { amountPaisa?: number; actorName?: string }) {
    const r = await this.prisma.db.recurringExpense.findUnique({ where: { id } });
    if (!r || r.deletedAt) throw new NotFoundException('Not found');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (r.lastPostedFor && r.lastPostedFor.getTime() === monthStart.getTime())
      throw new BadRequestException('This month is already posted');

    const spentAt = new Date(now.getFullYear(), now.getMonth(), Math.min(r.dayOfMonth, 28));
    const created = await this.createExpense({
      spentAt: spentAt.toISOString(),
      accountId: r.accountId,
      paidFromId: r.paidFromId,
      amountPaisa: dto.amountPaisa ?? r.amountPaisa,
      note: `${r.name} — ${spentAt.toLocaleString('en', { month: 'long', year: 'numeric' })}`,
      actorName: dto.actorName ?? 'admin',
    });
    await this.prisma.db.recurringExpense.update({
      where: { id },
      data: { lastPostedFor: monthStart },
    });
    return created;
  }

  /* =============== G2 · staff advance & salary ===============
     One account (1210) + the person as a DIMENSION — never an account per
     employee (the mistake seen in the other system).

     HR-D06 changed one thing here, and it is the whole point of the HR module:
     the "who" is no longer a text box. Both calls below take an employeeId and
     refuse anything else, so a misspelling can no longer invent a second Rakib.
     The NAME is still written to the ledger line beside the id — that is what
     the entry said on the day, and a posted entry is never rewritten
     (FIN-RULE-003). Lines posted before HR carry the name only; they are
     reported honestly as "before the staff list" rather than guessed at. */

  /** who is holding how much advance — grouped by the real person (HR-D06) */
  async staffAdvances() {
    await this.ensureSeed();
    const acc = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC2.EMPLOYEE_ADVANCE },
    });
    if (!acc) return [];
    const lines = await this.prisma.db.journalLine.findMany({
      where: { accountId: acc.id },
      include: {
        entry: { select: { entryDate: true, narration: true, entryNo: true } },
        employee: {
          select: {
            id: true, employeeNo: true, name: true,
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 1000,
    });
    type Row = {
      employeeId: string | null;
      employeeNo: string | null;
      name: string;
      designation: string | null;
      /** true = a row from before the staff list existed, kept for honesty */
      legacy: boolean;
      outstandingPaisa: number;
      givenPaisa: number;
      recoveredPaisa: number;
      lastAt: string | null;
    };
    const map = new Map<string, Row>();
    for (const l of lines) {
      const key = l.employeeId ?? `name:${l.employeeName ?? '—'}`;
      const cur: Row =
        map.get(key) ??
        {
          employeeId: l.employeeId,
          employeeNo: l.employee?.employeeNo ?? null,
          name: l.employee?.name ?? l.employeeName ?? '—',
          designation: l.employee?.role?.name ?? null,
          legacy: !l.employeeId,
          outstandingPaisa: 0,
          givenPaisa: 0,
          recoveredPaisa: 0,
          lastAt: null,
        };
      cur.outstandingPaisa += l.debitPaisa - l.creditPaisa;
      cur.givenPaisa += l.debitPaisa;
      cur.recoveredPaisa += l.creditPaisa;
      if (!cur.lastAt) cur.lastAt = l.entry.entryDate.toISOString();
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.outstandingPaisa - a.outstandingPaisa);
  }

  /**
   * The employee behind an id — the single gate both calls below go through.
   *
   * HR-R25 — a leaver is refused a NEW advance but must still be reachable for
   * a final settlement, because the advance they are still holding has to be
   * recoverable. Blocking every payment to anyone marked as left meant that
   * money could only be forgotten, never squared off.
   */
  private async requireEmployee(
    employeeId: string | undefined,
    what: string,
    opts: { mustBeActive: boolean },
  ) {
    const id = employeeId?.trim();
    if (!id)
      throw new BadRequestException(
        `Pick who this ${what} is for — only people on the staff list can be paid (HR-D06)`,
      );
    const e = await this.prisma.db.employee.findFirst({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!e) throw new BadRequestException('That person is not on the staff list');
    if (opts.mustBeActive && e.status !== 'ACTIVE')
      throw new BadRequestException(
        `${e.name} is marked as left — an advance to somebody who has gone is money you are unlikely to see again. Mark them active first if this is deliberate.`,
      );
    return e;
  }

  /** money handed to a staff member before payday */
  async giveStaffAdvance(dto: StaffAdvanceDto) {
    await this.ensureSeed();
    const emp = await this.requireEmployee(dto.employeeId, 'advance', { mustBeActive: true });
    if (!dto.amountPaisa || dto.amountPaisa <= 0)
      throw new BadRequestException('Amount must be more than zero');
    const advance = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC2.EMPLOYEE_ADVANCE },
    });
    const setting = await this.settings();
    const money = await this.moneyAccount(dto.accountId ?? setting?.defaultCashAccountId ?? '');
    if (!advance) throw new BadRequestException('Employee Advance account is missing');

    return this.postEntry({
      sourceType: 'EXPENSE',
      sourceKey: `STAFF_ADVANCE:${emp.id}:${Date.now()}`,
      entryDate: dto.happenedAt ?? new Date(),
      narration: dto.note?.trim() ? dto.note : `${emp.name} — salary advance`,
      isManual: true,
      actorName: dto.actorName ?? 'admin',
      lines: [
        {
          accountId: advance.id,
          debitPaisa: dto.amountPaisa,
          employeeId: emp.id,
          employeeName: emp.name,
        },
        { accountId: money.id, creditPaisa: dto.amountPaisa },
      ],
    });
  }

  /**
   * Pay one salary outside a payroll run (a leaver, a one-off). The full salary
   * is the cost; any advance already taken is recovered here, so only the
   * balance actually leaves the money account.
   *
   * The monthly way to do this is HR → Payroll, which pays everybody in one
   * balanced entry. This stays for the single, off-cycle case.
   */
  async payStaffSalary(dto: StaffSalaryDto) {
    await this.ensureSeed();
    // a final settlement is exactly when somebody has already left (HR-R25)
    const emp = await this.requireEmployee(dto.employeeId, 'salary', { mustBeActive: false });
    const gross = dto.grossPaisa ?? 0;
    const recover = dto.recoverAdvancePaisa ?? 0;
    if (gross <= 0) throw new BadRequestException('Salary must be more than zero');
    if (recover > gross)
      throw new BadRequestException('Advance recovered cannot be more than the salary');

    const salaryAcc = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC.STAFF_SALARY },
    });
    const advance = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC2.EMPLOYEE_ADVANCE },
    });
    const setting = await this.settings();
    const money = await this.moneyAccount(dto.accountId ?? setting?.defaultCashAccountId ?? '');
    if (!salaryAcc || !advance) throw new BadRequestException('Salary accounts are missing');

    // HR-R05 — never take back more than is actually owed
    if (recover > 0) {
      const owed = await this.prisma.db.journalLine.aggregate({
        where: { accountId: advance.id, employeeId: emp.id },
        _sum: { debitPaisa: true, creditPaisa: true },
      });
      const outstanding = (owed._sum.debitPaisa ?? 0) - (owed._sum.creditPaisa ?? 0);
      if (recover > outstanding)
        throw new BadRequestException(
          `${emp.name} only owes ${(outstanding / 100).toFixed(2)} of advance`,
        );
    }

    const lines: LineInput[] = [
      { accountId: salaryAcc.id, debitPaisa: gross, employeeId: emp.id, employeeName: emp.name },
    ];
    if (recover > 0)
      lines.push({
        accountId: advance.id,
        creditPaisa: recover,
        employeeId: emp.id,
        employeeName: emp.name,
        note: 'Advance recovered',
      });
    if (gross - recover > 0) lines.push({ accountId: money.id, creditPaisa: gross - recover });

    return this.postEntry({
      sourceType: 'EXPENSE',
      sourceKey: `STAFF_SALARY:${emp.id}:${dto.period ?? Date.now()}`,
      entryDate: dto.happenedAt ?? new Date(),
      narration: dto.note?.trim()
        ? dto.note
        : `${emp.name} — salary${dto.period ? ` ${dto.period}` : ''}`,
      isManual: true,
      actorName: dto.actorName ?? 'admin',
      lines,
    });
  }

  /* =============== G6 · accountant-mode manual journal =============== */

  async manualJournal(dto: ManualJournalDto) {
    await this.ensureSeed();
    if (!dto.lines || dto.lines.length < 2)
      throw new BadRequestException('A journal needs at least two lines');
    return this.postEntry({
      sourceType: 'MANUAL',
      entryDate: dto.entryDate ?? new Date(),
      narration: dto.narration?.trim() || 'Manual journal',
      isManual: true,
      actorName: dto.actorName ?? 'accountant',
      lines: dto.lines,
    });
  }

  /** reverse any posted entry — the only legal correction (DEC-FIN-014) */
  async reverseEntry(id: string, dto: { actorName?: string; reason?: string }) {
    const e = await this.prisma.db.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!e) throw new NotFoundException('Entry not found');
    const already = await this.prisma.db.journalEntry.findFirst({ where: { reversesId: id } });
    if (already) throw new BadRequestException('This entry was already reversed');
    return this.postEntry({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      sourceKey: e.sourceKey ? `${e.sourceKey}:reversal` : null,
      entryDate: new Date(),
      narration: `Reversal of ${e.entryNo}${dto.reason ? ` — ${dto.reason}` : ''}`,
      reversesId: e.id,
      isManual: true,
      actorName: dto.actorName ?? 'admin',
      lines: e.lines.map((l) => ({
        accountId: l.accountId,
        debitPaisa: l.creditPaisa,
        creditPaisa: l.debitPaisa,
        partnerId: l.partnerId,
        employeeName: l.employeeName,
        employeeId: l.employeeId, // the reversal must land on the same person
        orderId: l.orderId,
        itemId: l.itemId,
      })),
    });
  }

  /* ===================== demo data (owner practice) ===================== */

  /**
   * A week of realistic Radian money movement so the screens can be understood
   * before the posting hooks exist (stage 2). Every entry carries a DEMO: sourceKey
   * so demoClear() can take them all back out — the ONLY place the ledger is ever
   * deleted, and only for these rows.
   */
  async demoSeed() {
    await this.ensureSeed();
    const day = (back: number) => {
      const d = new Date();
      d.setDate(d.getDate() - back);
      d.setHours(11, 0, 0, 0);
      return d;
    };

    // 1. opening balances — what was in hand on day one
    const openings: { code: string; paisa: number }[] = [
      { code: ACC.CASH, paisa: 2500000 },
      { code: ACC.BKASH, paisa: 4000000 },
      { code: ACC.BANK, paisa: 15000000 },
      { code: ACC.INVENTORY, paisa: 32000000 },
      { code: ACC.FIXED_ASSET, paisa: 18000000 },
      { code: ACC.SUPPLIER_PAYABLE, paisa: 8500000 },
    ];
    const setting = await this.settings();
    if (!setting?.openingPostedAt) {
      for (const o of openings)
        await this.prisma.db.financeAccount.updateMany({
          where: { code: o.code },
          data: { openingBalancePaisa: o.paisa },
        });
      await this.postOpening({ actorName: 'demo', entryDate: day(9).toISOString() });
    }

    type Demo = { key: string; date: Date; narration: string; src: PostEntryInput['sourceType']; lines: LineInput[] };
    const demos: Demo[] = [
      {
        key: 'DEMO:ord-1:stockout', date: day(7), src: 'INVENTORY',
        narration: 'RAD-D101 — flowers left the warehouse',
        lines: [
          { accountCode: ACC.GOODS_OUT, debitPaisa: 260000 },
          { accountCode: ACC.INVENTORY, creditPaisa: 260000 },
        ],
      },
      {
        key: 'DEMO:ord-1:revenue', date: day(6), src: 'ORDER',
        narration: 'RAD-D101 delivered — Dhanmondi (courier, COD)',
        lines: [
          { accountCode: ACC.RECEIVABLE, debitPaisa: 450000 },
          { accountCode: ACC.SALES, creditPaisa: 420000, occasion: 'BIRTHDAY', zone: 'DHAKA' },
          { accountCode: ACC.DELIVERY_INCOME, creditPaisa: 30000 },
        ],
      },
      {
        key: 'DEMO:ord-1:cogs', date: day(6), src: 'ORDER',
        narration: 'RAD-D101 — cost of what was sold',
        lines: [
          { accountCode: ACC.COGS, debitPaisa: 260000, occasion: 'BIRTHDAY', zone: 'DHAKA' },
          { accountCode: ACC.GOODS_OUT, creditPaisa: 260000 },
        ],
      },
      {
        key: 'DEMO:ord-1:cod', date: day(6), src: 'PAYMENT',
        narration: 'RAD-D101 — courier collected the cash',
        lines: [
          { accountCode: ACC.CASH_WITH_CARRIER, debitPaisa: 450000 },
          { accountCode: ACC.RECEIVABLE, creditPaisa: 450000 },
        ],
      },
      {
        key: 'DEMO:remit-1', date: day(3), src: 'REMITTANCE',
        narration: 'Courier remitted this week — charge deducted',
        lines: [
          { accountCode: ACC.BANK, debitPaisa: 438000 },
          { accountCode: ACC.DELIVERY_COST, debitPaisa: 12000 },
          { accountCode: ACC.CASH_WITH_CARRIER, creditPaisa: 450000 },
        ],
      },
      {
        key: 'DEMO:pos-1', date: day(5), src: 'POS_SHIFT',
        narration: 'Counter sale — cash',
        lines: [
          { accountCode: ACC.CASH, debitPaisa: 180000 },
          { accountCode: ACC.SALES, creditPaisa: 180000, zone: 'DHAKA' },
        ],
      },
      {
        key: 'DEMO:pos-1:cogs', date: day(5), src: 'POS_SHIFT',
        narration: 'Counter sale — cost of what was sold',
        lines: [
          { accountCode: ACC.COGS, debitPaisa: 105000 },
          { accountCode: ACC.INVENTORY, creditPaisa: 105000 },
        ],
      },
      {
        key: 'DEMO:purchase-1', date: day(5), src: 'PURCHASE',
        narration: 'Flowers received from supplier — not paid yet',
        lines: [
          { accountCode: ACC.INVENTORY, debitPaisa: 4500000 },
          { accountCode: ACC.SUPPLIER_PAYABLE, creditPaisa: 4500000 },
        ],
      },
      {
        key: 'DEMO:supplier-pay-1', date: day(4), src: 'SUPPLIER_PAYMENT',
        narration: 'Paid the supplier — bank transfer',
        lines: [
          { accountCode: ACC.SUPPLIER_PAYABLE, debitPaisa: 3000000 },
          { accountCode: ACC.BANK, creditPaisa: 3000000 },
        ],
      },
      {
        key: 'DEMO:rent', date: day(4), src: 'EXPENSE',
        narration: 'Shop rent — July',
        lines: [
          { accountCode: ACC.RENT, debitPaisa: 2500000 },
          { accountCode: ACC.BANK, creditPaisa: 2500000 },
        ],
      },
      {
        key: 'DEMO:partner-salary', date: day(4), src: 'PARTNER',
        narration: 'Working partner monthly salary (a cost, not a drawing)',
        lines: [
          { accountCode: ACC.PARTNER_SALARY, debitPaisa: 3000000 },
          { accountCode: ACC.BKASH, creditPaisa: 3000000 },
        ],
      },
      {
        key: 'DEMO:wastage', date: day(2), src: 'INVENTORY',
        narration: 'Roses spoiled — written off',
        lines: [
          { accountCode: ACC.WASTAGE, debitPaisa: 320000 },
          { accountCode: ACC.INVENTORY, creditPaisa: 320000 },
        ],
      },
      {
        key: 'DEMO:advance', date: day(1), src: 'PAYMENT',
        narration: 'Advance taken for a pre-order — not our money yet',
        lines: [
          { accountCode: ACC.BKASH, debitPaisa: 500000 },
          { accountCode: ACC.CUSTOMER_ADVANCE, creditPaisa: 500000 },
        ],
      },
      {
        key: 'DEMO:ord-2:stockout', date: day(0), src: 'INVENTORY',
        narration: 'RAD-D102 — out with the rider right now',
        lines: [
          { accountCode: ACC.GOODS_OUT, debitPaisa: 190000 },
          { accountCode: ACC.INVENTORY, creditPaisa: 190000 },
        ],
      },
    ];

    let made = 0;
    for (const d of demos) {
      const e = await this.postEntry({
        sourceType: d.src,
        sourceId: d.key,
        sourceKey: d.key,
        entryDate: d.date,
        narration: d.narration,
        actorName: 'demo',
        lines: d.lines,
      });
      if (e) made += 1;
    }
    return { ok: true, created: made, note: 'Demo rows carry a DEMO: key and can be cleared' };
  }

  /** removes ONLY the demo rows and unlocks opening balances again */
  async demoClear() {
    const entries = await this.prisma.db.journalEntry.findMany({
      where: {
        OR: [
          { sourceKey: { startsWith: 'DEMO:' } },
          { sourceType: 'OPENING' },
          // counts made while practising — otherwise "Clear" leaves the books
          // non-empty and the next opening balance would not match
          { sourceType: 'RECONCILE' },
        ],
      },
      select: { id: true },
    });
    const ids = entries.map((e) => e.id);
    if (ids.length > 0) {
      await this.prisma.db.journalLine.deleteMany({ where: { entryId: { in: ids } } });
      await this.prisma.db.journalEntry.deleteMany({ where: { id: { in: ids } } });
    }
    await this.prisma.db.accountReconciliation.deleteMany({});
    await this.prisma.db.financeAccount.updateMany({
      where: { openingBalancePaisa: { not: 0 } },
      data: { openingBalancePaisa: 0 },
    });
    await this.prisma.db.financeSetting.update({
      where: { id: 'singleton' },
      data: { openingPostedAt: null },
    });
    return { ok: true, removed: ids.length };
  }

  /** unresolved posting failures — the red badge on the Ledger screen (DEC-FIN-010) */
  async failures() {
    return this.prisma.db.financePostingFailure.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
