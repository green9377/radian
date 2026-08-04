import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PayType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { FinanceService, ACC, ACC2 } from '../finance/finance.service';
import type { LineInput } from '../finance/finance.dto';
import { AttendanceService } from './attendance.service';
import { EmployeesService } from './employees.service';
import type { PayrollApproveDto, PayrollBuildDto, PayrollPatchDto } from './hr.dto';

/*
  PAYROLL — a month, a screen, one approval.
  RADIAN_HR_MODULE_ARCHITECTURE.md (28 Jul 2026).

  Rules enforced here:
    HR-R05  advance recovery is NEVER automatic. The draft proposes 0; the owner
            decides how much comes back this month. Nobody goes home empty-handed
            because the system decided to collect the whole balance.
    HR-R06  more than one run per period is allowed (festival helpers are often
            settled apart from the monthly staff) but the second one warns.
    HR-R07  payType and rate are snapshotted onto the line — a rise next month
            must not rewrite what last month's payslip said.
    HR-R08  DRAFT is free; APPROVED is frozen. A mistake found later is fixed
            by REVERSING the journal entry in Finance (FIN-RULE-003 / DEC-FIN-014),
            never by editing the run.
    HR-R16  Finance receives a COMPLETED event — one balanced entry, at approval,
            through FinanceService.postEntry(). This module never writes a
            JournalLine itself (core principle).
    HR-R17  no salary without a real Employee (HR-D06) — guaranteed structurally
            here, because a PayrollLine cannot exist without an employeeId.
    HR-R21  a run covers everyone EMPLOYED DURING the period, not everyone
            active today — a leaver still has a final settlement coming.
    HR-R22  the same person can never be paid twice for the same period. Build
            leaves them out; approve refuses outright.
    HR-R23  a daily/hourly person with no attendance is flagged before approval,
            because a silent zero payslip is how somebody gets underpaid.
    HR-R24  approval recomputes every figure from its parts and repairs the
            stored total rather than trusting it.
    HR-R27  advance recovery is checked against what is owed while the draft is
            being edited, not only at approval — being told at the last step,
            after a month of work, is not a useful place to find out.
    HR-R28  a run is never marked approved unless a journal entry really came
            back. Silently posting nothing while the screen says "paid" is the
            worst failure this module could have.

  Base pay, by pay type:
    MONTHLY  the agreed figure, whatever the days. Absence is handled by the
             owner as an explicit deduction, so it is visible on the payslip
             instead of hidden inside an arithmetic the owner cannot see.
    DAILY    paid days x rate       (half day = 0.5, paid leave counts, absent 0)
    HOURLY   minutes / 60 x rate
*/

const ENTITY = 'Payroll';

