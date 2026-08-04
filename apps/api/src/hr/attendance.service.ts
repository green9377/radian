import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AttendanceSaveDto } from './hr.dto';

/*
  ATTENDANCE — the day sheet (HR-D04, owner's decision: everyone, every day).

  The one design choice that decides whether this survives contact with a real
  shop: the sheet arrives with EVERY active person already on PRESENT. A normal
  day is two clicks — open, save. Only the exceptions are touched. A sheet that
  starts empty is a sheet that stops being filled in by the second week, and
  then payroll has to be done from memory anyway.

  Rules enforced here:
    HR-R12  one row per person per day — the save is an upsert, never a delete
    HR-R13  no marking a future day
    HR-R14  hours are recorded for everyone, read against that person's own
            dutyHoursPerDay (HR-D12). "Half day" is not a word here, it is half
            of THEIR day: 4h for an 8-hour duty, 6h for a 12-hour one. Hours
            only turn into money for HOURLY staff; for the rest they are the
            record — and the thing that makes "half day" mean something.
    HR-R20  status and hours must agree (HR-D15). Times in, status out: nothing
            worked is absent, under 75% of the day is a half day. LEAVE is the
            exception and is never derived — approval is a decision, not a
            measurement.
    HR-R15  the day sheet is frozen once an APPROVED payroll covers that date
            (otherwise last month's payslip stops matching last month's days)
*/

/** HR-D12 — what a status is worth in minutes, for THIS person's duty length */
export function defaultMinutesFor(status: AttendanceStatus, dutyHoursPerDay: number): number {
  if (status === 'ABSENT' || status === 'LEAVE') return 0;
  const full = Math.round(dutyHoursPerDay * 60);
  return status === 'HALF_DAY' ? Math.round(full / 2) : full;
}

/** HR-D13 — "09:30" → 570. Anything that is not a real clock time → null. */
export function hhmmToMinutes(v?: string | null): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * HR-D13 — how long between coming in and leaving.
 *
 * An out-time at or before the in-time is read as the next day rather than as
 * an error: Radian runs midnight deliveries, so 20:00 → 01:00 is a real five
 * hour shift, not a mistake.
 */
export function spanMinutes(inTime?: string | null, outTime?: string | null): number | null {
  const a = hhmmToMinutes(inTime);
  const b = hhmmToMinutes(outTime);
  if (a === null || b === null) return null;
  const d = b - a;
  return d > 0 ? d : d + 1440;
}

/** keep only well-formed clock text; junk is dropped rather than stored */
function cleanTime(v?: string | null): string | null {
  return hhmmToMinutes(v) === null ? null : v!.trim();
}

/**
 * HR-D15 — the clock decides the status.
 *
 *   nothing worked         → ABSENT
 *   under 75% of the day   → HALF_DAY
 *   75% or more            → PRESENT
 *
 * LEAVE is never derived and never overwritten. A clock can say somebody was
 * not here; it cannot say whether that was approved. That is a decision, so it
 * stays something a person states explicitly.
 *
 * The screen applies the same rule live, but it lives here too so an API caller
 * cannot write a row whose status and hours disagree.
 */
export const HALF_DAY_THRESHOLD = 0.75;

export function statusFromMinutes(
  minutes: number,
  dutyHoursPerDay: number,
  current?: AttendanceStatus | null,
): AttendanceStatus {
  if (current === 'LEAVE') return 'LEAVE';
  if (minutes <= 0) return 'ABSENT';
  const duty = Math.max(1, Math.round(dutyHoursPerDay * 60));
  return minutes < duty * HALF_DAY_THRESHOLD ? 'HALF_DAY' : 'PRESENT';
}

