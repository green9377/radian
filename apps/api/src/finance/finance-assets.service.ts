import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACC, FinanceService } from './finance.service';
import type { LineInput } from './finance.dto';
import { AuditService } from '../common/audit.service';

/*  The slower-moving money: things we own, money paid in advance, and money we
    borrowed. All three follow FIN-RULE-013/014/015 — they are NOT one-off costs.

    FIN-RULE-013  a fridge is an asset; the cost lands month by month as depreciation
    FIN-RULE-014  advance rent spreads monthly; a refundable deposit never does
    FIN-RULE-015  a loan instalment splits into principal (debt) and interest (cost)
*/

export interface AssetWriteDto {
  name?: string;
  category?: string | null;
  purchasedAt?: string;
  costPaisa?: number;
  usefulLifeMonths?: number;
  salvagePaisa?: number;
  paidFromId?: string | null;
  note?: string | null;
  actorName?: string;
}
export interface PrepaidWriteDto {
  name?: string;
  totalPaisa?: number;
  startsOn?: string;
  months?: number;
  refundable?: boolean;
  expenseAccountId?: string | null;
  paidFromId?: string | null;
  note?: string | null;
  actorName?: string;
}
export interface LoanWriteDto {
  lenderName?: string;
  kind?: 'BANK' | 'FAMILY' | 'OTHER';
  principalPaisa?: number;
  interestRateBp?: number;
  startsOn?: string;
  termMonths?: number | null;
  intoAccountId?: string | null;
  note?: string | null;
  actorName?: string;
}
export interface LoanPaymentDto {
  principalPaisa?: number;
  interestPaisa?: number;
  fromAccountId?: string;
  paidAt?: string;
  note?: string | null;
  actorName?: string;
}
export interface RemitDto {
  carrierType?: 'RIDER' | 'COURIER';
  carrierId?: string;
  carrierName?: string;
  grossPaisa?: number;
  chargePaisa?: number;
  intoAccountId?: string;
  receivedAt?: string;
  note?: string | null;
  actorName?: string;
}

