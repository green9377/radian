import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, EmployeeStatus, PayType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { eraseOrBury } from '../common/erase';
import { AuditService } from '../common/audit.service';
import { ACC2 } from '../finance/finance.service';
import { dayOnly, hhmmToMinutes } from './attendance.service';
import type {
  DocumentWriteDto,
  EmployeeListQuery,
  EmployeeRoleDto,
  EmployeeWriteDto,
} from './hr.dto';

/*
  EMPLOYEE — the person. Master Data.
  Full reasoning: RADIAN_HR_MODULE_ARCHITECTURE.md (28 Jul 2026).

  Rules enforced here:
    HR-R01  name + joinedOn are the only required fields
    HR-R02  soft delete only; INACTIVE hides from pickers, keeps history  core
    HR-R03  audit + timeline on every write                              core
    HR-R04  advance outstanding is DERIVED from the ledger (account 1210,
            employeeId dimension) — never stored on the employee row      HR-D06
    HR-R09  sequential EMP- numbers                                       DEC-PUR-008 shape
    HR-R10  personal columns (NID, DOB, address, next of kin) are visible
            to OWNER only; MANAGER gets the working fields                kickoff §4.6
    HR-R11  an employee with ledger history is never hard-deleted, and a
            login account may belong to at most one person                HR-D01
    HR-R18  a role in use cannot be deleted, only switched off            HR-D10
    HR-R19  a document is capped in size and soft-deleted, never purged   HR-D11
    HR-R25  "payable" includes leavers who still owe an advance, and anyone who
            left in the last 90 days — otherwise the money could never be
            settled, only forgotten
    HR-R26  documents are OWNER-only, because they contain the very fields
            HR-R10 hides from a MANAGER
*/

const ENTITY = 'Employee';

/** the columns a MANAGER must not see (HR-R10) */
const PRIVATE_FIELDS = [
  'nid',
  'dateOfBirth',
  'address',
  'emergencyName',
  'emergencyPhone',
] as const;

/** HR-D10 — first-read seed, same lazy pattern as SupplierType */
const SEED_ROLES = ['Florist', 'Shop assistant', 'Delivery boy', 'Manager', 'Cleaner'];

/** HR-R19 — a data URL is ~1.37x the raw file, so this is roughly a 2.5 MB file */
const MAX_DOC_CHARS = 3_500_000;

/** HR-D13 — only well-formed clock text is stored; anything else becomes null */
function cleanShift(v?: string | null): string | null {
  return hhmmToMinutes(v) === null ? null : v!.trim();
}

