import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/*
  AUDIT — reading the trail that has been collecting since day one.

  Every owning module has been calling AuditService.record() since the first
  screen was built. Nothing has ever read it back. So the system has a complete
  record of who did what, and no way to look at it — which is the same as not
  having one.

  This module OWNS NOTHING. It is Intelligence, not Operations: it reads
  AuditLog and ActivityEvent and writes neither (constitution — an Intelligence
  module never owns business data). There are no endpoints here that change
  anything, deliberately. An audit trail somebody can edit is decoration.

  Two tables, two purposes, both shown:
    AuditLog       the machine's record — which field went from what to what
    ActivityEvent  the human timeline — "Order RAD-58217 marked delivered"
*/

@Injectable()
export class AuditReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** the entity types where a mistake costs money — the filter people want */
  static readonly MONEY_ENTITIES = [
    'Expense',
    'Income',
    'Transfer',
    'JournalEntry',
    'Payroll',
    'FinanceAccount',
    'FinanceSetting',
    'Partner',
    'Loan',
    'FixedAsset',
    'SalesReturn',
    'AffiliatePayout',
    'AffiliateCommission',
    'Order',
    'PosShift',
    'AppUser',
  ];

  async list(q: {
    entityType?: string;
    action?: string;
    actor?: string;
    moneyOnly?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
  }) {
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(10, parseInt(q.pageSize ?? '60', 10) || 60));

    const where: Prisma.AuditLogWhereInput = {};
    if (q.entityType) where.entityType = q.entityType;
    if (q.action) where.action = q.action as 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
    if (q.actor) where.actorName = { contains: q.actor, mode: 'insensitive' };
    if (q.moneyOnly === '1') where.entityType = { in: AuditReadService.MONEY_ENTITIES };
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { entityId: { contains: s, mode: 'insensitive' } },
        { actorName: { contains: s, mode: 'insensitive' } },
        { entityType: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) {
        const to = new Date(q.to);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** the human-readable feed, for the same period */
  async activity(q: { days?: string; kind?: string } = {}) {
    const days = Math.min(90, Math.max(1, parseInt(q.days ?? '7', 10) || 7));
    const where: Prisma.ActivityEventWhereInput = {
      createdAt: { gte: new Date(Date.now() - days * 864e5) },
    };
    if (q.kind) where.kind = q.kind as 'sales' | 'delivery' | 'payment' | 'system' | 'general';
    return this.prisma.db.activityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  /** what kinds of thing exist in the trail, and who has been busy */
  async facets() {
    const [types, actors] = await Promise.all([
      this.prisma.db.auditLog.groupBy({
        by: ['entityType'],
        _count: { _all: true },
        orderBy: { _count: { entityType: 'desc' } },
        take: 40,
      }),
      this.prisma.db.auditLog.groupBy({
        by: ['actorName'],
        _count: { _all: true },
        orderBy: { _count: { actorName: 'desc' } },
        take: 20,
      }),
    ]);
    return {
      types: types.map((t) => ({ entityType: t.entityType, count: t._count._all })),
      actors: actors.map((a) => ({ actorName: a.actorName, count: a._count._all })),
      moneyEntities: AuditReadService.MONEY_ENTITIES,
    };
  }

  async stats() {
    const since = (d: number) => new Date(Date.now() - d * 864e5);
    const [total, today, week, money7, backups] = await Promise.all([
      this.prisma.db.auditLog.count(),
      this.prisma.db.auditLog.count({ where: { createdAt: { gte: startOfToday() } } }),
      this.prisma.db.auditLog.count({ where: { createdAt: { gte: since(7) } } }),
      this.prisma.db.auditLog.count({
        where: {
          createdAt: { gte: since(7) },
          entityType: { in: AuditReadService.MONEY_ENTITIES },
        },
      }),
      this.backups(1),
    ]);

    const last = backups.items[0] ?? null;
    const hoursOld = last
      ? Math.round(((Date.now() - new Date(last.createdAt).getTime()) / 3600_000) * 10) / 10
      : null;

    return {
      total,
      today,
      week,
      money7,
      lastBackupAt: last?.createdAt ?? null,
      lastBackupHoursAgo: hoursOld,
      /*  30 hours, not 24: the nightly task runs at 1:30 AM and a shop laptop
          that was switched off catches up when it is next turned on. Shouting
          at 24 hours would cry wolf every single morning. */
      backupStale: hoursOld === null || hoursOld > 30,
    };
  }

  /** the nightly copies — written by radian_backup.bat, read here */
  async backups(limit = 30) {
    const items = await this.prisma.db.auditLog.findMany({
      where: { entityType: 'Backup' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { items, total: await this.prisma.db.auditLog.count({ where: { entityType: 'Backup' } }) };
  }

  /** everything ever recorded about one thing */
  async forEntity(entityType: string, entityId: string) {
    const [audit, activity] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where: { entityType, entityId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.db.activityEvent.findMany({
        where: { entityType, entityId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    return { audit, activity };
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