@Injectable()
export class FinanceAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly audit: AuditService,
  ) {}

  private async accId(code: string): Promise<string> {
    const a = await this.prisma.db.financeAccount.findUnique({ where: { code } });
    if (!a) throw new BadRequestException(`Chart of accounts is missing ${code}`);
    return a.id;
  }

  private async nextNo(prefix: string, read: () => Promise<string | null>): Promise<string> {
    const last = await read();
    const n = last ? Number(last.split('-')[1]) + 1 : 1;
    return `${prefix}-${String(n).padStart(6, '0')}`;
  }

  private monthStart(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  /* ==================== carrier money (DEC-FIN-021) ==================== */

  /** who is holding our COD cash right now, and for how long */
  async carrierOutstanding() {
    const acc = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC.CASH_WITH_CARRIER },
    });
    if (!acc) return { totalPaisa: 0, carriers: [] };
    const entries = await this.prisma.db.journalEntry.findMany({
      where: { lines: { some: { accountId: acc.id } } },
      include: { lines: { where: { accountId: acc.id } } },
      orderBy: { entryDate: 'asc' },
      take: 1000,
    });
    const map = new Map<string, { carrierId: string; name: string; paisa: number; oldest: string }>();
    let total = 0;
    for (const e of entries) {
      const delta = e.lines.reduce((n, l) => n + l.debitPaisa - l.creditPaisa, 0);
      total += delta;
      const key = e.carrierId ?? 'unknown';
      const cur = map.get(key) ?? {
        carrierId: key,
        name: e.narration.includes('—') ? '' : '',
        paisa: 0,
        oldest: e.entryDate.toISOString(),
      };
      cur.paisa += delta;
      map.set(key, cur);
    }
    // put real names on the ids
    const riders = await this.prisma.db.rider.findMany({ select: { id: true, name: true } });
    const couriers = await this.prisma.db.courierService.findMany({ select: { id: true, name: true } });
    const names = new Map<string, string>();
    for (const r of riders) names.set(r.id, r.name);
    for (const c of couriers) names.set(c.id, c.name);

    const carriers = [...map.values()]
      .filter((c) => c.paisa !== 0)
      .map((c) => ({
        ...c,
        name: names.get(c.carrierId) ?? 'Not recorded against a carrier',
        type: couriers.some((x) => x.id === c.carrierId) ? 'COURIER' : 'RIDER',
        daysHeld: Math.floor((Date.now() - new Date(c.oldest).getTime()) / 86400000),
      }))
      .sort((a, b) => b.paisa - a.paisa);
    return { totalPaisa: total, carriers };
  }

  async remittances() {
    return this.prisma.db.carrierRemittance.findMany({
      where: { deletedAt: null },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      include: { intoAccount: { select: { name: true } } },
    });
  }

  /** the carrier handed the money over — minus its charge */
  async remit(dto: RemitDto) {
    const gross = dto.grossPaisa ?? 0;
    const charge = dto.chargePaisa ?? 0;
    if (gross <= 0) throw new BadRequestException('How much did they hand over?');
    if (charge > gross) throw new BadRequestException('The charge cannot be more than the amount');
    if (!dto.intoAccountId) throw new BadRequestException('Where did the money land?');

    const remittanceNo = await this.nextNo('RMT', async () => {
      const r = await this.prisma.db.carrierRemittance.findFirst({
        orderBy: { remittanceNo: 'desc' },
        select: { remittanceNo: true },
      });
      return r?.remittanceNo ?? null;
    });
    const net = gross - charge;
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    const row = await this.prisma.db.carrierRemittance.create({
      data: {
        remittanceNo,
        carrierType: dto.carrierType ?? 'COURIER',
        carrierId: dto.carrierId ?? 'unknown',
        carrierName: dto.carrierName ?? 'Carrier',
        receivedAt,
        grossPaisa: gross,
        chargePaisa: charge,
        netPaisa: net,
        intoAccountId: dto.intoAccountId,
        note: dto.note ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });

    const lines: LineInput[] = [{ accountId: dto.intoAccountId, debitPaisa: net }];
    if (charge > 0)
      lines.push({ accountId: await this.accId(ACC.DELIVERY_COST), debitPaisa: charge, note: 'Carrier charge' });
    lines.push({ accountId: await this.accId(ACC.CASH_WITH_CARRIER), creditPaisa: gross });

    const entry = await this.finance.postEntry({
      sourceType: 'REMITTANCE',
      sourceId: row.id,
      sourceKey: `REMITTANCE:${row.id}`,
      entryDate: receivedAt,
      narration: `${row.carrierName} handed over ${(gross / 100).toLocaleString()} tk${charge > 0 ? ' (charge deducted)' : ''}`,
      carrierId: dto.carrierId ?? null,
      isManual: true,
      actorName: dto.actorName ?? 'admin',
      lines,
    });
    if (entry)
      await this.prisma.db.carrierRemittance.update({
        where: { id: row.id },
        data: { journalEntryId: entry.id },
      });
    return row;
  }

  /* ==================== fixed assets ==================== */

  async assets() {
    const rows = await this.prisma.db.fixedAsset.findMany({
      where: { deletedAt: null },
      orderBy: { purchasedAt: 'desc' },
    });
    const thisMonth = this.monthStart();
    return rows.map((a) => {
      const monthly = Math.round(Math.max(0, a.costPaisa - a.salvagePaisa) / Math.max(1, a.usefulLifeMonths));
      const done = a.lastDepreciatedOn ? a.lastDepreciatedOn.getTime() >= thisMonth.getTime() : false;
      return {
        ...a,
        monthlyDepreciationPaisa: monthly,
        bookValuePaisa: a.costPaisa - a.accumDepPaisa,
        depreciatedThisMonth: done,
        fullyDepreciated: a.accumDepPaisa >= a.costPaisa - a.salvagePaisa,
      };
    });
  }

  async createAsset(dto: AssetWriteDto) {
    if (!dto.name?.trim() || !dto.costPaisa) throw new BadRequestException('Name and cost are required');
    const setting = await this.finance.settings();
    const threshold = setting?.assetThresholdPaisa ?? 0;
    if (threshold > 0 && dto.costPaisa < threshold)
      throw new BadRequestException(
        `Below ${(threshold / 100).toLocaleString()} tk this is a normal expense, not an asset — record it on the Expenses screen`,
      );

    const assetNo = await this.nextNo('AST', async () => {
      const r = await this.prisma.db.fixedAsset.findFirst({
        orderBy: { assetNo: 'desc' },
        select: { assetNo: true },
      });
      return r?.assetNo ?? null;
    });
    const purchasedAt = dto.purchasedAt ? new Date(dto.purchasedAt) : new Date();
    const row = await this.prisma.db.fixedAsset.create({
      data: {
        assetNo,
        name: dto.name.trim(),
        category: dto.category ?? null,
        purchasedAt,
        costPaisa: dto.costPaisa,
        usefulLifeMonths: dto.usefulLifeMonths ?? 48,
        salvagePaisa: dto.salvagePaisa ?? 0,
        paidFromId: dto.paidFromId ?? null,
        note: dto.note ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });

    if (dto.paidFromId)
      await this.finance.postEntry({
        sourceType: 'ASSET',
        sourceId: row.id,
        sourceKey: `ASSET:${row.id}:bought`,
        entryDate: purchasedAt,
        narration: `Bought ${row.name}`,
        isManual: true,
        actorName: dto.actorName ?? 'admin',
        lines: [
          { accountId: await this.accId(ACC.FIXED_ASSET), debitPaisa: row.costPaisa },
          { accountId: dto.paidFromId, creditPaisa: row.costPaisa },
        ],
      });
    return row;
  }

  async removeAsset(id: string) {
    await this.prisma.db.fixedAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /** month-by-month wearing out — FIN-RULE-013 */
  async runDepreciation(actorName = 'admin') {
    const list = await this.assets();
    const month = this.monthStart();
    const label = month.toLocaleString('en', { month: 'long', year: 'numeric' });
    let posted = 0;
    let totalPaisa = 0;
    for (const a of list) {
      if (a.depreciatedThisMonth || a.fullyDepreciated || a.disposedAt) continue;
      const remaining = Math.max(0, a.costPaisa - a.salvagePaisa - a.accumDepPaisa);
      const amount = Math.min(a.monthlyDepreciationPaisa, remaining);
      if (amount <= 0) continue;
      const entry = await this.finance.postEntry({
        sourceType: 'ASSET',
        sourceId: a.id,
        sourceKey: `ASSET:${a.id}:dep:${month.toISOString().slice(0, 7)}`,
        entryDate: month,
        narration: `${a.name} — wear and tear for ${label}`,
        isManual: true,
        actorName,
        lines: [
          { accountId: await this.accId(ACC.DEPRECIATION), debitPaisa: amount },
          { accountId: await this.accId(ACC.ACCUM_DEP), creditPaisa: amount },
        ],
      });
      if (entry) {
        await this.prisma.db.fixedAsset.update({
          where: { id: a.id },
          data: { lastDepreciatedOn: month, accumDepPaisa: a.accumDepPaisa + amount },
        });
        posted += 1;
        totalPaisa += amount;
      }
    }
    return { posted, totalPaisa, month: label };
  }

  /* ==================== prepaid & deposits ==================== */

  async prepaids() {
    const rows = await this.prisma.db.prepaidItem.findMany({
      where: { deletedAt: null },
      orderBy: { startsOn: 'desc' },
      include: { expenseAccount: { select: { name: true } } },
    });
    const thisMonth = this.monthStart();
    return rows.map((p) => ({
      ...p,
      monthlyPaisa: p.months > 0 ? Math.round(p.totalPaisa / p.months) : 0,
      remainingPaisa: p.totalPaisa - p.amortizedPaisa,
      amortisedThisMonth: p.lastAmortizedOn ? p.lastAmortizedOn.getTime() >= thisMonth.getTime() : false,
      isDeposit: p.months === 0,
    }));
  }

  async createPrepaid(dto: PrepaidWriteDto) {
    if (!dto.name?.trim() || !dto.totalPaisa) throw new BadRequestException('Name and amount are required');
    const prepaidNo = await this.nextNo('PRE', async () => {
      const r = await this.prisma.db.prepaidItem.findFirst({
        orderBy: { prepaidNo: 'desc' },
        select: { prepaidNo: true },
      });
      return r?.prepaidNo ?? null;
    });
    const startsOn = dto.startsOn ? new Date(dto.startsOn) : new Date();
    const months = dto.months ?? 0;
    const row = await this.prisma.db.prepaidItem.create({
      data: {
        prepaidNo,
        name: dto.name.trim(),
        totalPaisa: dto.totalPaisa,
        startsOn,
        months,
        refundable: months === 0 ? (dto.refundable ?? true) : false,
        expenseAccountId: dto.expenseAccountId ?? null,
        note: dto.note ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });

    if (dto.paidFromId)
      await this.finance.postEntry({
        sourceType: 'PREPAID',
        sourceId: row.id,
        sourceKey: `PREPAID:${row.id}:paid`,
        entryDate: startsOn,
        narration: months === 0 ? `${row.name} — deposit paid` : `${row.name} — paid in advance`,
        isManual: true,
        actorName: dto.actorName ?? 'admin',
        lines: [
          { accountId: await this.accId(months === 0 ? ACC.DEPOSIT : ACC.PREPAID), debitPaisa: row.totalPaisa },
          { accountId: dto.paidFromId, creditPaisa: row.totalPaisa },
        ],
      });
    return row;
  }

  async removePrepaid(id: string) {
    await this.prisma.db.prepaidItem.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /** this month's slice of an advance payment becomes a real cost — FIN-RULE-014 */
  async runAmortisation(actorName = 'admin') {
    const list = await this.prepaids();
    const month = this.monthStart();
    const label = month.toLocaleString('en', { month: 'long', year: 'numeric' });
    let posted = 0;
    let totalPaisa = 0;
    for (const p of list) {
      if (p.isDeposit || p.amortisedThisMonth || p.closedAt) continue;
      const amount = Math.min(p.monthlyPaisa, p.remainingPaisa);
      if (amount <= 0) continue;
      const expenseId = p.expenseAccountId ?? (await this.accId(ACC.RENT));
      const entry = await this.finance.postEntry({
        sourceType: 'PREPAID',
        sourceId: p.id,
        sourceKey: `PREPAID:${p.id}:amort:${month.toISOString().slice(0, 7)}`,
        entryDate: month,
        narration: `${p.name} — ${label} share`,
        isManual: true,
        actorName,
        lines: [
          { accountId: expenseId, debitPaisa: amount },
          { accountId: await this.accId(ACC.PREPAID), creditPaisa: amount },
        ],
      });
      if (entry) {
        const done = p.amortizedPaisa + amount >= p.totalPaisa;
        await this.prisma.db.prepaidItem.update({
          where: { id: p.id },
          data: {
            lastAmortizedOn: month,
            amortizedPaisa: p.amortizedPaisa + amount,
            closedAt: done ? new Date() : null,
          },
        });
        posted += 1;
        totalPaisa += amount;
      }
    }
    return { posted, totalPaisa, month: label };
  }

  /* ==================== loans ==================== */

  async loans() {
    const rows = await this.prisma.db.loan.findMany({
      where: { deletedAt: null },
      orderBy: { startsOn: 'desc' },
      include: { payments: { orderBy: { paidAt: 'desc' } } },
    });
    return rows.map((l) => {
      const principalPaid = l.payments.reduce((n, p) => n + p.principalPaisa, 0);
      const interestPaid = l.payments.reduce((n, p) => n + p.interestPaisa, 0);
      return {
        ...l,
        principalPaidPaisa: principalPaid,
        interestPaidPaisa: interestPaid,
        outstandingPaisa: l.principalPaisa - principalPaid,
      };
    });
  }

  async createLoan(dto: LoanWriteDto) {
    if (!dto.lenderName?.trim() || !dto.principalPaisa)
      throw new BadRequestException('Lender and amount are required');
    const loanNo = await this.nextNo('LON', async () => {
      const r = await this.prisma.db.loan.findFirst({
        orderBy: { loanNo: 'desc' },
        select: { loanNo: true },
      });
      return r?.loanNo ?? null;
    });
    const startsOn = dto.startsOn ? new Date(dto.startsOn) : new Date();
    const row = await this.prisma.db.loan.create({
      data: {
        loanNo,
        lenderName: dto.lenderName.trim(),
        kind: dto.kind ?? 'FAMILY',
        principalPaisa: dto.principalPaisa,
        interestRateBp: dto.interestRateBp ?? 0,
        startsOn,
        termMonths: dto.termMonths ?? null,
        intoAccountId: dto.intoAccountId ?? null,
        note: dto.note ?? null,
      },
    });

    if (dto.intoAccountId)
      await this.finance.postEntry({
        sourceType: 'LOAN',
        sourceId: row.id,
        sourceKey: `LOAN:${row.id}:received`,
        entryDate: startsOn,
        narration: `Borrowed from ${row.lenderName}`,
        isManual: true,
        actorName: dto.actorName ?? 'admin',
        lines: [
          { accountId: dto.intoAccountId, debitPaisa: row.principalPaisa },
          { accountId: await this.accId(ACC.LOAN_PAYABLE), creditPaisa: row.principalPaisa },
        ],
      });
    return row;
  }

  /*  Fixing a loan that was typed wrong (gap G4).

      Two different situations, and conflating them is how books get quietly
      rewritten:

      · Nothing has been repaid yet AND no money was received into an account
        → nothing is in the ledger, so the row is just a note. Edit it freely.
      · Money landed in an account, or an instalment has been paid
        → the ledger already moved. The amount and the date are then FROZEN;
        only the label-ish fields (lender name, note, term) may be corrected.
        Changing a posted amount silently would make the books disagree with
        themselves — that is exactly what the drift checker exists to catch. */
  private async loanIsPosted(loanId: string): Promise<boolean> {
    const [entry, payment] = await Promise.all([
      this.prisma.db.journalEntry.findUnique({
        where: { sourceKey: `LOAN:${loanId}:received` },
        select: { id: true },
      }),
      this.prisma.db.loanPayment.findFirst({ where: { loanId }, select: { id: true } }),
    ]);
    return !!entry || !!payment;
  }

  async updateLoan(id: string, dto: LoanWriteDto) {
    const loan = await this.prisma.db.loan.findUnique({ where: { id } });
    if (!loan || loan.deletedAt) throw new NotFoundException('Loan not found');
    const posted = await this.loanIsPosted(id);

    if (posted) {
      const changingMoney =
        (dto.principalPaisa != null && dto.principalPaisa !== loan.principalPaisa) ||
        (dto.startsOn != null &&
          new Date(dto.startsOn).getTime() !== loan.startsOn.getTime()) ||
        (dto.intoAccountId !== undefined && dto.intoAccountId !== loan.intoAccountId);
      if (changingMoney)
        throw new BadRequestException(
          'This loan is already in the books — the amount, the date and the account it landed in cannot be changed. Reverse the entry first, or record the correction as a payment.',
        );
    }

    const row = await this.prisma.db.loan.update({
      where: { id },
      data: {
        lenderName: dto.lenderName?.trim() || undefined,
        kind: dto.kind ?? undefined,
        note: dto.note ?? undefined,
        termMonths: dto.termMonths === undefined ? undefined : dto.termMonths,
        interestRateBp: dto.interestRateBp ?? undefined,
        // only reachable when nothing has been posted
        principalPaisa: posted ? undefined : (dto.principalPaisa ?? undefined),
        startsOn: posted ? undefined : dto.startsOn ? new Date(dto.startsOn) : undefined,
        intoAccountId: posted ? undefined : (dto.intoAccountId ?? undefined),
      },
    });
    await this.audit.record({
      entityType: 'Loan',
      entityId: id,
      action: 'UPDATE',
      actorName: dto.actorName ?? 'admin',
      changes: { posted, dto: { ...dto, actorName: undefined } },
    });
    return row;
  }

  async removeLoan(id: string, actorName?: string) {
    const loan = await this.prisma.db.loan.findUnique({ where: { id } });
    if (!loan || loan.deletedAt) throw new NotFoundException('Loan not found');
    if (await this.loanIsPosted(id))
      throw new BadRequestException(
        'This loan is already in the books and cannot be deleted — the money really moved. Pay it off, or reverse the entry from the Ledger.',
      );
    await this.prisma.db.loan.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      entityType: 'Loan',
      entityId: id,
      action: 'DELETE',
      actorName: actorName ?? 'admin',
      changes: { loanNo: loan.loanNo, lenderName: loan.lenderName },
    });
    return { ok: true };
  }

  /** an instalment — principal reduces the debt, interest is a real cost (FIN-RULE-015) */
  async payLoan(loanId: string, dto: LoanPaymentDto) {
    const loan = await this.prisma.db.loan.findUnique({ where: { id: loanId } });
    if (!loan || loan.deletedAt) throw new NotFoundException('Loan not found');
    const principal = dto.principalPaisa ?? 0;
    const interest = dto.interestPaisa ?? 0;
    if (principal + interest <= 0) throw new BadRequestException('Enter an amount');
    if (!dto.fromAccountId) throw new BadRequestException('Which account did it come from?');
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const row = await this.prisma.db.loanPayment.create({
      data: {
        loanId,
        paidAt,
        principalPaisa: principal,
        interestPaisa: interest,
        fromAccountId: dto.fromAccountId,
        note: dto.note ?? null,
        actorName: dto.actorName ?? 'admin',
      },
    });

    const lines: LineInput[] = [];
    if (principal > 0)
      lines.push({ accountId: await this.accId(ACC.LOAN_PAYABLE), debitPaisa: principal });
    if (interest > 0)
      lines.push({ accountId: await this.accId(ACC.LOAN_INTEREST), debitPaisa: interest });
    lines.push({ accountId: dto.fromAccountId, creditPaisa: principal + interest });

    const entry = await this.finance.postEntry({
      sourceType: 'LOAN',
      sourceId: row.id,
      sourceKey: `LOAN_PAYMENT:${row.id}`,
      entryDate: paidAt,
      narration: `${loan.lenderName} — instalment`,
      isManual: true,
      actorName: dto.actorName ?? 'admin',
      lines,
    });
    if (entry)
      await this.prisma.db.loanPayment.update({
        where: { id: row.id },
        data: { journalEntryId: entry.id },
      });
    return row;
  }

  /* ==================== profit distribution (W4 / FIN-RULE-011) ==================== */

  /** what the waterfall would pay out, without changing anything */
  async distributionPreview(from?: string, to?: string) {
    const now = new Date();
    const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const accs = await this.finance.accounts();
    const byId = new Map(accs.map((a) => [a.id, a]));
    const sums = await this.prisma.db.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { entryDate: { gte: start, lte: end } } },
      _sum: { debitPaisa: true, creditPaisa: true },
    });
    let income = 0;
    let expense = 0;
    for (const s of sums) {
      const a = byId.get(s.accountId);
      if (!a) continue;
      const d = s._sum.debitPaisa ?? 0;
      const c = s._sum.creditPaisa ?? 0;
      if (a.type === 'INCOME') income += c - d;
      if (a.type === 'EXPENSE') expense += d - c;
    }
    const profit = income - expense;

    const partners = await this.finance.partners();
    const setting = await this.finance.settings();
    const bonusBp = setting?.labourBonusPercentBp ?? 0;
    const cashAvailable = accs
      .filter((a) => a.isMoneyAccount && a.isActive)
      .reduce((n, a) => n + a.balancePaisa, 0);

    const plan: {
      partnerId: string;
      name: string;
      kind: string;
      bonusPaisa: number;
      capitalReturnPaisa: number;
      profitSharePaisa: number;
      totalPaisa: number;
    }[] = partners.map((p) => ({
      partnerId: p.id,
      name: p.name,
      kind: p.kind,
      bonusPaisa: 0,
      capitalReturnPaisa: 0,
      profitSharePaisa: 0,
      totalPaisa: 0,
    }));

    let pot = Math.max(0, profit);
    // step 1 — the agreed share to the working partner, even before capital is back
    if (bonusBp > 0 && pot > 0) {
      const labour = plan.filter((p) => p.kind === 'LABOUR' || p.kind === 'BOTH');
      const bonus = Math.round((pot * bonusBp) / 10000);
      const each = labour.length > 0 ? Math.floor(bonus / labour.length) : 0;
      for (const p of labour) p.bonusPaisa = each;
      pot -= each * labour.length;
    }
    // step 2 — capital comes back first (DEC-FIN-005)
    const owing = partners
      .filter((p) => p.capitalOutstandingPaisa > 0)
      .sort((a, b) => b.capitalOutstandingPaisa - a.capitalOutstandingPaisa);
    for (const p of owing) {
      if (pot <= 0) break;
      const give = Math.min(pot, p.capitalOutstandingPaisa);
      const row = plan.find((x) => x.partnerId === p.id);
      if (row) row.capitalReturnPaisa = give;
      pot -= give;
    }
    // step 3 — only what is left gets split by the agreed share
    if (pot > 0) {
      const totalBp = partners.reduce((n, p) => n + p.sharePercentBp, 0) || 10000;
      for (const p of partners) {
        const row = plan.find((x) => x.partnerId === p.id);
        if (row) row.profitSharePaisa = Math.round((pot * p.sharePercentBp) / totalBp);
      }
    }
    for (const p of plan) p.totalPaisa = p.bonusPaisa + p.capitalReturnPaisa + p.profitSharePaisa;

    const payout = plan.reduce((n, p) => n + p.totalPaisa, 0);
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      incomePaisa: income,
      expensePaisa: expense,
      profitPaisa: profit,
      labourBonusPercentBp: bonusBp,
      cashAvailablePaisa: cashAvailable,
      payoutPaisa: payout,
      enoughCash: payout <= cashAvailable,
      plan,
    };
  }

  /** actually pay it out — blocked when the cash is not there (FIN-RULE-011) */
  async distribute(dto: { from?: string; to?: string; accountId?: string; actorName?: string }) {
    const preview = await this.distributionPreview(dto.from, dto.to);
    if (preview.profitPaisa <= 0)
      throw new BadRequestException('There is no profit to share for this period');
    if (!preview.enoughCash)
      throw new BadRequestException(
        `The plan pays out ${(preview.payoutPaisa / 100).toLocaleString()} tk but only ${(preview.cashAvailablePaisa / 100).toLocaleString()} tk is in hand`,
      );
    const setting = await this.finance.settings();
    const money = dto.accountId ?? setting?.defaultCashAccountId;
    if (!money) throw new BadRequestException('Pick the account the money comes out of');

    const results: { name: string; paisa: number }[] = [];
    for (const p of preview.plan) {
      if (p.bonusPaisa > 0)
        await this.finance.partnerTransaction({
          partnerId: p.partnerId,
          kind: 'DRAWING',
          amountPaisa: p.bonusPaisa,
          accountId: money,
          note: `Profit bonus`,
          actorName: dto.actorName ?? 'admin',
        });
      if (p.capitalReturnPaisa > 0)
        await this.finance.partnerTransaction({
          partnerId: p.partnerId,
          kind: 'CAPITAL_RETURN',
          amountPaisa: p.capitalReturnPaisa,
          accountId: money,
          note: `Capital returned from profit`,
          actorName: dto.actorName ?? 'admin',
        });
      if (p.profitSharePaisa > 0)
        await this.finance.partnerTransaction({
          partnerId: p.partnerId,
          kind: 'DRAWING',
          amountPaisa: p.profitSharePaisa,
          accountId: money,
          note: `Profit share`,
          actorName: dto.actorName ?? 'admin',
        });
      if (p.totalPaisa > 0) results.push({ name: p.name, paisa: p.totalPaisa });
    }
    return { ok: true, paid: results, totalPaisa: preview.payoutPaisa };
  }

  /* ==================== month end (W3) ==================== */

  async monthEnd(dto: { actorName?: string; close?: boolean; closeThrough?: string }) {
    const actor = dto.actorName ?? 'admin';
    const dep = await this.runDepreciation(actor);
    const amo = await this.runAmortisation(actor);
    let closedTo: string | null = null;
    if (dto.close) {
      /*  BUG that was here: it closed to the last day of the CURRENT month, so
          closing on the 28th silently blocked every entry for the 29th–31st —
          the shop would have been unable to record a single sale for three
          days with no explanation beyond "period is closed".

          A month can only be closed once it is over. So we close through the
          end of the most recently FINISHED month (or an explicit date the
          owner gives, which is how you close a late month). */
      const asked = dto.closeThrough ? new Date(dto.closeThrough) : null;
      const now = new Date();
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const target = asked ?? endOfLastMonth;
      if (target > now)
        throw new BadRequestException(
          'A month can only be closed after it has ended — pick a date in the past',
        );
      await this.finance.updateSettings(
        { lastClosedDate: target.toISOString() },
        { allowPeriodChange: true },
      );
      closedTo = target.toISOString();
    }
    return { depreciation: dep, prepaid: amo, closedTo };
  }

  /*  Reopening is deliberately its own action, not a checkbox on the close
      screen. It is OWNER + PIN in the controller, and it is written to the
      audit trail — because reopening a closed month is exactly how a number
      that an accountant already signed off gets quietly changed. */
  async reopenPeriod(dto: { actorName?: string; reason?: string }) {
    const setting = await this.finance.settings();
    if (!setting?.lastClosedDate)
      throw new BadRequestException('No month is closed right now');
    const was = setting.lastClosedDate;
    await this.finance.updateSettings({ lastClosedDate: null }, { allowPeriodChange: true });
    await this.audit.record({
      entityType: 'FinanceSetting',
      entityId: setting.id,
      action: 'UPDATE',
      actorName: dto.actorName ?? 'admin',
      changes: {
        event: 'period reopened',
        wasClosedThrough: was.toISOString(),
        reason: dto.reason ?? null,
      },
    });
    return { ok: true, wasClosedThrough: was.toISOString() };
  }
}