export function basePayPaisa(
  payType: PayType,
  ratePaisa: number,
  daysWorked: number,
  minutesWorked: number,
): number {
  if (payType === 'MONTHLY') return ratePaisa;
  if (payType === 'DAILY') return Math.round(daysWorked * ratePaisa);
  return Math.round((minutesWorked / 60) * ratePaisa);
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attendance: AttendanceService,
    private readonly employees: EmployeesService,
    // HR-R16 — one-way: HR calls Finance, Finance never calls HR
    private readonly finance: FinanceService,
  ) {}

  private async nextNo(): Promise<string> {
    const last = await this.prisma.payroll.findFirst({
      where: { payrollNo: { startsWith: 'PAY-' } },
      orderBy: { payrollNo: 'desc' },
      select: { payrollNo: true },
    });
    const n = last ? parseInt(last.payrollNo.slice(4), 10) + 1 : 1;
    return `PAY-${String(n).padStart(6, '0')}`;
  }

  private monthRange(period: string): { start: Date; end: Date } {
    const [y, m] = period.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) throw new BadRequestException('Period must look like 2026-07');
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
  }

  private rollup(lines: { basePaisa: number; extraPaisa: number; deductionPaisa: number; advanceRecoveredPaisa: number; netPaisa: number }[]) {
    return {
      grossPaisa: lines.reduce((n, l) => n + l.basePaisa, 0),
      extraPaisa: lines.reduce((n, l) => n + l.extraPaisa, 0),
      deductionPaisa: lines.reduce((n, l) => n + l.deductionPaisa, 0),
      advanceRecoveredPaisa: lines.reduce((n, l) => n + l.advanceRecoveredPaisa, 0),
      netPaisa: lines.reduce((n, l) => n + l.netPaisa, 0),
    };
  }

  /* ------------------------------------------------------------------- read */

  async list() {
    const rows = await this.prisma.db.payroll.findMany({
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { lines: true } } },
      take: 60,
    });
    return { items: rows, total: rows.length };
  }

  async get(id: string) {
    const p = await this.prisma.db.payroll.findFirst({
      where: { id },
      include: {
        lines: {
          include: {
            employee: {
              select: {
                id: true, employeeNo: true, name: true, photoUrl: true,
                role: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!p) throw new NotFoundException('Payroll run not found');
    const advances = await this.employees.advanceMap();
    return {
      ...p,
      lines: p.lines.map((l) => ({
        ...l,
        advanceOutstandingPaisa: advances.get(l.employeeId) ?? 0,
        earnedPaisa: l.basePaisa + l.extraPaisa - l.deductionPaisa,
        /*  HR-D12 — what a MONTHLY absence is worth, shown so the owner can
            apply it (or not) with the arithmetic in front of him:
              rate x absent days / days recorded
            Never applied automatically. A monthly salary is an agreement, and
            the system does not get to reinterpret it silently (HR-D05). */
        suggestedAbsenceDeductionPaisa:
          l.payType === 'MONTHLY' && l.absentDays > 0 && l.daysWorked + l.absentDays > 0
            ? Math.round((l.ratePaisa * l.absentDays) / (l.daysWorked + l.absentDays))
            : 0,
      })),
    };
  }

  /* ------------------------------------------------------------------ build */

  /**
   * HR-R21 — who was on the payroll during this period.
   *
   * NOT "who is active today". Somebody who resigned on the 20th still worked
   * twenty days and must still be paid; filtering on today's status was the
   * bug that made a leaver unpayable through this screen at all.
   */
  private employedDuring(periodStart: Date, periodEnd: Date) {
    return {
      AND: [
        { joinedOn: { lte: periodEnd } },
        { OR: [{ status: 'ACTIVE' as const }, { leftOn: { gte: periodStart } }] },
      ],
    };
  }

  /** HR-R22 — everyone on this run who has ALREADY been paid for this period */
  private async alreadyPaid(period: string, employeeIds: string[], exceptPayrollId?: string) {
    if (employeeIds.length === 0) return new Map<string, string>();
    const rows = await this.prisma.db.payrollLine.findMany({
      where: {
        employeeId: { in: employeeIds },
        payroll: {
          period,
          status: 'APPROVED',
          deletedAt: null,
          ...(exceptPayrollId ? { id: { not: exceptPayrollId } } : {}),
        },
      },
      include: {
        employee: { select: { name: true } },
        payroll: { select: { payrollNo: true } },
      },
    });
    const out = new Map<string, string>();
    for (const r of rows) out.set(r.employeeId, `${r.employee.name} (${r.payroll.payrollNo})`);
    return out;
  }

  /** HR-R06 — build a DRAFT from the attendance already recorded */
  async build(dto: PayrollBuildDto) {
    const period = dto.period?.trim() || new Date().toISOString().slice(0, 7);
    const { start, end } = this.monthRange(period);
    const periodStart = dto.periodStart ? new Date(dto.periodStart) : start;
    const periodEnd = dto.periodEnd ? new Date(dto.periodEnd) : end;
    if (periodEnd < periodStart) throw new BadRequestException('The end date is before the start date');

    const candidates = await this.prisma.db.employee.findMany({
      where: {
        ...this.employedDuring(periodStart, periodEnd),
        ...(dto.employeeIds?.length ? { id: { in: dto.employeeIds } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    if (candidates.length === 0) throw new BadRequestException('Nobody to pay — add staff first');

    /*  HR-R22 — leave out anybody already paid for this month. This is what
        makes "more than one run per period" safe: the festival batch simply
        picks up whoever the monthly run did not. Without it, building twice and
        approving both paid everyone twice, and only a warning stood in the way. */
    const paid = await this.alreadyPaid(period, candidates.map((c) => c.id));
    const staff = candidates.filter((c) => !paid.has(c.id));
    if (staff.length === 0)
      throw new BadRequestException(
        `Everybody was already paid for ${period} — there is nobody left on this run`,
      );

    const totals = await this.attendance.totals(
      periodStart,
      periodEnd,
      staff.map((s) => s.id),
    );

    const lines = staff.map((e) => {
      const t = totals.get(e.id) ?? { days: 0, minutes: 0, marked: 0, absent: 0 };
      const daysWorked = Math.round(t.days * 2) / 2; // halves survive; nothing else does
      const basePaisa = basePayPaisa(e.payType, e.ratePaisa, daysWorked, t.minutes);
      return {
        employeeId: e.id,
        payType: e.payType, // HR-R07 snapshot
        ratePaisa: e.ratePaisa, // HR-R07 snapshot
        daysWorked, // halves kept — see the Float on the column
        absentDays: Math.round(t.absent * 2) / 2, // HR-D12 — the unpaid part
        minutesWorked: t.minutes,
        basePaisa,
        extraPaisa: 0,
        deductionPaisa: 0,
        advanceRecoveredPaisa: 0, // HR-R05 — never proposed automatically
        netPaisa: basePaisa,
      };
    });

    const created = await this.prisma.db.payroll.create({
      data: {
        payrollNo: await this.nextNo(),
        period,
        periodStart,
        periodEnd,
        note: dto.note ?? null,
        ...this.rollup(lines),
        lines: { create: lines },
      },
      include: { lines: true },
    });

    const actorName = dto.actorName ?? 'Admin';
    await this.audit.record({
      entityType: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorName,
      changes: { period, people: lines.length, netPaisa: created.netPaisa },
    });

    /*  Things worth saying out loud before anybody presses Approve. They are
        warnings, not blocks: each one describes a situation that is sometimes
        perfectly correct. */
    const warnings: string[] = [];
    if (paid.size > 0)
      warnings.push(
        `${paid.size} ${paid.size === 1 ? 'person was' : 'people were'} left out because they were already paid for ${period}: ${[...paid.values()].join(', ')}`,
      );

    // HR-R23 — a daily or hourly person with no attendance earns nothing, and a
    // zero payslip that nobody questioned is the quietest way to underpay a
    // person. Say it before the money moves, not after.
    const noAttendance = staff.filter((e) => {
      if (e.payType === 'MONTHLY') return false;
      const t = totals.get(e.id);
      return !t || t.marked === 0;
    });
    if (noAttendance.length > 0)
      warnings.push(
        `No attendance was recorded for ${noAttendance.map((e) => e.name).join(', ')} — they are paid by ${noAttendance.length === 1 ? 'the day or the hour' : 'day or hour'}, so their pay comes out as zero. Fill the day sheet in first, or take them off this run.`,
      );

    const leavers = staff.filter((e) => e.status !== 'ACTIVE');
    if (leavers.length > 0)
      warnings.push(
        `${leavers.map((e) => e.name).join(', ')} ${leavers.length === 1 ? 'has' : 'have'} left — this is their final settlement.`,
      );

    return { ...(await this.get(created.id)), warnings };
  }

  /* ------------------------------------------------------------------ patch */

  async patch(id: string, dto: PayrollPatchDto) {
    const p = await this.prisma.db.payroll.findFirst({ where: { id }, include: { lines: true } });
    if (!p) throw new NotFoundException('Payroll run not found');
    if (p.status !== 'DRAFT')
      throw new BadRequestException(
        'This run is approved and cannot be edited — reverse it in Finance instead (HR-R08)',
      );

    /*  HR-R27 — check the advance against what is actually OWED, here in the
        draft, not only at approval.
        The first build only compared it with what the payslip was worth, so a
        recovery of 5,000 against a 3,000 advance sat quietly in the draft and
        was refused at the very last step, after the owner had finished the
        whole month. Caught by the self-test, 28 Jul. */
    const advances = await this.employees.advanceMap();

    const byId = new Map(p.lines.map((l) => [l.employeeId, l]));
    for (const patch of dto.lines ?? []) {
      const line = byId.get(patch.employeeId);
      if (!line) throw new BadRequestException('That person is not on this run');

      const daysWorked = patch.daysWorked ?? line.daysWorked;
      const absentDays = patch.absentDays ?? line.absentDays;
      const minutesWorked = patch.minutesWorked ?? line.minutesWorked;
      // Only recompute the base when the inputs it is made of actually changed.
      // Recomputing on every save would quietly overwrite a hand-set figure —
      // and the normal save (bonus / deduction / advance only) sends neither
      // days nor minutes.
      const inputsChanged = patch.daysWorked !== undefined || patch.minutesWorked !== undefined;
      const basePaisa =
        patch.basePaisa ??
        (inputsChanged
          ? basePayPaisa(line.payType, line.ratePaisa, daysWorked, minutesWorked)
          : line.basePaisa);
      const extraPaisa = Math.max(0, patch.extraPaisa ?? line.extraPaisa);
      const deductionPaisa = Math.max(0, patch.deductionPaisa ?? line.deductionPaisa);
      const advanceRecoveredPaisa = Math.max(
        0,
        patch.advanceRecoveredPaisa ?? line.advanceRecoveredPaisa,
      );
      const earned = basePaisa + extraPaisa - deductionPaisa;
      if (earned < 0) throw new BadRequestException('Deductions are more than the pay');
      const owed = advances.get(patch.employeeId) ?? 0;
      if (advanceRecoveredPaisa > owed) {
        const who = await this.prisma.db.employee.findFirst({
          where: { id: patch.employeeId },
          select: { name: true },
        });
        throw new BadRequestException(
          `${who?.name ?? 'That person'} only owes ${(owed / 100).toFixed(2)} of advance — you are trying to recover more`,
        );
      }
      if (advanceRecoveredPaisa > earned)
        throw new BadRequestException(
          'You cannot take back more advance than this payslip is worth — the rest stays owed',
        );

      await this.prisma.db.payrollLine.update({
        where: { id: line.id },
        data: {
          daysWorked,
          absentDays,
          minutesWorked,
          basePaisa: Math.max(0, basePaisa),
          extraPaisa,
          extraNote: patch.extraNote !== undefined ? patch.extraNote : line.extraNote,
          deductionPaisa,
          deductionNote: patch.deductionNote !== undefined ? patch.deductionNote : line.deductionNote,
          advanceRecoveredPaisa,
          netPaisa: earned - advanceRecoveredPaisa,
        },
      });
    }

    const fresh = await this.prisma.db.payrollLine.findMany({ where: { payrollId: id } });
    await this.prisma.db.payroll.update({
      where: { id },
      data: { ...this.rollup(fresh), ...(dto.note !== undefined ? { note: dto.note } : {}) },
    });
    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName: dto.actorName ?? 'Admin',
      changes: { lines: dto.lines?.length ?? 0 },
    });
    return this.get(id);
  }

  /** take somebody off a draft (hired mid-month, paid separately, whatever) */
  async removeLine(id: string, employeeId: string, actorName: string) {
    const p = await this.prisma.db.payroll.findFirst({ where: { id } });
    if (!p) throw new NotFoundException('Payroll run not found');
    if (p.status !== 'DRAFT') throw new BadRequestException('This run is approved (HR-R08)');
    await this.prisma.db.payrollLine.deleteMany({ where: { payrollId: id, employeeId } });
    const fresh = await this.prisma.db.payrollLine.findMany({ where: { payrollId: id } });
    await this.prisma.db.payroll.update({ where: { id }, data: this.rollup(fresh) });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'UPDATE', actorName, changes: { removed: employeeId } });
    return this.get(id);
  }

  async remove(id: string, actorName: string) {
    const p = await this.prisma.db.payroll.findFirst({ where: { id } });
    if (!p) throw new NotFoundException('Payroll run not found');
    if (p.status === 'APPROVED')
      throw new BadRequestException('An approved run is never deleted — reverse it in Finance (HR-R08)');
    await this.prisma.db.payroll.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /* ---------------------------------------------------------------- approve */

  /**
   * HR-R16 — the only moment HR touches money. One balanced entry:
   *
   *   Dr 5420 Employee Salary        earned, per person (employeeId dimension)
   *   Cr 1210 Employee Advance       whatever is being recovered, per person
   *   Cr <money account>             what actually leaves the drawer
   *
   * It balances by construction: net = earned − advance recovered.
   */
  async approve(id: string, dto: PayrollApproveDto) {
    const p = await this.prisma.db.payroll.findFirst({
      where: { id },
      include: { lines: { include: { employee: { select: { name: true } } } } },
    });
    if (!p) throw new NotFoundException('Payroll run not found');
    if (p.status === 'APPROVED') throw new BadRequestException('This run is already approved');
    if (p.status === 'CANCELLED') throw new BadRequestException('This run was cancelled');
    if (p.lines.length === 0) throw new BadRequestException('There is nobody on this run');

    const money = dto.paidFromId
      ? await this.prisma.db.financeAccount.findFirst({
          where: { id: dto.paidFromId, isMoneyAccount: true },
        })
      : await this.prisma.db.financeAccount.findFirst({ where: { isMoneyAccount: true, isActive: true } });
    if (!money) throw new BadRequestException('Pick the account the money is paid from');

    const [salaryAcc, advanceAcc] = await Promise.all([
      this.prisma.db.financeAccount.findUnique({ where: { code: ACC.STAFF_SALARY } }),
      this.prisma.db.financeAccount.findUnique({ where: { code: ACC2.EMPLOYEE_ADVANCE } }),
    ]);
    if (!salaryAcc || !advanceAcc)
      throw new BadRequestException('The salary accounts are missing from the chart of accounts');

    /*  HR-R22 — the hard stop. A warning at build time is not protection: it is
        shown once, disappears on reload, and the second run can still be
        approved. Paying the same person twice for the same month is the single
        most expensive mistake this screen can make, so it is refused here. */
    const paidAlready = await this.alreadyPaid(p.period, p.lines.map((l) => l.employeeId), p.id);
    if (paidAlready.size > 0)
      throw new BadRequestException(
        `Already paid for ${p.period}: ${[...paidAlready.values()].join(', ')}. Take them off this run before approving.`,
      );

    // HR-R05 guard, checked again at the last moment against the live ledger
    const advances = await this.employees.advanceMap();
    const lines: LineInput[] = [];
    let netTotal = 0;

    for (const l of p.lines) {
      const owed = advances.get(l.employeeId) ?? 0;
      if (l.advanceRecoveredPaisa > owed)
        throw new BadRequestException(
          `${l.employee.name} only owes ${(owed / 100).toFixed(2)} of advance — you are trying to recover more`,
        );

      /*  HR-R24 — every figure is worked out again here from its parts, and the
          stored netPaisa is only used to notice a disagreement. Trusting a
          stored total while deriving the debits from components is how a ledger
          entry ends up unbalanced for reasons nobody can see. */
      const earned = l.basePaisa + l.extraPaisa - l.deductionPaisa;
      const net = earned - l.advanceRecoveredPaisa;
      if (earned < 0) throw new BadRequestException(`${l.employee.name}'s deductions are more than the pay`);
      if (net < 0) throw new BadRequestException(`${l.employee.name}'s payslip comes out negative`);
      if (net !== l.netPaisa)
        await this.prisma.db.payrollLine.update({ where: { id: l.id }, data: { netPaisa: net } });
      netTotal += net;

      if (earned > 0)
        lines.push({
          accountId: salaryAcc.id,
          debitPaisa: earned,
          employeeId: l.employeeId,
          employeeName: l.employee.name,
          note: `${p.period} salary`,
        });
      if (l.advanceRecoveredPaisa > 0)
        lines.push({
          accountId: advanceAcc.id,
          creditPaisa: l.advanceRecoveredPaisa,
          employeeId: l.employeeId,
          employeeName: l.employee.name,
          note: 'Advance recovered',
        });
    }
    if (netTotal > 0) lines.push({ accountId: money.id, creditPaisa: netTotal });
    if (lines.length < 2) throw new BadRequestException('This run has nothing to pay');

    const actorName = dto.actorName ?? 'Admin';
    const entry = await this.finance.postEntry({
      sourceType: 'EXPENSE',
      sourceKey: `PAYROLL:${p.payrollNo}`, // DEC-FIN-023 — approving twice cannot double-post
      entryDate: dto.paidOn ? new Date(dto.paidOn) : new Date(),
      narration: `Payroll ${p.period} — ${p.lines.length} staff (${p.payrollNo})`,
      isManual: false,
      actorName,
      lines,
    });

    /*  HR-R28 — if nothing reached the ledger, the run is NOT approved.
        postEntry() returns null when it decides the entry is a duplicate
        (FIN-RULE-021, sourceKey already used). That is the right behaviour for
        an event replay, but here it would have meant marking a run APPROVED,
        freezing the month, telling everyone they had been paid — and posting
        no money at all. Found by the self-test on 28 Jul, when a reused
        payroll number collided with an older entry. A silent no-op is the
        worst possible outcome for a payment, so it is now loud. */
    if (!entry)
      throw new BadRequestException(
        `Nothing was written to the books — an entry for ${p.payrollNo} already exists in the ledger. ` +
          'That should not happen; check Finance → Ledger for that number before approving again.',
      );

    const updated = await this.prisma.db.payroll.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: actorName,
        paidFromId: money.id,
        journalEntryId: entry?.id ?? null,
        netPaisa: netTotal,
      },
    });

    await this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorName,
      changes: { status: 'APPROVED', netPaisa: netTotal, journalEntryId: entry?.id ?? null },
    });
    // a payslip on each person's own timeline — that is where anyone will look
    for (const l of p.lines)
      await this.audit.event({
        entityType: 'Employee',
        entityId: l.employeeId,
        kind: 'payment',
        label: `${p.period} salary paid — ${((l.basePaisa + l.extraPaisa - l.deductionPaisa - l.advanceRecoveredPaisa) / 100).toFixed(2)}`,
        actorName,
        note:
          l.advanceRecoveredPaisa > 0
            ? `Advance recovered ${(l.advanceRecoveredPaisa / 100).toFixed(2)}`
            : undefined,
      });

    return { ...updated, journalPosted: !!entry };
  }
}