/** midnight, so @db.Date comparisons behave */
export function dayOnly(v: string | Date): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('That is not a valid date');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** HR-R15 — is this date already inside an approved payroll run? */
  private async lockedOn(date: Date): Promise<string | null> {
    const run = await this.prisma.db.payroll.findFirst({
      where: { status: 'APPROVED', periodStart: { lte: date }, periodEnd: { gte: date } },
      select: { payrollNo: true, period: true },
    });
    return run ? `${run.payrollNo} (${run.period})` : null;
  }

  /**
   * The sheet for one day: every active employee, with whatever was already
   * saved, and PRESENT as the default for anyone not yet marked.
   */
  async sheet(onDate?: string) {
    const date = dayOnly(onDate ?? new Date());
    const today = dayOnly(new Date());
    const [staff, saved, locked] = await Promise.all([
      this.prisma.db.employee.findMany({
        /*  HR-R21 — everybody who was EMPLOYED on this day, not everybody
            active today. Someone who left on the 20th must still appear on the
            sheet for the 12th, or last month's days quietly lose a person. */
        where: {
          AND: [
            { joinedOn: { lte: new Date(date.getTime() + 86_400_000 - 1) } },
            { OR: [{ status: 'ACTIVE' }, { leftOn: { gte: date } }] },
          ],
        },
        orderBy: { name: 'asc' },
        select: {
          id: true, employeeNo: true, name: true, payType: true, ratePaisa: true, photoUrl: true,
          dutyHoursPerDay: true, shiftStart: true, shiftEnd: true,
          role: { select: { id: true, name: true } },
        },
      }),
      this.prisma.db.attendance.findMany({ where: { onDate: date } }),
      this.lockedOn(date),
    ]);
    const byId = new Map(saved.map((a) => [a.employeeId, a]));

    return {
      onDate: date.toISOString().slice(0, 10),
      isFuture: date > today,
      lockedBy: locked,
      everMarked: saved.length > 0,
      rows: staff.map((e) => {
        const a = byId.get(e.id);
        const status = (a?.status ?? 'PRESENT') as AttendanceStatus;
        return {
          employeeId: e.id,
          employeeNo: e.employeeNo,
          name: e.name,
          roleName: e.role?.name ?? null,
          photoUrl: e.photoUrl,
          payType: e.payType,
          ratePaisa: e.ratePaisa,
          /// HR-D12 — the row carries the person's own full-day length, so the
          /// screen can say "Half day = 4 h of 8" instead of just "Half day"
          dutyHoursPerDay: e.dutyHoursPerDay,
          /// HR-D13 — their usual shift, so the row can show it as a hint even
          /// on a day nobody has touched
          shiftStart: e.shiftStart,
          shiftEnd: e.shiftEnd,
          // an unmarked row arrives pre-filled with their normal shift
          inTime: a?.inTime ?? (status === 'PRESENT' ? e.shiftStart : null),
          outTime: a?.outTime ?? (status === 'PRESENT' ? e.shiftEnd : null),
          status,
          isPaidLeave: a?.isPaidLeave ?? true,
          // an unmarked row shows what a full day is for this person, not zero
          minutes:
            a?.minutes ??
            spanMinutes(e.shiftStart, e.shiftEnd) ??
            defaultMinutesFor(status, e.dutyHoursPerDay),
          note: a?.note ?? null,
          markedBy: a?.markedBy ?? null,
          saved: !!a,
        };
      }),
    };
  }

  /** save the whole day in one go (HR-R12) */
  async save(dto: AttendanceSaveDto) {
    const date = dayOnly(dto.onDate ?? new Date());
    const today = dayOnly(new Date());
    if (date > today) throw new BadRequestException('That day has not happened yet (HR-R13)');

    const locked = await this.lockedOn(date);
    if (locked)
      throw new BadRequestException(
        `This day is inside approved payroll ${locked} — it cannot be changed any more (HR-R15)`,
      );

    const rows = dto.rows ?? [];
    if (rows.length === 0) throw new BadRequestException('Nothing to save');

    const ids = rows.map((r) => r.employeeId);
    const staff = await this.prisma.db.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, payType: true, dutyHoursPerDay: true },
    });
    const known = new Map(staff.map((s) => [s.id, s]));
    for (const r of rows)
      if (!known.has(r.employeeId))
        throw new BadRequestException('One of those people is not on the staff list any more');

    const actorName = dto.actorName ?? 'Admin';
    for (const r of rows) {
      const duty = known.get(r.employeeId)!.dutyHoursPerDay;
      // HR-D15 — a caller that sends times but no status gets the honest reading
      // of those times rather than a silent "present"
      const claimed = r.status as AttendanceStatus | undefined;
      const fromClock = spanMinutes(r.inTime, r.outTime);
      const status: AttendanceStatus =
        claimed ?? (fromClock !== null ? statusFromMinutes(fromClock, duty) : 'PRESENT');
      const away = status === 'ABSENT' || status === 'LEAVE';
      const inTime = away ? null : cleanTime(r.inTime);
      const outTime = away ? null : cleanTime(r.outTime);

      // HR-R14/HR-D12/HR-D13 — hours are kept for everyone, and they come from
      // the most specific thing available: what was typed, else the clock, else
      // the normal day for this person. That last fallback is what makes
      // "half day" a quantity rather than a word.
      const minutes =
        r.minutes === undefined || r.minutes === null
          ? (spanMinutes(inTime, outTime) ?? defaultMinutesFor(status, duty))
          : Math.max(0, Math.round(r.minutes));
      if (minutes > 24 * 60) throw new BadRequestException('More than 24 hours in one day?');
      const data = {
        status,
        isPaidLeave: status === 'LEAVE' ? (r.isPaidLeave ?? true) : true,
        inTime,
        outTime,
        minutes: away ? 0 : minutes,
        note: r.note?.trim() || null,
        markedBy: actorName,
      };
      await this.prisma.db.attendance.upsert({
        where: { employeeId_onDate: { employeeId: r.employeeId, onDate: date } },
        create: { employeeId: r.employeeId, onDate: date, ...data },
        update: data,
      });
    }

    await this.audit.record({
      entityType: 'Attendance',
      entityId: date.toISOString().slice(0, 10),
      action: 'UPDATE',
      actorName,
      changes: { onDate: date.toISOString().slice(0, 10), people: rows.length },
    });
    return this.sheet(date.toISOString().slice(0, 10));
  }

  /** one person's month — used on the employee page and by payroll */
  async forEmployee(employeeId: string, from: Date, to: Date) {
    return this.prisma.db.attendance.findMany({
      where: { employeeId, onDate: { gte: from, lte: to } },
      orderBy: { onDate: 'asc' },
    });
  }

  /**
   * What payroll needs, per person, over a range.
   *
   *   days    the PAID part      PRESENT 1 · HALF_DAY 0.5 · paid LEAVE 1
   *   absent  the UNPAID part    ABSENT 1 · unpaid LEAVE 1 · HALF_DAY 0.5
   *   marked  how many days were recorded at all
   *   minutes hours actually worked
   *
   * days + absent = marked, always. That identity is what lets the payroll
   * screen show a monthly deduction as (rate x absent / marked) — an arithmetic
   * the owner can read, instead of a number the system decided on its own.
   *
   * Halves are summed as halves and only rounded at the end, so two half days
   * make one paid day rather than being lost twice.
   */
  async totals(from: Date, to: Date, employeeIds?: string[]) {
    const rows = await this.prisma.db.attendance.findMany({
      where: {
        onDate: { gte: from, lte: to },
        ...(employeeIds?.length ? { employeeId: { in: employeeIds } } : {}),
      },
      select: { employeeId: true, status: true, isPaidLeave: true, minutes: true },
    });
    const out = new Map<string, { days: number; minutes: number; marked: number; absent: number }>();
    for (const r of rows) {
      const cur = out.get(r.employeeId) ?? { days: 0, minutes: 0, marked: 0, absent: 0 };
      cur.marked += 1;
      if (r.status === 'PRESENT') cur.days += 1;
      else if (r.status === 'HALF_DAY') { cur.days += 0.5; cur.absent += 0.5; }
      else if (r.status === 'LEAVE' && r.isPaidLeave) cur.days += 1;
      else cur.absent += 1;
      cur.minutes += r.minutes;
      out.set(r.employeeId, cur);
    }
    return out;
  }

  /** month view for one person — the Attendance tab on the employee page */
  async monthFor(employeeId: string, period: string) {
    const [y, m] = period.split('-').map(Number);
    if (!y || !m) throw new BadRequestException('Period must look like 2026-07');
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));
    const rows = await this.forEmployee(employeeId, from, to);
    const totals = (await this.totals(from, to, [employeeId])).get(employeeId) ?? {
      days: 0,
      minutes: 0,
      marked: 0,
      absent: 0,
    };
    return { period, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), rows, totals };
  }
}
