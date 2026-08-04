import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService, ACC2 } from '../finance/finance.service';
import { dayOnly, defaultMinutesFor } from './attendance.service';

/*
  HR practice data — five staff, a real month of attendance, two advances, and
  a payroll draft waiting to be approved.

  Why this exists: empty screens teach nothing. The owner opened Payroll, saw a
  blank page, and could not tell whether it was broken or simply empty. With
  this, every screen has something on it and the flow can be walked end to end
  before a single real person is entered.

  Everything it creates is marked, so demoClear() takes it all back out:
    · employees      note starts with DEMO_TAG
    · attendance     belongs to those employees
    · payroll        payrollNo is remembered on the run's note
    · ledger rows    sourceKey starts with DEMO_HR: — the ONLY ledger rows this
                     module ever deletes, and only these
*/

const DEMO_TAG = '[demo]';

/** a half day ends halfway through the shift — used only to make the sample look real */
function halfWayOut(start: string, dutyHours: number): string {
  const [h, m] = start.split(':').map(Number);
  const t = (h * 60 + m + Math.round((dutyHours * 60) / 2)) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

type Seed = {
  name: string;
  role: string;
  phone: string;
  payType: 'MONTHLY' | 'DAILY' | 'HOURLY';
  rate: number; // taka
  joinedMonthsAgo: number;
  /** advance handed out during the month, in taka */
  advance?: number;
  /** days of the month this person did NOT work */
  absentDays?: number[];
  halfDays?: number[];
  leaveDays?: number[];
  /** what a full duty day is for this person (HR-D12) */
  dutyHours: number;
  /** HR-D13 — usual shift */
  shiftStart: string;
  shiftEnd: string;
};

/*  Deliberately mixed duty lengths, because that is the question the owner
    asked: a 12-hour shop day and a 4-hour evening shift cannot share one idea
    of "half day". */
const PEOPLE: Seed[] = [
  { name: 'Rakib Hasan', role: 'Florist', phone: '01711-888123', payType: 'MONTHLY', rate: 15000, dutyHours: 10, shiftStart: '09:00', shiftEnd: '19:00', joinedMonthsAgo: 7, advance: 5000, absentDays: [11] },
  { name: 'Sumaiya Akter', role: 'Manager', phone: '01822-445566', payType: 'MONTHLY', rate: 22000, dutyHours: 9, shiftStart: '10:00', shiftEnd: '19:00', joinedMonthsAgo: 16, leaveDays: [4, 5] },
  { name: 'Mintu Miah', role: 'Shop assistant', phone: '01933-112233', payType: 'DAILY', rate: 800, dutyHours: 12, shiftStart: '08:00', shiftEnd: '20:00', joinedMonthsAgo: 5, advance: 2500, absentDays: [2, 3, 9, 16, 17, 23, 24, 25] },
  // the midnight-delivery shift: out-time is BEFORE the in-time on purpose
  { name: 'Rahat Islam', role: 'Delivery boy', phone: '01644-778899', payType: 'HOURLY', rate: 120, dutyHours: 5, shiftStart: '20:00', shiftEnd: '01:00', joinedMonthsAgo: 1, absentDays: [6, 7, 13, 14, 20, 21, 27, 28] },
  { name: 'Shirin Begum', role: 'Cleaner', phone: '01555-223344', payType: 'MONTHLY', rate: 6000, dutyHours: 4, shiftStart: '07:00', shiftEnd: '11:00', joinedMonthsAgo: 11, halfDays: [18] },
];

@Injectable()
export class HrDemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  private monthsAgo(n: number): Date {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - n, 1);
    return dayOnly(d);
  }

  async status() {
    const count = await this.prisma.db.employee.count({ where: { note: { startsWith: DEMO_TAG } } });
    return { isSeeded: count > 0, count };
  }

  /** five staff + a month of days + two advances + a payroll draft */
  async seed() {
    const existing = await this.status();
    if (existing.isSeeded) return { ...existing, created: 0, message: 'Practice data is already there' };

    // roles first (the master seeds itself on first read, but be explicit here)
    const roleIds = new Map<string, string>();
    for (const [i, name] of [...new Set(PEOPLE.map((p) => p.role))].entries()) {
      const found = await this.prisma.db.employeeRole.findFirst({ where: { name } });
      const r = found ?? (await this.prisma.db.employeeRole.create({ data: { name, sortOrder: i } }));
      roleIds.set(name, r.id);
    }

    // ---- people
    const last = await this.prisma.employee.findFirst({
      where: { employeeNo: { startsWith: 'EMP-' } },
      orderBy: { employeeNo: 'desc' },
      select: { employeeNo: true },
    });
    let n = last ? parseInt(last.employeeNo.slice(4), 10) : 0;

    const made: { id: string; seed: Seed }[] = [];
    for (const p of PEOPLE) {
      n += 1;
      const e = await this.prisma.db.employee.create({
        data: {
          employeeNo: `EMP-${String(n).padStart(6, '0')}`,
          name: p.name,
          phone: p.phone,
          roleId: roleIds.get(p.role) ?? null,
          joinedOn: this.monthsAgo(p.joinedMonthsAgo),
          payType: p.payType,
          ratePaisa: p.rate * 100,
          dutyHoursPerDay: p.dutyHours,
          shiftStart: p.shiftStart,
          shiftEnd: p.shiftEnd,
          note: `${DEMO_TAG} practice record — safe to clear`,
        },
      });
      made.push({ id: e.id, seed: p });
    }

    // ---- a full month of attendance (last month, so the month is complete)
    const ref = new Date();
    const y = ref.getUTCFullYear();
    const m = ref.getUTCMonth(); // 0-based; this is LAST month once we subtract
    const start = new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    const period = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;

    for (const { id, seed } of made) {
      for (let d = 1; d <= end.getUTCDate(); d += 1) {
        const onDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), d));
        const status = seed.absentDays?.includes(d)
          ? 'ABSENT'
          : seed.leaveDays?.includes(d)
            ? 'LEAVE'
            : seed.halfDays?.includes(d)
              ? 'HALF_DAY'
              : 'PRESENT';
        await this.prisma.db.attendance.create({
          data: {
            employeeId: id,
            onDate,
            status,
            isPaidLeave: true,
            // HR-D13 — real clock times, and the hours read off them
            inTime: status === 'ABSENT' || status === 'LEAVE' ? null : seed.shiftStart,
            outTime:
              status === 'ABSENT' || status === 'LEAVE'
                ? null
                : status === 'HALF_DAY'
                  ? halfWayOut(seed.shiftStart, seed.dutyHours)
                  : seed.shiftEnd,
            // HR-D12 — hours for everyone, read against their own duty length
            minutes: defaultMinutesFor(status, seed.dutyHours),
            note: status === 'LEAVE' ? 'Sick' : null,
            markedBy: 'demo',
          },
        });
      }
    }

    // ---- two advances, through the real posting engine (so the books agree)
    const advanceAcc = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC2.EMPLOYEE_ADVANCE },
    });
    const money = await this.prisma.db.financeAccount.findFirst({
      where: { isMoneyAccount: true, isActive: true },
    });
    if (advanceAcc && money) {
      for (const { id, seed } of made) {
        if (!seed.advance) continue;
        await this.finance.postEntry({
          sourceType: 'EXPENSE',
          sourceKey: `DEMO_HR:ADVANCE:${id}`,
          entryDate: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 20)),
          narration: `${seed.name} — salary advance (practice)`,
          isManual: true,
          actorName: 'demo',
          lines: [
            { accountId: advanceAcc.id, debitPaisa: seed.advance * 100, employeeId: id, employeeName: seed.name },
            { accountId: money.id, creditPaisa: seed.advance * 100 },
          ],
        });
      }
    }

    return {
      isSeeded: true,
      count: made.length,
      period,
      message: `${made.length} practice staff and all of ${period} attendance are in. Build the ${period} payroll to see the rest.`,
    };
  }

  /** take every trace of it back out */
  async clear() {
    const people = await this.prisma.db.employee.findMany({
      where: { note: { startsWith: DEMO_TAG } },
      select: { id: true },
    });
    const ids = people.map((p) => p.id);
    if (ids.length === 0) return { cleared: 0, message: 'There was no practice data to clear' };

    // ledger first — DEMO_HR: keys only. This is the one and only place HR
    // deletes a ledger row, and it can only ever reach rows it created itself.
    const demoEntries = await this.prisma.db.journalEntry.findMany({
      where: { sourceKey: { startsWith: 'DEMO_HR:' } },
      select: { id: true },
    });
    if (demoEntries.length) {
      await this.prisma.journalLine.deleteMany({ where: { entryId: { in: demoEntries.map((e) => e.id) } } });
      await this.prisma.journalEntry.deleteMany({ where: { id: { in: demoEntries.map((e) => e.id) } } });
    }

    // any payroll run made only of practice people
    /*  `every` alone is true for a run with NO lines, so an empty draft the
        owner had just started would have been swept away with the practice
        data. `some` pins it to runs that actually contain a practice person. */
    const runs = await this.prisma.db.payroll.findMany({
      where: {
        status: { not: 'APPROVED' },
        lines: { some: { employeeId: { in: ids } }, every: { employeeId: { in: ids } } },
      },
      select: { id: true },
    });
    if (runs.length) {
      await this.prisma.payrollLine.deleteMany({ where: { payrollId: { in: runs.map((r) => r.id) } } });
      await this.prisma.payroll.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
    }

    await this.prisma.attendance.deleteMany({ where: { employeeId: { in: ids } } });
    await this.prisma.employeeDocument.deleteMany({ where: { employeeId: { in: ids } } });
    await this.prisma.employee.deleteMany({ where: { id: { in: ids } } });

    return { cleared: ids.length, message: `${ids.length} practice staff and everything attached to them are gone` };
  }
}