export type ViewerRole = 'OWNER' | 'MANAGER' | 'STAFF';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------------------------------------------------------- numbers */

  private async nextNo(): Promise<string> {
    const last = await this.prisma.employee.findFirst({
      where: { employeeNo: { startsWith: 'EMP-' } },
      orderBy: { employeeNo: 'desc' },
      select: { employeeNo: true },
    });
    const n = last ? parseInt(last.employeeNo.slice(4), 10) + 1 : 1;
    return `EMP-${String(n).padStart(6, '0')}`;
  }

  /* ------------------------------------------------------------------ roles */

  private async ensureRoles() {
    const count = await this.prisma.db.employeeRole.count();
    if (count > 0) return;
    for (let i = 0; i < SEED_ROLES.length; i += 1)
      await this.prisma.db.employeeRole.create({ data: { name: SEED_ROLES[i], sortOrder: i } });
  }

  async listRoles() {
    await this.ensureRoles();
    return this.prisma.db.employeeRole.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
    });
  }

  async createRole(dto: EmployeeRoleDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Give the role a name');
    const dup = await this.prisma.db.employeeRole.findFirst({ where: { name } });
    if (dup) throw new BadRequestException(`"${name}" is already on the list`);
    const created = await this.prisma.db.employeeRole.create({
      data: { name, note: dto.note?.trim() || null, sortOrder: dto.sortOrder ?? 99 },
    });
    await this.audit.record({
      entityType: 'EmployeeRole',
      entityId: created.id,
      action: 'CREATE',
      actorName: dto.actorName ?? 'Admin',
      changes: { name },
    });
    return created;
  }

  async updateRole(id: string, dto: EmployeeRoleDto) {
    const before = await this.prisma.db.employeeRole.findFirst({ where: { id } });
    if (!before) throw new NotFoundException('Role not found');
    const data: Prisma.EmployeeRoleUpdateInput = {};
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (!n) throw new BadRequestException('Give the role a name');
      const dup = await this.prisma.db.employeeRole.findFirst({ where: { name: n, id: { not: id } } });
      if (dup) throw new BadRequestException(`"${n}" is already on the list`);
      data.name = n;
    }
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const updated = await this.prisma.db.employeeRole.update({ where: { id }, data });
    await this.audit.record({
      entityType: 'EmployeeRole',
      entityId: id,
      action: 'UPDATE',
      actorName: dto.actorName ?? 'Admin',
      changes: { from: before.name, to: updated.name, isActive: updated.isActive },
    });
    return updated;
  }

  /** HR-R18 — a role somebody actually holds is switched off, never removed */
  async removeRole(id: string, actorName: string) {
    const inUse = await this.prisma.db.employee.count({ where: { roleId: id } });
    if (inUse > 0)
      throw new BadRequestException(
        `${inUse} ${inUse === 1 ? 'person holds' : 'people hold'} this role — switch it off instead, so their records keep making sense`,
      );
    await eraseOrBury(
      () => this.prisma.employeeRole.delete({ where: { id } }),
      () => this.prisma.db.employeeRole.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Employee Role',
    );
    await this.audit.record({ entityType: 'EmployeeRole', entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /* ---------------------------------------------------------------- privacy */

  /*  HR-R10 — strip the personal columns unless the viewer is the OWNER.

      The return type says `T & { privateHidden?: true }`, not plain `T`,
      because this method ADDS a field and the old signature denied it. The
      denial was not harmless: `hr.selftest.ts` checks
      `asManager.privateHidden === true`, and TypeScript rejected the line
      because as far as it knew the field could not exist. The test was right
      and the type was wrong. Optional, because the OWNER's row does not get
      the flag at all — it has nothing hidden to declare. */
  private mask<T extends Record<string, unknown>>(
    row: T,
    role: ViewerRole,
  ): T & { privateHidden?: true } {
    if (role === 'OWNER') return row;
    const copy = { ...row } as Record<string, unknown>;
    for (const f of PRIVATE_FIELDS) copy[f] = null;
    copy.privateHidden = true;
    return copy as T & { privateHidden?: true };
  }

  /* ------------------------------------------------------- advance (derived) */

  /**
   * HR-R04 — what each person still owes on their salary advance, read straight
   * off the ledger. One account (1210) + the employeeId dimension; never an
   * account per person (the G2 lesson), and never a duplicated balance column
   * that can drift away from the books.
   *
   * Ledger rows written before this module carry employeeName only and no id.
   * They are deliberately not guessed at — see HR-D06.
   */
  async advanceMap(): Promise<Map<string, number>> {
    const acc = await this.prisma.db.financeAccount.findUnique({
      where: { code: ACC2.EMPLOYEE_ADVANCE },
      select: { id: true },
    });
    const out = new Map<string, number>();
    if (!acc) return out;
    const rows = await this.prisma.db.journalLine.groupBy({
      by: ['employeeId'],
      where: { accountId: acc.id, employeeId: { not: null } },
      _sum: { debitPaisa: true, creditPaisa: true },
    });
    for (const r of rows) {
      if (!r.employeeId) continue;
      out.set(r.employeeId, (r._sum.debitPaisa ?? 0) - (r._sum.creditPaisa ?? 0));
    }
    return out;
  }

  async advanceFor(employeeId: string): Promise<number> {
    return (await this.advanceMap()).get(employeeId) ?? 0;
  }

  /* ------------------------------------------------------------------- read */

  async list(q: EmployeeListQuery, role: ViewerRole = 'MANAGER') {
    const where: Prisma.EmployeeWhereInput = {};
    if (q.status && q.status !== 'ALL') where.status = q.status as EmployeeStatus;
    else if (!q.status) where.status = 'ACTIVE';
    if (q.payType) where.payType = q.payType as PayType;
    if (q.roleId) where.roleId = q.roleId;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { employeeNo: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [rows, advances] = await Promise.all([
      this.prisma.db.employee.findMany({
        where,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        include: {
          appUser: { select: { id: true, username: true, role: true } },
          role: { select: { id: true, name: true } },
          _count: { select: { documents: { where: { deletedAt: null } } } },
        },
      }),
      this.advanceMap(),
    ]);

    return {
      items: rows.map((e) =>
        this.mask({ ...e, advanceOutstandingPaisa: advances.get(e.id) ?? 0 }, role),
      ),
      total: rows.length,
    };
  }

  /**
   * Everyone who may legally be paid — the ONLY source Finance offers (HR-D06).
   *
   * HR-R25 — this is not simply "status = ACTIVE". Somebody who has left may
   * still be owed a final salary, and may still OWE an advance: excluding them
   * meant that money could never be settled in the system at all, only
   * forgotten.
   *
   * A leaver stays reachable while EITHER is true:
   *   · they still hold an advance — that has to be recoverable, for ever if need be
   *   · they left recently — their final salary may not have gone out yet
   *
   * "Recently" is 90 days. The first build only kept the ones who owed money,
   * which meant somebody who left owing nothing could never be paid their last
   * month either — caught by the self-test, 28 Jul. A window rather than "for
   * ever" because a picker that accumulates every person who ever worked here
   * stops being usable, and a genuinely old case can be made active for a moment.
   */
  async payable() {
    const advances = await this.advanceMap();
    const owing = [...advances.entries()].filter(([, v]) => v !== 0).map(([id]) => id);
    const recently = new Date();
    recently.setDate(recently.getDate() - 90);
    const rows = await this.prisma.db.employee.findMany({
      where: {
        OR: [
          { status: 'ACTIVE' },
          { id: { in: owing } },
          // left recently, or left with no date recorded (so, unknown = treat as recent)
          { AND: [{ status: 'INACTIVE' }, { OR: [{ leftOn: { gte: recently } }, { leftOn: null }] }] },
        ],
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: {
        id: true, employeeNo: true, name: true, status: true, leftOn: true,
        payType: true, ratePaisa: true,
        dutyHoursPerDay: true, shiftStart: true, shiftEnd: true,
        role: { select: { id: true, name: true } },
      },
    });
    return rows.map((e) => ({
      ...e,
      hasLeft: e.status !== 'ACTIVE',
      advanceOutstandingPaisa: advances.get(e.id) ?? 0,
    }));
  }

  async stats() {
    const [total, active, advances] = await Promise.all([
      this.prisma.db.employee.count(),
      this.prisma.db.employee.count({ where: { status: 'ACTIVE' } }),
      this.advanceMap(),
    ]);
    let advanceOutstandingPaisa = 0;
    for (const v of advances.values()) if (v > 0) advanceOutstandingPaisa += v;

    // this month's committed monthly wage bill — a planning figure, not a ledger
    // figure, so it is clearly labelled as such in the UI
    const monthly = await this.prisma.db.employee.findMany({
      where: { status: 'ACTIVE', payType: 'MONTHLY' },
      select: { ratePaisa: true },
    });
    const monthlyWageBillPaisa = monthly.reduce((n, e) => n + e.ratePaisa, 0);

    // the day sheet stores UTC midnight (@db.Date) — use the same helper it does,
    // or this count silently misses by a day wherever the server is not on UTC
    const today = dayOnly(new Date());
    const marked = await this.prisma.db.attendance.groupBy({
      by: ['status'],
      where: { onDate: today },
      _count: { _all: true },
    });
    const presentToday =
      (marked.find((m) => m.status === 'PRESENT')?._count._all ?? 0) +
      (marked.find((m) => m.status === 'HALF_DAY')?._count._all ?? 0);

    return {
      total,
      active,
      inactive: total - active,
      advanceOutstandingPaisa,
      monthlyWageBillPaisa,
      presentToday,
      attendanceMarkedToday: marked.reduce((n, m) => n + m._count._all, 0),
    };
  }

  async get(id: string, role: ViewerRole = 'MANAGER') {
    const e = await this.prisma.db.employee.findFirst({
      where: { id },
      include: {
        appUser: { select: { id: true, username: true, role: true } },
        role: { select: { id: true, name: true } },
      },
    });
    if (!e) throw new NotFoundException('Employee not found');
    return this.mask({ ...e, advanceOutstandingPaisa: await this.advanceFor(id) }, role);
  }

  /** the person's own money history — read from the ledger, never copied */
  async ledger(id: string) {
    const e = await this.prisma.db.employee.findFirst({ where: { id }, select: { id: true } });
    if (!e) throw new NotFoundException('Employee not found');
    const [salaryAcc, advanceAcc] = await Promise.all([
      this.prisma.db.financeAccount.findUnique({ where: { code: '5420' }, select: { id: true } }),
      this.prisma.db.financeAccount.findUnique({
        where: { code: ACC2.EMPLOYEE_ADVANCE },
        select: { id: true },
      }),
    ]);
    const lines = await this.prisma.db.journalLine.findMany({
      where: { employeeId: id },
      include: {
        entry: { select: { entryNo: true, entryDate: true, narration: true } },
        account: { select: { code: true, name: true } },
      },
      orderBy: { id: 'desc' },
      take: 300,
    });
    return lines.map((l) => ({
      id: l.id,
      entryNo: l.entry.entryNo,
      entryDate: l.entry.entryDate,
      narration: l.entry.narration,
      accountCode: l.account.code,
      accountName: l.account.name,
      debitPaisa: l.debitPaisa,
      creditPaisa: l.creditPaisa,
      note: l.note,
      kind:
        l.accountId === advanceAcc?.id
          ? l.debitPaisa > 0
            ? 'ADVANCE_GIVEN'
            : 'ADVANCE_RECOVERED'
          : l.accountId === salaryAcc?.id
            ? 'SALARY'
            : 'OTHER',
    }));
  }

  timeline(id: string) {
    return this.audit.timeline(ENTITY, id);
  }

  async payslips(id: string) {
    // PayrollLine has no deletedAt of its own (it lives and dies with the run),
    // so a discarded draft is excluded through the parent instead
    return this.prisma.db.payrollLine.findMany({
      where: { employeeId: id, payroll: { deletedAt: null } },
      include: { payroll: { select: { payrollNo: true, period: true, status: true, approvedAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 36,
    });
  }

  /* -------------------------------------------------------------- documents */

  /*  HR-R26 — a document is at least as private as the fields it contains.
      The first build hid the NID NUMBER from a MANAGER (HR-R10) while happily
      handing over the scan of the same card, which made the privacy rule
      decorative. Documents are OWNER-only, and it is enforced here rather than
      by hiding a tab. */
  private requireOwner(role: ViewerRole) {
    if (role !== 'OWNER')
      throw new ForbiddenException(
        'Staff documents are open to the owner only — they hold NID and contract scans (HR-R26)',
      );
  }

  /** HR-D11 — the list never carries the file itself, or every page load would
      drag megabytes across for nothing. Fetch one by id to actually open it. */
  async listDocuments(employeeId: string, role: ViewerRole = 'MANAGER') {
    this.requireOwner(role);
    return this.prisma.db.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, fileName: true, mimeType: true, sizeBytes: true,
        note: true, uploadedBy: true, createdAt: true,
      },
    });
  }

  async getDocument(employeeId: string, docId: string, role: ViewerRole = 'MANAGER') {
    this.requireOwner(role);
    const d = await this.prisma.db.employeeDocument.findFirst({ where: { id: docId, employeeId } });
    if (!d) throw new NotFoundException('Document not found');
    return d;
  }

  async addDocument(employeeId: string, dto: DocumentWriteDto, role: ViewerRole = 'MANAGER') {
    this.requireOwner(role);
    const e = await this.prisma.db.employee.findFirst({ where: { id: employeeId }, select: { id: true } });
    if (!e) throw new NotFoundException('Employee not found');
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Give the document a name');
    if (!dto.dataUrl?.startsWith('data:'))
      throw new BadRequestException('Attach a file');
    if (dto.dataUrl.length > MAX_DOC_CHARS)
      throw new BadRequestException(
        'That file is too big (about 2.5 MB is the limit) — a photo of the page is usually plenty',
      );

    const created = await this.prisma.db.employeeDocument.create({
      data: {
        employeeId,
        title,
        fileName: dto.fileName?.slice(0, 200) ?? null,
        mimeType: dto.mimeType ?? null,
        sizeBytes: dto.sizeBytes ?? Math.round((dto.dataUrl.length * 3) / 4),
        dataUrl: dto.dataUrl,
        note: dto.note?.trim() || null,
        uploadedBy: dto.actorName ?? 'Admin',
      },
      select: { id: true, title: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
    });
    await this.audit.record({
      entityType: 'EmployeeDocument',
      entityId: created.id,
      action: 'CREATE',
      actorName: dto.actorName ?? 'Admin',
      changes: { employeeId, title },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: employeeId,
      kind: 'system',
      label: `Document added — ${title}`,
      actorName: dto.actorName ?? 'Admin',
    });
    return created;
  }

  async removeDocument(employeeId: string, docId: string, actorName: string, role: ViewerRole = 'MANAGER') {
    this.requireOwner(role);
    const d = await this.prisma.db.employeeDocument.findFirst({ where: { id: docId, employeeId } });
    if (!d) throw new NotFoundException('Document not found');
    await this.prisma.db.employeeDocument.update({ where: { id: docId }, data: { deletedAt: new Date() } });
    await this.audit.record({
      entityType: 'EmployeeDocument',
      entityId: docId,
      action: 'DELETE',
      actorName,
      changes: { employeeId, title: d.title },
    });
    return { id: docId, deleted: true };
  }

  /* ------------------------------------------------------------------ write */

  private parseDate(v: string | null | undefined, field: string): Date | null {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} is not a valid date`);
    return d;
  }

  private async checkAppUser(appUserId: string | null | undefined, selfId?: string) {
    if (!appUserId) return;
    const user = await this.prisma.db.appUser.findFirst({ where: { id: appUserId } });
    if (!user) throw new BadRequestException('That login account no longer exists');
    const taken = await this.prisma.db.employee.findFirst({
      where: { appUserId, ...(selfId ? { id: { not: selfId } } : {}) },
      select: { name: true },
    });
    if (taken)
      throw new BadRequestException(`That login already belongs to ${taken.name} (HR-D01)`);
  }

  private async checkRole(roleId: string | null | undefined) {
    if (!roleId) return;
    const r = await this.prisma.db.employeeRole.findFirst({ where: { id: roleId } });
    if (!r) throw new BadRequestException('That role is no longer on the list');
  }

  async create(dto: EmployeeWriteDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('The name is required');
    const joinedOn = this.parseDate(dto.joinedOn, 'Joining date') ?? new Date();
    if ((dto.ratePaisa ?? 0) < 0) throw new BadRequestException('A rate cannot be negative');
    await this.checkAppUser(dto.appUserId);
    await this.checkRole(dto.roleId);

    const created = await this.prisma.db.employee.create({
      data: {
        employeeNo: await this.nextNo(),
        name,
        phone: dto.phone?.trim() || null,
        altPhone: dto.altPhone?.trim() || null,
        nid: dto.nid?.trim() || null,
        dateOfBirth: this.parseDate(dto.dateOfBirth, 'Date of birth'),
        address: dto.address?.trim() || null,
        photoUrl: dto.photoUrl || null,
        emergencyName: dto.emergencyName?.trim() || null,
        emergencyPhone: dto.emergencyPhone?.trim() || null,
        roleId: dto.roleId || null,
        joinedOn,
        leftOn: this.parseDate(dto.leftOn, 'Leaving date'),
        status: (dto.status as EmployeeStatus) ?? 'ACTIVE',
        payType: (dto.payType as PayType) ?? 'MONTHLY',
        ratePaisa: dto.ratePaisa ?? 0,
        dutyHoursPerDay: dto.dutyHoursPerDay && dto.dutyHoursPerDay > 0 ? dto.dutyHoursPerDay : 8,
        shiftStart: cleanShift(dto.shiftStart),
        shiftEnd: cleanShift(dto.shiftEnd),
        appUserId: dto.appUserId || null,
        note: dto.note ?? null,
      },
      include: { role: { select: { id: true, name: true } } },
    });

    const actorName = dto.actorName ?? 'Admin';
    await this.audit.record({
      entityType: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorName,
      changes: { name, payType: created.payType, ratePaisa: created.ratePaisa },
    });
    await this.audit.event({
      entityType: ENTITY,
      entityId: created.id,
      kind: 'system',
      label: `Added as ${created.role?.name ?? 'staff'}`,
      actorName,
    });
    return created;
  }

  async update(id: string, dto: EmployeeWriteDto) {
    const before = await this.prisma.db.employee.findFirst({ where: { id } });
    if (!before) throw new NotFoundException('Employee not found');
    if (dto.appUserId !== undefined) await this.checkAppUser(dto.appUserId, id);
    if (dto.roleId !== undefined) await this.checkRole(dto.roleId);
    if (dto.ratePaisa !== undefined && dto.ratePaisa < 0)
      throw new BadRequestException('A rate cannot be negative');

    const data: Prisma.EmployeeUpdateInput = {};
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (!n) throw new BadRequestException('The name is required');
      data.name = n;
    }
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.altPhone !== undefined) data.altPhone = dto.altPhone?.trim() || null;
    if (dto.nid !== undefined) data.nid = dto.nid?.trim() || null;
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = this.parseDate(dto.dateOfBirth, 'Date of birth');
    if (dto.address !== undefined) data.address = dto.address?.trim() || null;
    if (dto.photoUrl !== undefined) data.photoUrl = dto.photoUrl || null;
    if (dto.emergencyName !== undefined) data.emergencyName = dto.emergencyName?.trim() || null;
    if (dto.emergencyPhone !== undefined) data.emergencyPhone = dto.emergencyPhone?.trim() || null;
    if (dto.joinedOn !== undefined) {
      const d = this.parseDate(dto.joinedOn, 'Joining date');
      if (d) data.joinedOn = d;
    }
    if (dto.leftOn !== undefined) data.leftOn = this.parseDate(dto.leftOn, 'Leaving date');
    if (dto.status !== undefined) data.status = dto.status as EmployeeStatus;
    if (dto.payType !== undefined) data.payType = dto.payType as PayType;
    if (dto.ratePaisa !== undefined) data.ratePaisa = dto.ratePaisa;
    if (dto.shiftStart !== undefined) data.shiftStart = cleanShift(dto.shiftStart);
    if (dto.shiftEnd !== undefined) data.shiftEnd = cleanShift(dto.shiftEnd);
    if (dto.dutyHoursPerDay !== undefined) {
      if (dto.dutyHoursPerDay <= 0 || dto.dutyHoursPerDay > 24)
        throw new BadRequestException('A duty day has to be between 1 and 24 hours');
      data.dutyHoursPerDay = dto.dutyHoursPerDay;
    }
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.roleId !== undefined)
      data.role = dto.roleId ? { connect: { id: dto.roleId } } : { disconnect: true };
    if (dto.appUserId !== undefined)
      data.appUser = dto.appUserId ? { connect: { id: dto.appUserId } } : { disconnect: true };

    const updated = await this.prisma.db.employee.update({
      where: { id },
      data,
      include: { role: { select: { id: true, name: true } } },
    });

    const changes: Record<string, unknown> = {};
    for (const k of ['name', 'phone', 'roleId', 'payType', 'ratePaisa', 'dutyHoursPerDay', 'status', 'joinedOn']) {
      const b = (before as Record<string, unknown>)[k];
      const a = (updated as Record<string, unknown>)[k];
      if (b !== undefined && String(b) !== String(a)) changes[k] = { from: b, to: a };
    }
    const actorName = dto.actorName ?? 'Admin';
    if (Object.keys(changes).length) {
      await this.audit.record({ entityType: ENTITY, entityId: id, action: 'UPDATE', actorName, changes });
      // a pay change is the one edit anybody will ever want to trace
      if (changes.ratePaisa || changes.payType)
        await this.audit.event({
          entityType: ENTITY,
          entityId: id,
          kind: 'system',
          label: `Pay changed to ${(updated.ratePaisa / 100).toFixed(2)} per ${
            updated.payType === 'MONTHLY' ? 'month' : updated.payType === 'DAILY' ? 'day' : 'hour'
          }`,
          actorName,
        });
      if (changes.status)
        await this.audit.event({
          entityType: ENTITY,
          entityId: id,
          kind: 'system',
          label: updated.status === 'ACTIVE' ? 'Marked active' : 'Marked as left',
          actorName,
        });
    }
    return updated;
  }

  /** HR-R02/R11 — soft delete, and never while money is still open */
  async remove(id: string, actorName: string) {
    const e = await this.prisma.db.employee.findFirst({ where: { id } });
    if (!e) throw new NotFoundException('Employee not found');

    const outstanding = await this.advanceFor(id);
    if (outstanding !== 0)
      throw new BadRequestException(
        `${e.name} still has ${(outstanding / 100).toFixed(2)} of advance outstanding — settle it first, or mark them as left instead`,
      );
    const openLine = await this.prisma.db.payrollLine.findFirst({
      where: { employeeId: id, payroll: { status: 'DRAFT', deletedAt: null } },
      select: { id: true },
    });
    if (openLine)
      throw new BadRequestException('This person is on an unapproved payroll run — remove them there first');

    await this.prisma.db.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  async restore(id: string, actorName: string) {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Employee not found');
    await this.prisma.employee.update({ where: { id }, data: { deletedAt: null } });
    await this.audit.record({ entityType: ENTITY, entityId: id, action: 'UPDATE', actorName, changes: { restored: true } });
    return { id, restored: true };
  }

  async trash() {
    const rows = await this.prisma.employee.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    });
    return { items: rows, total: rows.length };
  }
}
