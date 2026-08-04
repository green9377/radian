import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { OutreachService } from './outreach.service';
import { SettingsService } from './settings.service';

/*
  WHATSAPP — templates and send lists. MKT-D18.

  Everything here works with no API, no approval and no per-message cost,
  because it does the only thing that reliably works today: it opens WhatsApp
  with the message already written, one customer at a time, and remembers who
  has been done.

  That sounds primitive next to "bulk send". It is also how a shop with a few
  thousand customers actually reaches them without a Business API account, and
  it has one real advantage the automatic version does not: a person sees each
  message before it goes, so the wrong list cannot be blasted at three thousand
  people in four seconds.

  MKT-D18 — a send is still an Outreach row. That is not a technicality: it
  means the opt-out list, the one-contact-per-occasion rule and the "did it
  work" report all keep working, and a broadcast cannot become a second, less
  careful way to message people.

  THE SNAPSHOT. A broadcast keeps its own copy of the message. Editing a
  template afterwards must not rewrite what was already sent — the same rule
  the ledger lives by.
*/

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outreach: OutreachService,
    private readonly settings: SettingsService,
  ) {}

  /* ================= templates ================= */

  async templates(q: { purpose?: string } = {}) {
    const where: Prisma.WhatsappTemplateWhereInput = {};
    if (q.purpose) where.purpose = q.purpose;
    return this.prisma.db.whatsappTemplate.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async saveTemplate(id: string | null, dto: Record<string, unknown>, actorName: string) {
    const name = String(dto.name ?? '').trim();
    const body = String(dto.body ?? '').trim();
    if (!name) throw new BadRequestException('Give the message a name so it can be found again');
    if (!body) throw new BadRequestException('The message itself is empty');
    if (body.length > 3000) throw new BadRequestException('That is far too long for a WhatsApp message');

    const data = {
      name,
      body,
      purpose: String(dto.purpose ?? 'PROMO'),
      isActive: dto.isActive === undefined ? true : !!dto.isActive,
      sortOrder: Math.round(Number(dto.sortOrder) || 0),
      actorName,
    };

    if (id) {
      const row = await this.prisma.db.whatsappTemplate.update({ where: { id }, data });
      await this.audit.record({ entityType: 'WhatsappTemplate', entityId: id, action: 'UPDATE', actorName, changes: { name } });
      return row;
    }
    const row = await this.prisma.db.whatsappTemplate.create({ data });
    await this.audit.record({ entityType: 'WhatsappTemplate', entityId: row.id, action: 'CREATE', actorName, changes: { name } });
    return row;
  }

  async removeTemplate(id: string, actorName: string) {
    await this.prisma.db.whatsappTemplate.update({ where: { id }, data: { deletedAt: new Date(), actorName } });
    await this.audit.record({ entityType: 'WhatsappTemplate', entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /* ================= who to send to ================= */

  /*  Filters a shopkeeper would actually use, not a query builder.

      Opt-outs are removed here and cannot be filtered back in — MKT-RULE-009
      has no exception, and the one place somebody would try to make one is a
      bulk list. */
  private async pickCustomers(f: {
    orderedWithinDays?: number;
    notOrderedForDays?: number;
    minOrders?: number;
    neverOrdered?: boolean;
    segmentId?: string;
    limit?: number;
  }) {
    const where: Prisma.CustomerWhereInput = { status: 'ACTIVE' };

    if (f.neverOrdered) where.ordersCount = 0;
    else if (f.minOrders) where.ordersCount = { gte: f.minOrders };

    /*  REV-MKT-6 — both may be set at once, and both must apply.
        Each used to assign `where.lastOrderAt` outright, so asking for
        "bought in the last 90 days but not in the last 30" silently became
        just "not in the last 30" — a wider list than the person asked for,
        and on a send list wider is the wrong way to be wrong. */
    const lastOrderAt: Prisma.DateTimeNullableFilter = {};
    if (f.orderedWithinDays)
      lastOrderAt.gte = new Date(Date.now() - f.orderedWithinDays * 864e5);
    if (f.notOrderedForDays)
      lastOrderAt.lt = new Date(Date.now() - f.notOrderedForDays * 864e5);
    if (Object.keys(lastOrderAt).length) where.lastOrderAt = lastOrderAt;
    if (f.segmentId) where.segments = { some: { id: f.segmentId } };

    const rows = await this.prisma.db.customer.findMany({
      where,
      orderBy: { lastOrderAt: 'desc' },
      take: Math.min(2000, f.limit ?? 500),
      select: {
        id: true, name: true, phone: true, ordersCount: true, lastOrderAt: true,
        marketingOptOut: { select: { id: true, deletedAt: true } },
      },
    });

    // the extension does not reach into a nested include — check by hand
    return rows.filter((c) => !(c.marketingOptOut && c.marketingOptOut.deletedAt === null));
  }

  async preview(f: Record<string, unknown>) {
    const people = await this.pickCustomers(f as Parameters<typeof this.pickCustomers>[0]);
    return {
      count: people.length,
      sample: people.slice(0, 8).map((p) => ({ id: p.id, name: p.name, phone: p.phone })),
    };
  }

  /* ================= broadcasts ================= */

  private async nextNo(): Promise<string> {
    const rows = await this.prisma.broadcast.findMany({ select: { no: true } });
    let max = 0;
    for (const r of rows) {
      const m = /^BC-(\d{4,})$/.exec(r.no);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `BC-${String(max + 1).padStart(6, '0')}`;
  }

  async createBroadcast(dto: Record<string, unknown>, actorName: string) {
    const name = String(dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Give the list a name');

    let body = String(dto.body ?? '').trim();
    const templateId = (dto.templateId as string) || null;
    if (templateId && !body) {
      const t = await this.prisma.db.whatsappTemplate.findUnique({ where: { id: templateId } });
      if (!t) throw new BadRequestException('That message does not exist');
      body = t.body;
    }
    if (!body) throw new BadRequestException('Pick a message, or write one');

    const people = await this.pickCustomers(dto as Parameters<typeof this.pickCustomers>[0]);
    if (people.length === 0)
      throw new BadRequestException('Nobody matches those filters — nothing to send');

    const row = await this.prisma.db.broadcast.create({
      data: {
        no: await this.nextNo(),
        name,
        templateId,
        bodySnapshot: body,
        campaignId: (dto.campaignId as string) || null,
        audienceNote: (dto.audienceNote as string) || null,
        state: 'DRAFT',
        actorName,
        targets: { create: people.map((p) => ({ customerId: p.id })) },
      },
      include: { _count: { select: { targets: true } } },
    });

    await this.audit.record({
      entityType: 'Broadcast', entityId: row.id, action: 'CREATE', actorName,
      changes: { name, people: people.length },
    });
    return row;
  }

  async broadcasts() {
    const rows = await this.prisma.db.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { targets: true } },
      },
    });
    const ids = rows.map((r) => r.id);
    const sent = ids.length
      ? await this.prisma.db.broadcastTarget.groupBy({
          by: ['broadcastId', 'state'],
          where: { broadcastId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    return rows.map((r) => {
      const mine = sent.filter((s) => s.broadcastId === r.id);
      const of = (st: string) => mine.find((m) => m.state === st)?._count._all ?? 0;
      return { ...r, sent: of('SENT'), skipped: of('SKIPPED'), pending: of('PENDING') };
    });
  }

  /** the queue — whoever is next, with the message already filled in */
  async broadcast(id: string) {
    const b = await this.prisma.db.broadcast.findUnique({
      where: { id },
      include: { template: { select: { id: true, name: true } } },
    });
    if (!b) throw new NotFoundException('Broadcast not found');

    const targets = await this.prisma.db.broadcastTarget.findMany({
      where: { broadcastId: id },
      orderBy: [{ state: 'asc' }, { id: 'asc' }],
      take: 1000,
      include: {
        customer: {
          select: { id: true, name: true, phone: true, ordersCount: true, lastOrderAt: true },
        },
      },
    });

    const s = await this.settings.get();
    return {
      ...b,
      shopName: 'Radian',
      pointValuePaisa: s.pointValuePaisa,
      targets: targets.map((t) => ({
        ...t,
        /*  the message as it will actually go — filled here so the screen and
            the record cannot drift apart */
        message: fill(b.bodySnapshot, {
          customer: t.customer.name,
          shop: 'Radian',
          last_order: t.customer.lastOrderAt
            ? new Date(t.customer.lastOrderAt).toISOString().slice(0, 10)
            : '',
        }),
      })),
      counts: {
        total: targets.length,
        sent: targets.filter((t) => t.state === 'SENT').length,
        skipped: targets.filter((t) => t.state === 'SKIPPED').length,
        pending: targets.filter((t) => t.state === 'PENDING').length,
      },
    };
  }

  /*  One person done. Writes the Outreach row, so this send is counted by the
      same report as every other contact and cannot dodge the opt-out rule. */
  async markSent(targetId: string, actorName: string) {
    const t = await this.prisma.db.broadcastTarget.findUnique({
      where: { id: targetId },
      include: { broadcast: { select: { id: true, campaignId: true, templateId: true, bodySnapshot: true } } },
    });
    if (!t) throw new NotFoundException('Not found');
    if (t.state === 'SENT') return t;

    let outreachId: string | null = null;
    try {
      const o = await this.outreach.log(
        {
          customerId: t.customerId,
          channel: 'WHATSAPP',
          purpose: 'OTHER',
          message: t.broadcast.bodySnapshot.slice(0, 1000),
          campaignId: t.broadcast.campaignId,
        },
        actorName,
      );
      outreachId = o.id;
    } catch (e) {
      /*  The only thing that refuses here is an opt-out, and if somebody has
          opted out the answer is to skip them — not to send anyway and not to
          fail the whole list. */
      await this.prisma.db.broadcastTarget.update({
        where: { id: targetId },
        data: { state: 'SKIPPED', note: e instanceof Error ? e.message : 'refused' },
      });
      return this.prisma.db.broadcastTarget.findUnique({ where: { id: targetId } });
    }

    const row = await this.prisma.db.broadcastTarget.update({
      where: { id: targetId },
      data: { state: 'SENT', sentAt: new Date(), outreachId },
    });

    if (t.broadcast.templateId)
      await this.prisma.db.whatsappTemplate.update({
        where: { id: t.broadcast.templateId },
        data: { usageCount: { increment: 1 } },
      });

    await this.refreshState(t.broadcastId);
    return row;
  }

  async skip(targetId: string, note: string, actorName: string) {
    const row = await this.prisma.db.broadcastTarget.update({
      where: { id: targetId },
      data: { state: 'SKIPPED', note: note || 'skipped by hand' },
    });
    await this.audit.record({
      entityType: 'BroadcastTarget', entityId: targetId, action: 'UPDATE', actorName,
      changes: { skipped: true, note },
    });
    await this.refreshState(row.broadcastId);
    return row;
  }

  private async refreshState(broadcastId: string) {
    const left = await this.prisma.db.broadcastTarget.count({
      where: { broadcastId, state: 'PENDING' },
    });
    const done = await this.prisma.db.broadcastTarget.count({
      where: { broadcastId, state: { not: 'PENDING' } },
    });
    await this.prisma.db.broadcast.update({
      where: { id: broadcastId },
      data: { state: left === 0 ? 'DONE' : done > 0 ? 'SENDING' : 'DRAFT' },
    });
  }

  async removeBroadcast(id: string, actorName: string) {
    await this.prisma.db.broadcast.update({ where: { id }, data: { deletedAt: new Date(), actorName } });
    await this.audit.record({ entityType: 'Broadcast', entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /* ================= did it work ================= */

  async effect(broadcastId: string) {
    const targets = await this.prisma.db.broadcastTarget.findMany({
      where: { broadcastId, state: 'SENT' },
      select: { customerId: true, sentAt: true },
    });
    if (targets.length === 0) return { sent: 0, ordered: 0, revenuePaisa: 0 };

    const orders = await this.prisma.db.order.findMany({
      where: {
        customerId: { in: targets.map((t) => t.customerId) },
        salesStatus: { not: 'cancelled' },
        placedAt: { gte: new Date(Math.min(...targets.map((t) => t.sentAt!.getTime()))) },
      },
      select: { customerId: true, placedAt: true, totalPaisa: true, vatPaisa: true },
    });

    let ordered = 0;
    let revenue = 0;
    for (const t of targets) {
      const hit = orders.find(
        (o) =>
          o.customerId === t.customerId &&
          t.sentAt !== null &&
          o.placedAt >= t.sentAt &&
          o.placedAt.getTime() - t.sentAt.getTime() <= 14 * 864e5,
      );
      if (hit) {
        ordered += 1;
        revenue += hit.totalPaisa - hit.vatPaisa;
      }
    }
    return { sent: targets.length, ordered, revenuePaisa: revenue };
  }
}

/** {customer} {shop} {last_order} — anything unknown is left alone rather than
    replaced with the word "undefined" in front of a customer */
function fill(body: string, v: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (whole, key: string) =>
    v[key] !== undefined && v[key] !== '' ? v[key] : whole,
  );
}
